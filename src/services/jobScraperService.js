import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { calculateMatchScore } from '../utils/aiSearchHelpers.js';

const LOGO_COLORS = [
  'bg-indigo-600 text-white',
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-cyan-800 text-white',
  'bg-red-500 text-white',
  'bg-orange-500 text-white',
  'bg-sky-600 text-white',
  'bg-amber-600 text-white'
];

export function generateJobHash(title, company, location) {
  const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const data = `${normalize(title)}-${normalize(company)}-${normalize(location)}`;
  return crypto.createHash('md5').update(data).digest('hex');
}

const deduceExperienceLevel = (months) => {
  const minExp = (months || 0) / 12;
  if (minExp <= 1) return 'Junior';
  if (minExp <= 3) return 'Mid';
  if (minExp <= 7) return 'Senior';
  return 'Lead';
};

export async function scrapeJSearch(keyword, location) {
  try {
    console.log(`[JSearch API] Starting live scrape for "${keyword}" in "${location}"`);
    
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent('LinkedIn ' + keyword + ' in ' + location)}&page=1&num_pages=1`;

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    };

    const response = await fetch(url, options);
    if (!response.ok) {
      const errData = await response.text();
      console.warn(`[JSearch API] Error ${response.status}: ${errData}`);
      return [];
    }
    
    const json = await response.json();
    const items = json.data || [];
    
    const validJobs = items.map((job) => {
      const urlLower = (job.job_apply_link || '').toLowerCase();
      const pubLower = (job.job_publisher || '').toLowerCase();

      const title = job.job_title || 'Unknown Title';
      const company = job.employer_name || 'Unknown Company';
      const dedupeHash = generateJobHash(title, company, location);

      let mappedSource = 'LinkedIn';
      if (pubLower.includes('naukri') || urlLower.includes('naukri')) return null;
      else if (pubLower.includes('indeed') || urlLower.includes('indeed')) return null;
      else if (pubLower.includes('glassdoor')) return null;
      else if (job.job_publisher && !pubLower.includes('linkedin')) return null;

      return {
        id: `scraped-${dedupeHash}`,
        title: title,
        company: company,
        logo_url: job.employer_logo || null,
        logo_color: LOGO_COLORS[Math.floor(Math.random() * LOGO_COLORS.length)],
        source: mappedSource,
        experience_level: job.job_required_experience?.required_experience_in_months ? deduceExperienceLevel(job.job_required_experience.required_experience_in_months) : 'Mid-Level',
        min_experience_years: job.job_required_experience?.required_experience_in_months ? Math.floor(job.job_required_experience.required_experience_in_months / 12) : 2,
        skills_required: job.job_required_skills || [],
        salary: job.job_min_salary ? `$${job.job_min_salary} - $${job.job_max_salary}` : 'Not Disclosed',
        location: job.job_city && job.job_state ? `${job.job_city}, ${job.job_state}` : location,
        description: job.job_description || 'No description provided.',
        posted_time: job.job_posted_at_datetime_utc || new Date().toISOString(),
        posted_at: job.job_posted_at_datetime_utc || new Date().toISOString(),
        url: job.job_apply_link || 'https://linkedin.com/jobs',
        status: 'Active',
        employment_type: job.job_employment_type || 'Full-time',
        category: 'Engineering',
        remote_on_site: job.job_is_remote ? 'Remote' : 'On-site',
        publish_state: 'Published',
        posted_by: 'AI Scraper',
      };
    });

    return validJobs.filter(Boolean);

  } catch (error) {
    console.error(`[JSearch Error]:`, error.message);
    return []; 
  }
}

export async function runAllScrapers(keyword, location, userId, searchMeta) {
  console.log(`[Scraper] Starting RapidAPI JSearch for "${keyword}" in "${location}"`);
  
  const finalJobsRaw = await scrapeJSearch(keyword, location);

  const uniqueJobsMap = new Map();
  for (const job of finalJobsRaw) {
    if (!job.url) continue; 
    if (!uniqueJobsMap.has(job.id)) {
      uniqueJobsMap.set(job.id, job);
    }
  }

  let finalJobs = Array.from(uniqueJobsMap.values());
  
  if (userId && searchMeta) {
    const userSkills = (searchMeta.skills || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const roleSearch = searchMeta.role;
    const experienceYears = Number(searchMeta.experience) || 0;

    finalJobs = finalJobs.filter(job => {
      const mappedJob = {
        title: job.title,
        description: job.description,
        skillsRequired: job.skills_required || [],
        minExperienceYears: job.min_experience_years
      };
      const score = calculateMatchScore(mappedJob, roleSearch, userSkills, experienceYears);
      return score > 0;
    });
  }

  finalJobs = finalJobs.slice(0, 10);
  console.log(`[Scraper] Finished scraping. Found ${finalJobs.length} highly relevant unique jobs.`);
  
  if (finalJobs.length > 0 && userId && searchMeta) {
    await saveScrapedJobsToAiSearch(finalJobs, userId, searchMeta);
  }

  return finalJobs;
}

export async function saveScrapedJobsToAiSearch(jobs, userId, searchMeta) {
  console.log(`[Scraper DB] Inserting ${jobs.length} jobs to 'ai_search' table...`);
  
  const mappedJobs = jobs.map(job => {
    const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const data = `${normalize(job.title)}-${normalize(job.company)}-${normalize(job.location)}`;
    const hash = crypto.createHash('md5').update(data).digest('hex').substring(0, 16);

    return {
      id: `ai-${hash}`,
      job_title: job.title || 'Unknown Title',
      company_name: job.company || 'Unknown Company',
      location: job.location || 'Remote',
      salary: job.salary || null,
      experience: job.min_experience_years !== undefined ? String(job.min_experience_years) : null,
      skills: Array.isArray(job.skills_required) ? job.skills_required.join(', ') : (job.skills_required || ''),
      job_description: job.description || '',
      apply_url: job.url,
      platform: job.source,
      employment_type: job.employment_type || 'Full-time',
      remote: String(job.location || '').toLowerCase().includes('remote'),
      posted_at: job.posted_at || new Date().toISOString(),
      scraped_at: new Date().toISOString(),
      job_category: searchMeta.role || 'General',
      source: 'AI User Sync',
      company_logo: job.logo_url || null,
      is_admin_synced: false,
      sync_time: new Date().toISOString()
    };
  });

  const { error } = await supabase
    .from('ai_search')
    .upsert(mappedJobs, { onConflict: 'id' });
  
  if (error) {
    console.error(`[Scraper DB Error] Failed to insert ai_search:`, error.message);
  } else {
    console.log(`[Scraper DB] Successfully saved ${mappedJobs.length} jobs to ai_search.`);
  }
}
