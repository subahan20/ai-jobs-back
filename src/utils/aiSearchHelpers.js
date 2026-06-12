import { supabase } from '../config/supabase.js';
import { getExperienceLevel, parseNaukriExperience } from './searchHelpers.js';
import {
  formatPostedTime,
  getMaxJobAgeDays,
  getRecentCutoffDate,
  isExplicitlyOldPosted,
  resolvePostedAt,
  toIsoTimestamp,
} from './postedDateUtils.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_API_URL = 'https://api.tavily.com/search';

const PLATFORMS = [
  { name: 'LinkedIn', domain: 'linkedin.com' },
  { name: 'Naukri', domain: 'naukri.com' },
  { name: 'Indeed', domain: 'indeed.com' },
];

const LOGO_COLORS = [
  'bg-indigo-600 text-white',
  'bg-blue-600 text-white',
  'bg-red-500 text-white',
  'bg-emerald-600 text-white',
];

const GENERIC_SEARCH_URL_PATTERNS = [
  /linkedin\.com\/jobs\/search/i,
  /naukri\.com\/(?!job-listings)/i, // STRICT: Naukri URLs MUST contain 'job-listings'
  /naukri\.com\/.*-jobs(-in-)?/i, // Catch any trailing '-jobs' patterns just in case
  /indeed\.com\/jobs\?/i,
  /glassdoor\.co\.in\/Job\//i,
  /foundit\.in\/srp/i,
  /internshala\.com\/internships\//i,
  /wellfound\.com\/role\//i
];

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (['n/a', 'na', 'none', 'null', 'unknown', 'not available', 'not disclosed', 'tbd'].includes(lower)) {
    return null;
  }
  return text;
}

function parseSkillsList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => cleanText(s)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((s) => cleanText(s)).filter(Boolean);
  return [];
}

function isGenericSearchUrl(url = '') {
  try {
    const parsed = new URL(url);
    return GENERIC_SEARCH_URL_PATTERNS.some((pattern) => pattern.test(parsed.href));
  } catch {
    return true;
  }
}

function resolveMinExperience(item) {
  if (item.experience === null || item.experience === undefined || item.experience === '') return null;
  const asNumber = Number(item.experience);
  if (!Number.isNaN(asNumber) && asNumber >= 0) return asNumber;
  const parsed = parseNaukriExperience(String(item.experience));
  return parsed > 0 ? parsed : null;
}

// ==========================================
// 1. AI QUERY EXPANSION
// ==========================================
async function generateSmartQueries(role, skills, experienceYears) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROK_AI;
  if (!groqKey) return [role];

  const prompt = `Act as an expert technical recruiter. Generate 3 highly relevant, distinct alternative job titles for a candidate searching for "${role}".
Candidate Skills: ${skills.join(', ')}
Candidate Experience: ${experienceYears} years

Return ONLY a JSON object: {"titles": ["title1", "title2", "title3"]}`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!res.ok) return [role];
    const data = await res.json();
    const content = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (Array.isArray(content.titles) && content.titles.length > 0) {
      return [...new Set([role, ...content.titles])];
    }
    return [role];
  } catch (err) {
    console.error('[AI Query Expansion] Failed:', err.message);
    return [role];
  }
}

// ==========================================
// 2. TAVILY TARGETED SEARCH
// ==========================================
async function tavilySearch(query, includeDomains = []) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  try {
    const body = {
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: 15,
      include_answer: false,
      include_raw_content: false,
      days: getMaxJobAgeDays(),
    };
    if (includeDomains.length) body.include_domains = includeDomains;

    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error('[AI Search][Tavily]', err.message);
    return [];
  }
}

// ==========================================
// 3. GROQ AI EXTRACTION
// ==========================================
async function extractJobsFromResults(searchResults, role, platform) {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROK_AI;
  if (!groqKey || !searchResults.length) return [];

  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nPublished: ${r.published_date || 'unknown'}\nSnippet: ${(r.content || '').slice(0, 300)}`)
    .join('\n\n');

  const prompt = `Extract real job listings from these ${platform} search results for "${role}" jobs.

${resultsText}

Return ONLY JSON:
{"jobs":[{"title":"","company":"","location":"","salary":"","description":"","url":"","experience":null,"skills":[],"posted":""}]}

Strict rules:
- Include all job listings that appear in the search results above.
- Use the exact URL from the results.
- If company, location, salary, description, experience, or skills are not explicitly stated, use "" or null — do NOT guess.
- posted must be the posting date text from the snippet or Published field.
- skills must be an array of skill names only when they are explicitly mentioned.`;

  try {
    const fetchGroq = async (modelName) => {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API Error (${modelName}): ${errText}`);
      }
      return res.json();
    };

    let data;
    try {
      data = await fetchGroq('llama-3.3-70b-versatile');
    } catch (err) {
      if (err.message.includes('Rate limit')) {
        console.warn(`[AI Search][Extract][${platform}] 70b rate limit hit, falling back to 8b.`);
        data = await fetchGroq('llama-3.1-8b-instant');
      } else {
        throw err;
      }
    }

    const content = JSON.parse(data.choices?.[0]?.message?.content || '{"jobs":[]}');
    return Array.isArray(content.jobs) ? content.jobs : [];
  } catch (err) {
    console.error(`[AI Search][Extract][${platform}] Failed:`, err.message);
    return [];
  }
}

function attachSourceMetadata(extractedJobs, searchResults) {
  return extractedJobs.map((job) => {
    const source = searchResults.find((result) => result.url && job.url && (result.url === job.url || result.url.includes(job.url) || job.url.includes(result.url)));
    if (!source) return job;

    const enriched = { ...job };
    if (!enriched.posted && source.published_date) enriched.posted = source.published_date;
    if (!enriched.posted && source.content) {
      const dateHint = source.content.match(/(?:reposted|posted)\s+\d+\s*(?:minute|hour|day|week|month|year)s?\s*ago/i);
      if (dateHint) enriched.posted = dateHint[0];
    }
    return enriched;
  });
}

function mapPlatformJob(item, platform, ts, idx) {
  const title = cleanText(item.title);
  const url = cleanText(item.url);

  if (!title || !url || isGenericSearchUrl(url)) return null;

  const postedText = cleanText(item.posted || item.postedText || item.posted_time);
  if (postedText && isExplicitlyOldPosted(postedText)) return null;

  const postedAt = resolvePostedAt({ postedAt: item.postedAt, postedText });
  const effectivePostedAt = postedAt || new Date();
  const minExperienceYears = resolveMinExperience(item);
  const skillsRequired = parseSkillsList(item.skills || item.skills_required);

  const job = {
    id: `${platform.name.toLowerCase()}-ai-${ts}-${idx}`,
    platform: platform.name,
    source: platform.name,
    title,
    url,
    applyUrl: url,
    postedAt: toIsoTimestamp(effectivePostedAt),
    postedTime: postedText || formatPostedTime(effectivePostedAt),
    logoColor: LOGO_COLORS[idx % LOGO_COLORS.length],
  };

  const company = cleanText(item.company);
  const location = cleanText(item.location);
  const salary = cleanText(item.salary);
  const description = cleanText(item.description);

  if (company) job.company = company;
  if (location) job.location = location;
  if (salary) job.salary = salary;
  if (description) job.description = description;
  if (minExperienceYears !== null) {
    job.minExperienceYears = minExperienceYears;
    job.experienceLevel = getExperienceLevel(minExperienceYears);
  }
  if (skillsRequired.length) job.skillsRequired = skillsRequired;

  return job;
}

// ==========================================
// 4. MATCH SCORING
// ==========================================
export function calculateMatchScore(job, role, userSkills, experienceYears) {
  let score = 0;
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const reqSkills = (job.skillsRequired || []).map(s => s.toLowerCase());

  let skillsHitCount = 0;
  if (userSkills.length > 0) {
    userSkills.forEach(skill => {
      const clean = skill.trim().toLowerCase();
      if (clean) {
        const safeSkill = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeSkill}\\b`, 'i');
        if (regex.test(titleLower) || regex.test(descLower) || reqSkills.some(s => regex.test(s) || s.includes(clean))) {
          skillsHitCount++;
        }
      }
    });
    
    const isDescriptionMissing = !job.description || job.description.length < 100 || job.description.includes('View the link');
    
    // STRICT SKILL MATCHING: If user provided skills, at least one MUST match, 
    // unless the description is missing entirely (in which case we rely strictly on the title)
    if (skillsHitCount === 0) {
       if (!isDescriptionMissing) {
         return 0; // Full description available, but no skills matched. Junk.
       }
       
       // If description is missing, the TITLE must strictly contain the exact role name (not just 'developer')
       const exactRoleMatch = titleLower.includes(role.toLowerCase());
       if (!exactRoleMatch) {
         return 0; 
       }
    }
    
    score += (skillsHitCount / userSkills.length) * 45;
  } else {
    score += 45;
  }

  const normalizeStr = str => (str || '').toLowerCase().replace(/[- ]/g, '');
  
  const roleNorm = normalizeStr(role);
  const titleNorm = normalizeStr(job.title);
  const categoryNorm = normalizeStr(job.roleSearched);
  
  const roleClean = roleNorm.replace('developer', '').replace('engineer', '');
  
  const exactRoleMatch = titleNorm.includes(roleNorm) || (roleClean.length > 2 && titleNorm.includes(roleClean));
  const categoryMatch = categoryNorm && (categoryNorm.includes(roleNorm) || roleNorm.includes(categoryNorm));
  
  if (exactRoleMatch || categoryMatch) {
    score += 30;
  } else {
    // STRICT ROLE MATCH: If the role doesn't match the title or category, discard the job entirely.
    return 0;
  }

  if (experienceYears >= 0) {
    const minExp = job.minExperienceYears || 0;
    if (minExp <= experienceYears) score += 15;
    else if (minExp <= experienceYears + 2) score += 7; 
  } else {
    score += 15;
  }

  const postedLower = (job.postedTime || '').toLowerCase();
  if (postedLower.includes('hour') || postedLower.includes('today') || postedLower.includes('just')) {
    score += 10;
  } else if (postedLower.includes('day') && !postedLower.includes('30')) {
    score += 5;
  } else {
    score += 2;
  }

  return Math.round(score);
}

// ==========================================
// MAIN EXPORT
// ==========================================
export async function discoverJobsFromPlatforms({ role, skills = '', experience = 0, location = '', onLog }) {
  const log = (msg) => {
    console.log(`[AI Search] ${msg}`);
    if (typeof onLog === 'function') onLog(msg);
  };
  
  if (!process.env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY is not configured on the server.');

  const userSkills = skills ? skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const experienceYears = Number(experience) || 0;
  const place = location?.trim() || 'India';

  log(`Input -> role: "${role}", location: "${place}", experience: ${experienceYears}`);

  // 1. AI Query Expansion
  const smartQueries = await generateSmartQueries(role, userSkills, experienceYears);
  log(`AI Expanded Queries: ${smartQueries.join(' | ')}`);

  const ts = Date.now();
  let discovered = [];

  // 2 & 3. Search and Extract (Parallel for each platform, using the best query)
  const bestQuery = smartQueries[0]; // Use the main expanded query to prevent rate limits
  const maxDays = getMaxJobAgeDays();
  const recencyLabel = maxDays <= 1 ? 'today' : maxDays <= 2 ? 'past 2 days' : 'past week';
  const searchTerm = `${bestQuery} jobs ${place} ${recencyLabel}`;

  const platformResults = await Promise.allSettled(
    PLATFORMS.map(async (platform) => {
      log(`Tavily: Searching ${platform.name} for "${searchTerm}"...`);
      const rawResults = await tavilySearch(searchTerm, [platform.domain]);
      
      if (!rawResults.length) return [];
      
      const resultUrls = rawResults.map(r => r.url).filter(Boolean);
      let existingJobs = [];
      
      // Check if we already have these URLs in the database
      if (resultUrls.length > 0) {
        const { data } = await supabase
          .from('ai_search_jobs')
          .select('*')
          .in('url', resultUrls);
        if (data) existingJobs = data;
      }
      
      const existingUrls = existingJobs.map(j => j.url);
      const newResults = rawResults.filter(r => r.url && !existingUrls.includes(r.url));
      
      let newMappedJobs = [];
      
      if (newResults.length > 0) {
        log(`Groq: Extracting jobs from ${newResults.length} NEW ${platform.name} results...`);
        const extracted = attachSourceMetadata(await extractJobsFromResults(newResults, role, platform.name), newResults);
        newMappedJobs = extracted.map((item, idx) => mapPlatformJob(item, platform, ts, idx)).filter(Boolean);
      } else {
        log(`${platform.name}: No new jobs found. Skipping Groq API hit completely.`);
      }
      
      // Convert existing DB jobs back to the expected memory format
      const reusedJobs = existingJobs.map(dbJob => ({
        id: dbJob.id,
        platform: dbJob.platform,
        source: dbJob.source,
        title: dbJob.title,
        url: dbJob.url,
        applyUrl: dbJob.url,
        postedAt: dbJob.posted_at,
        postedTime: dbJob.posted_time,
        logoColor: dbJob.logo_color,
        company: dbJob.company,
        location: dbJob.location,
        salary: dbJob.salary,
        description: dbJob.description,
        minExperienceYears: dbJob.min_experience_years,
        experienceLevel: dbJob.experience_level,
        skillsRequired: dbJob.skills_required ? dbJob.skills_required.split(',') : [],
      }));
      
      return [...reusedJobs, ...newMappedJobs];
    })
  );

  platformResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      discovered = discovered.concat(result.value);
    } else {
      log(`${PLATFORMS[index].name} search failed: ${result.reason?.message || 'unknown error'}`);
    }
  });

  if (!discovered.length) {
    throw new Error(`No recent jobs found for your profile. Try updating your skills or role.`);
  }

  // 4. Remove Duplicates
  const uniqueJobs = [];
  const seen = new Set();
  for (const job of discovered) {
    const key = `${(job.title || '').toLowerCase()}-${(job.company || '').toLowerCase()}-${(job.location || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueJobs.push(job);
    }
  }

  // 5. Match Score & Sort
  const scoredJobs = uniqueJobs.map(job => {
    const score = calculateMatchScore(job, role, userSkills, experienceYears);
    return { ...job, matchScore: score, skillsMatchPercent: score };
  });

  // Filter out completely irrelevant jobs
  const relevantJobs = scoredJobs.filter(job => job.matchScore > 20); // must have at least some match
  
  const finalJobs = relevantJobs.length > 0 ? relevantJobs : scoredJobs;
  finalJobs.sort((a, b) => b.matchScore - a.matchScore);

  log(`Successfully processed ${finalJobs.length} live jobs via Tavily/Groq.`);
  return finalJobs;
}

export async function saveAiSearchJobs(userId, searchMeta, jobs, client = supabase) {
  await client.from('ai_search_jobs').delete().eq('user_id', userId);

  const rows = jobs.map((job, idx) => ({
    id: job.id || `ai-search-${userId}-${Date.now()}-${idx}`,
    user_id: userId,
    platform: job.platform,
    title: job.title,
    company: job.company || null,
    location: job.location || null,
    salary: job.salary || null,
    description: job.description || null,
    url: job.url,
    skills_required: job.skillsRequired || [],
    min_experience_years: job.minExperienceYears ?? null,
    role_searched: searchMeta.role,
    skills_searched: searchMeta.skills,
    experience_searched: searchMeta.experience || 0,
    created_at: new Date().toISOString(),
  }));

  const { data, error } = await client.from('ai_search_jobs').insert(rows).select();
  if (error) throw new Error(error.message);
  return data || rows;
}

export async function getStoredAiSearchJobs(userId, platform, client = supabase) {
  const cutoff = getRecentCutoffDate().toISOString();

  let query = client
    .from('ai_search_jobs')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data, error } = await query;

  if (error?.message?.includes('posted_at')) {
    const fallback = await client
      .from('ai_search_jobs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data || [];
  }

  if (error) throw new Error(error.message);

  return (data || []).filter((row) => {
    if (!row.posted_at) return true;
    return new Date(row.posted_at).getTime() >= new Date(cutoff).getTime();
  });
}

export function mapStoredJobRow(row) {
  const title = cleanText(row.title);
  const url = cleanText(row.url);

  const job = {
    id: row.id,
    platform: cleanText(row.platform),
    source: cleanText(row.platform),
    title,
    url,
    roleSearched: row.role_searched,
    skillsSearched: row.skills_searched,
    experienceSearched: row.experience_searched,
    createdAt: row.created_at,
    postedAt: row.posted_at || null,
  };

  const company = cleanText(row.company);
  const location = cleanText(row.location);
  const salary = cleanText(row.salary);
  const description = cleanText(row.description);
  const skillsRequired = parseSkillsList(row.skills_required);
  const postedTime = cleanText(row.posted_time);

  if (company) job.company = company;
  if (location) job.location = location;
  if (salary) job.salary = salary;
  if (description) job.description = description;
  if (postedTime) job.postedTime = postedTime;
  else if (row.posted_at) job.postedTime = formatPostedTime(new Date(row.posted_at));
  if (skillsRequired.length) job.skillsRequired = skillsRequired;
  if (row.min_experience_years !== null && row.min_experience_years !== undefined) {
    job.minExperienceYears = row.min_experience_years;
  }

  return job;
}

export function groupJobsByPlatform(jobs = []) {
  return jobs.reduce((groups, job) => {
    const key = job.platform || job.source;
    if (!key) return groups;
    if (!groups[key]) groups[key] = [];
    groups[key].push(job);
    return groups;
  }, {});
}
