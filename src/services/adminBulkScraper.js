import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { scrapeJSearch } from './jobScraperService.js';

const CATEGORIES = [
  { name: 'Data Science', keywords: ['Data Scientist', 'Data Science', 'Data Analyst'] },
  { name: 'Full Stack Developer', keywords: ['Full Stack Developer', 'MERN Developer', 'Full Stack Engineer'] },
  { name: 'Machine Learning', keywords: ['ML Engineer', 'Machine Learning', 'Computer Vision Engineer'] },
  { name: 'AI Engineer', keywords: ['AI Engineer', 'Artificial Intelligence Engineer'] },
  { name: 'Python Developer', keywords: ['Python Developer', 'Python Engineer'] },
  { name: 'MERN Stack Developer', keywords: ['MERN Stack Developer', 'MERN Stack'] },
  { name: 'Frontend Developer', keywords: ['Frontend Developer', 'Front End Engineer', 'React Developer'] },
  { name: 'Backend Developer', keywords: ['Backend Developer', 'Back End Engineer', 'Node.js Developer'] },
  { name: 'React Developer', keywords: ['React Developer', 'React.js Engineer'] },
  { name: 'Next.js Developer', keywords: ['Next.js Developer', 'NextJS Engineer'] },
  { name: 'Node.js Developer', keywords: ['Node.js Developer', 'NodeJS Engineer'] },
  { name: 'GenAI / LLM Engineer', keywords: ['GenAI Engineer', 'LLM Engineer', 'Generative AI'] },
  { name: 'Data Analyst', keywords: ['Data Analyst', 'Business Data Analyst'] },
  { name: 'Deep Learning Engineer', keywords: ['Deep Learning Engineer', 'Deep Learning'] },
  { name: 'NLP Engineer', keywords: ['NLP Engineer', 'Natural Language Processing'] },
];

function generateJobHash(title, company, location) {
  const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const data = `${normalize(title)}-${normalize(company)}-${normalize(location)}`;
  return crypto.createHash('md5').update(data).digest('hex');
}

export async function runAdminBulkSync(selectedCategory = null, onProgress = () => {}) {
  const log = (msg) => {
    console.log(msg);
    onProgress(msg);
  };

  log('[Admin Bulk Sync] Starting bulk job sync via RapidAPI JSearch...');
  let totalSaved = 0;
  
  // We will no longer delete all old jobs upfront. 
  // If the API quota is exceeded, we want to at least keep the existing data!
  if (!selectedCategory) {
    log('[Admin Bulk Sync] Full sync requested. Starting scrape...');
  }

  const categoriesToRun = selectedCategory 
    ? CATEGORIES.filter(c => c.name === selectedCategory)
    : CATEGORIES;

  if (categoriesToRun.length === 0) {
    log(`[Admin Bulk Sync] Error: Category "${selectedCategory}" not found.`);
    return { success: false, totalSaved: 0 };
  }

  for (const category of categoriesToRun) {
    log(`[Admin Bulk Sync] Processing Category: ${category.name}`);
    
    const primaryKeyword = category.keywords[0];
    const location = 'Remote';
    
    log(`[Admin Bulk Sync] Starting RapidAPI JSearch for ${primaryKeyword}...`);
    const jobs = await scrapeJSearch(primaryKeyword, location);

    // Deduplication Rule
    const uniqueJobsMap = new Map();
    for (const job of jobs) {
      if (!job.url) continue;
      
      const hash = generateJobHash(job.title, job.company, job.location);
      
      if (uniqueJobsMap.has(hash)) {
        const existing = uniqueJobsMap.get(hash);
        const priorities = { 'LinkedIn': 3, 'Naukri': 2, 'Indeed': 1 };
        const currentPriority = priorities[job.source] || 0;
        const existingPriority = priorities[existing.source] || 0;
        
        if (currentPriority > existingPriority) {
          uniqueJobsMap.set(hash, job);
        }
      } else {
        uniqueJobsMap.set(hash, job);
      }
    }

    let finalJobs = Array.from(uniqueJobsMap.values());
    finalJobs = finalJobs.slice(0, 10);
    log(`[Admin Bulk Sync] Found ${finalJobs.length} unique jobs for ${category.name}`);

    if (finalJobs.length > 0) {
      // Map to ai_search table schema
      const mappedJobs = finalJobs.map(job => ({
        id: `admin-ai-${hashJobToId(job.title, job.company, job.location)}`,
        job_title: job.title,
        company_name: job.company || 'Unknown',
        location: job.location || 'Remote',
        salary: job.salary || null,
        experience: job.min_experience_years !== undefined ? String(job.min_experience_years) : null,
        skills: Array.isArray(job.skills_required) ? job.skills_required.join(', ') : (job.skills_required || ''),
        job_description: job.description || '',
        apply_url: job.url,
        platform: job.source,
        employment_type: 'Full-time', // default
        remote: String(job.location || '').toLowerCase().includes('remote'),
        posted_at: job.posted_at || new Date().toISOString(),
        scraped_at: new Date().toISOString(),
        job_category: category.name,
        source: 'AI Bulk Sync',
        company_logo: null,
        is_admin_synced: true,
        sync_time: new Date().toISOString()
      }));

      // Store in Supabase using UPSERT logic
      const { error } = await supabase
        .from('ai_search')
        .upsert(mappedJobs, { onConflict: 'id' });

      if (error) {
        log(`[Admin Bulk Sync] Error upserting jobs for ${category.name}: ${error.message}`);
      } else {
        totalSaved += mappedJobs.length;
        log(`[Admin Bulk Sync] Successfully saved ${mappedJobs.length} jobs for ${category.name}.`);
      }
    }
  }

  log(`[Admin Bulk Sync] Completed! Total jobs saved: ${totalSaved}`);
  return { success: true, totalSaved };
}

function hashJobToId(title, company, location) {
  const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const data = `${normalize(title)}-${normalize(company)}-${normalize(location)}`;
  return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
}
