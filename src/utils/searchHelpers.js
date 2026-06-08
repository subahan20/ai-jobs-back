import { ApifyClient } from 'apify-client';
import { supabase } from '../config/supabase.js';

// ─── Module-Level Constants ────────────────────────────────────────────────────
// Defined once at module scope — never re-created on each function call.

const SKILL_DICTIONARY = {
  react: 'React.js', 'react.js': 'React.js', reactjs: 'React.js',
  angular: 'Angular', vue: 'Vue.js', node: 'Node.js', 'node.js': 'Node.js',
  express: 'Express.js', typescript: 'TypeScript', javascript: 'JavaScript',
  js: 'JavaScript', ts: 'TypeScript', python: 'Python', django: 'Django',
  flask: 'Flask', java: 'Java', spring: 'Spring Boot', kotlin: 'Kotlin',
  swift: 'Swift', docker: 'Docker', kubernetes: 'Kubernetes', k8s: 'Kubernetes',
  aws: 'AWS', azure: 'Azure', gcp: 'GCP', 'next.js': 'Next.js', nextjs: 'Next.js',
  tailwind: 'TailwindCSS', tailwindcss: 'TailwindCSS', css: 'CSS3', html: 'HTML5',
  sql: 'SQL', mongodb: 'MongoDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL',
  graphql: 'GraphQL', redux: 'Redux', git: 'Git',
};

// Pre-computed key list — avoids Object.keys() on every deduceSkills call
const SKILL_DICTIONARY_KEYS = Object.keys(SKILL_DICTIONARY);

const DATE_KEYWORDS = new Set(['recently', 'active', 'just now', 'today']);

const MS_UNITS = {
  min: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
};
// Pre-computed key list — avoids Object.keys() on every parseDateStringToMs call
const MS_UNIT_KEYS = Object.keys(MS_UNITS);

const LOGO_COLORS = [
  'bg-indigo-600 text-white', 'bg-blue-600 text-white', 'bg-red-500 text-white',
  'bg-emerald-600 text-white', 'bg-cyan-800 text-white', 'bg-orange-500 text-white',
  'bg-sky-600 text-white', 'bg-amber-600 text-white',
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ─── Pure Utility Helpers ──────────────────────────────────────────────────────

/**
 * Slugifies a string for use in URLs (e.g. Naukri job-listing deep links).
 * Module-level so it is defined once, not re-created inside every .map() iteration.
 */
const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Strips HTML tags from a string and collapses whitespace.
 * Used to sanitize descriptions before sending to AI (reduces token count).
 */
const stripHtml = (html) =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Exported Pure Functions ───────────────────────────────────────────────────

/**
 * Maps years of experience to LinkedIn's numeric experience-level filter codes.
 */
export function mapExperienceToFE(years) {
  if (years <= 0)  return '1'; // Internship
  if (years === 1) return '2'; // Entry level
  if (years <= 3)  return '3'; // Associate
  if (years <= 7)  return '4'; // Mid-Senior level
  if (years <= 12) return '5'; // Director
  return '6';                  // Executive
}

/**
 * Parses Naukri's experience strings ("2-5 yrs", "3 yrs") into a numeric minimum.
 */
export function parseNaukriExperience(expStr) {
  if (typeof expStr === 'number') return expStr;
  if (!expStr || typeof expStr !== 'string') return 0;
  const match = expStr.match(/(\d+)\s*(?:-|to)\s*(\d+)/i) || expStr.match(/(\d+)\s*yrs?/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Returns a human-readable experience tier label from minimum years required.
 */
export function getExperienceLevel(minYears) {
  if (minYears <= 1) return 'Junior';
  if (minYears <= 3) return 'Mid';
  if (minYears <= 7) return 'Senior';
  return 'Lead';
}

/**
 * Infers a job's minimum experience requirement from seniority keywords in the title.
 */
function inferMinExpFromTitle(titleLower) {
  if (titleLower.includes('lead') || titleLower.includes('architect'))                          return 8;
  if (titleLower.includes('senior') || titleLower.includes('sr.'))                             return 5;
  if (titleLower.includes('junior') || titleLower.includes('jr.') || titleLower.includes('intern')) return 0;
  return 1;
}

/**
 * Deduces relevant skills from a job title and description.
 * Uses the user's own skill list first, then falls back to the dictionary.
 * Does NOT pad with random skills — fake skills pollute AI match scoring.
 */
export function deduceSkills(title, description, userSkills) {
  const titleLower = title.toLowerCase();
  const descLower  = description.toLowerCase();
  const found      = new Set();

  for (const skill of userSkills) {
    const clean = skill.trim().toLowerCase();
    if (clean && (titleLower.includes(clean) || descLower.includes(clean))) {
      found.add(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  for (const key of SKILL_DICTIONARY_KEYS) {
    if (titleLower.includes(key) || descLower.includes(key)) {
      found.add(SKILL_DICTIONARY[key]);
    }
  }

  return Array.from(found);
}

/**
 * Converts human-readable date strings ("2 days ago", "today") to ms timestamps.
 */
export function parseDateStringToMs(dateStr) {
  if (!dateStr) return 0;
  const clean = dateStr.trim().toLowerCase();

  if (DATE_KEYWORDS.has(clean)) return Date.now();

  const match = clean.match(/(\d+)\s*(day|hour|min|month|week)s?\s*ago/);
  if (match) {
    const val  = parseInt(match[1], 10);
    const unit = MS_UNIT_KEYS.find((u) => match[2].startsWith(u));
    return unit ? Date.now() - val * MS_UNITS[unit] : Date.now();
  }

  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Local (non-AI) job scoring fallback.
 * Uses a Set for O(1) skill lookups instead of O(n) array.includes().
 */
export function calculateJobMatches(jobs, role, userSkills, experienceYears) {
  const roleWords     = role.toLowerCase().split(/\s+/).filter(Boolean);
  const userSkillsSet = new Set(userSkills.map((s) => s.toLowerCase()));

  return jobs.map((job) => {
    const skillsRequired = job.skillsRequired || [];
    const skillsLower    = skillsRequired.map((s) => s.toLowerCase());

    const matched = skillsRequired.filter((_, i) => userSkillsSet.has(skillsLower[i]));
    const missing = skillsRequired.filter((_, i) => !userSkillsSet.has(skillsLower[i]));

    const skillScore       = skillsRequired.length ? (matched.length / skillsRequired.length) * 40 : 0;
    const yearDiff         = experienceYears - (job.minExperienceYears || 0);
    const experienceScore  = yearDiff >= 0 ? 30 : (yearDiff === -1 ? 15 : 0);
    const titleLower       = (job.title || '').toLowerCase();
    const hasFullRoleMatch = roleWords.length > 0 && roleWords.every((w) => titleLower.includes(w));
    const hasPartialMatch  = roleWords.some((w) => titleLower.includes(w));
    const roleScore        = hasFullRoleMatch ? 30 : (hasPartialMatch ? 15 : 0);
    const score            = Math.round(skillScore + experienceScore + roleScore);

    const matchExplanation =
      score >= 80
        ? `Excellent match! You possess key skills (${matched.slice(0, 2).join(', ')}) and meet the experience criteria.`
        : score >= 55
        ? `Good match. Matches your experience level, but you might want to add: ${missing.slice(0, 2).join(', ')}.`
        : `Partial match. Needs more skill overlap in ${missing.slice(0, 3).join(', ')}.`;

    return {
      ...job,
      score,
      matchedSkills:  matched,
      missingSkills:  missing,
      experienceMatch: yearDiff >= 0,
      roleMatch:       hasFullRoleMatch,
      matchExplanation,
    };
  });
}

/**
 * AI-powered job scoring via Groq (Llama 3.3 70B).
 * Strips HTML and truncates descriptions before sending to minimize token usage and cost.
 */
export async function calculateJobMatchesWithAI(jobs, role, skills, experience) {
  const groqKey = process.env.GROK_AI;

  if (!groqKey) {
    throw new Error('AI Service is currently unavailable. Please check your GROK_AI api key in the .env configuration.');
  }
  if (jobs.length === 0) return [];

  const jobsForPrompt = jobs.map((j) => ({
    id:                 j.id,
    title:              j.title,
    company:            j.company,
    minExperienceYears: j.minExperienceYears || 0,
    skillsRequired:     j.skillsRequired || [],
    description:        stripHtml(j.description || '').slice(0, 300),
  }));

  const prompt = `You are an expert recruitment matching engine AI.
You need to score and evaluate a list of jobs against a candidate's profile.

Candidate Profile:
- Preferred Role: "${role}"
- Experience: ${experience} years
- Candidate Skills: ${skills}

Jobs to evaluate:
${JSON.stringify(jobsForPrompt, null, 2)}

For each job, determine:
1. score: A number from 0 to 100.
   - Skill Match (40%): Compare candidate skills to job required skills.
   - Experience Match (30%): Compare candidate experience to job minExperienceYears.
   - Role Match (30%): Does candidate preferred role align with job title?
2. matchedSkills: array of candidate skills that match the job.
3. missingSkills: array of job required skills the candidate is missing.
4. experienceMatch: boolean.
5. roleMatch: boolean.
6. matchExplanation: A short explanation of the match status (under 120 characters).

Return ONLY a valid JSON object matching this structure:
{
  "evaluations": [
    {
      "id": "job-id",
      "score": 85,
      "matchedSkills": ["React", "TypeScript"],
      "missingSkills": ["Node.js"],
      "experienceMatch": true,
      "roleMatch": true,
      "matchExplanation": "Excellent fit! High skills overlap and meets experience requirements."
    }
  ]
}`;

  try {
    const aiResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:           'llama-3.3-70b-versatile',
        messages:        [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Groq AI API returned status code ${aiResponse.status}`);
    }

    const data    = await aiResponse.json();
    const content = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    if (!Array.isArray(content.evaluations)) {
      throw new Error('Groq AI returned an unexpected response shape.');
    }

    const evalMap = new Map(content.evaluations.map((e) => [e.id, e]));

    return jobs.map((job) => {
      const ev = evalMap.get(job.id);
      if (!ev) {
        return {
          ...job,
          score:            0,
          matchedSkills:    [],
          missingSkills:    job.skillsRequired || [],
          experienceMatch:  false,
          roleMatch:        false,
          matchExplanation: 'AI failed to evaluate this job listing.',
        };
      }
      return {
        ...job,
        score:            Number(ev.score) || 0,
        matchedSkills:    Array.isArray(ev.matchedSkills) ? ev.matchedSkills : [],
        missingSkills:    Array.isArray(ev.missingSkills) ? ev.missingSkills : [],
        experienceMatch:  !!ev.experienceMatch,
        roleMatch:        !!ev.roleMatch,
        matchExplanation: ev.matchExplanation || '',
      };
    });
  } catch (err) {
    console.error('[Groq AI] Match evaluation failed:', err);
    throw new Error(err instanceof Error ? err.message : 'AI Match evaluation failed.');
  }
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Primary job search pipeline:
 *   1. Scrape LinkedIn + Naukri via Apify (parallel)
 *   2. ALWAYS fetch ALL Admin Portal jobs from Supabase and merge
 *   3. Post-process: assign logo colors + construct Naukri deep-link URLs
 *   4. Cache fresh scraper results to Supabase
 *   5. Score all jobs via Groq AI (falls back to local scoring on error)
 */
export async function performJobSearchAndScrape({ role, skills: skillsString, experience: experienceYears, onLog }) {
  const userSkills = skillsString
    ? skillsString.split(',').map((s) => s.trim().toLowerCase())
    : [];

  const log = (msg) => {
    console.log(`[Job Search] ${msg}`);
    if (typeof onLog === 'function') onLog(msg);
  };

  log(`Search initiated — role: "${role}" | experience: ${experienceYears} yrs | skills: [${userSkills.join(', ')}]`);

  let jobs      = [];
  let adminJobs = [];

  // ── Step 1: Apify Scrapers (LinkedIn + Naukri) ─────────────────────────────
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (!apifyToken) {
    log('Warning: APIFY_API_TOKEN is missing. Scraper skipped.');
  } else {
    log('Triggering Apify scrapers for LinkedIn and Naukri in parallel...');
    try {
      const client = new ApifyClient({ token: apifyToken });

      const [linkedinRun, naukriRun] = await Promise.allSettled([
        client.actor('harvestapi/linkedin-job-search').call({
          jobTitles: [role], locations: ['India'], maxItems: 6, sortBy: 'date',
        }),
        client.actor('muhammetakkurtt/naukri-job-scraper').call({
          keyword: role, location: 'India', max_jobs: 6, fetch_details: false,
        }),
      ]);

      // ── LinkedIn ─────────────────────────────────────────────────────────
      if (linkedinRun.status === 'fulfilled') {
        log('LinkedIn crawler complete. Retrieving items...');
        try {
          const { items } = await client.dataset(linkedinRun.value.defaultDatasetId).listItems();
          log(`LinkedIn: ${items.length} raw results. Processing...`);

          for (const [index, item] of items.entries()) {
            const title   = item.title || item.positionName || item.jobTitle;
            const company = item.company?.name || item.companyName || item.company;
            if (!title || !company) continue;

            const desc    = item.descriptionText || item.description || `Active job opening for a ${title} at ${company}. Apply now!`;
            const minExp  = inferMinExpFromTitle(title.toLowerCase());

            let salaryStr = 'Discuss with recruiter';
            if (item.salary) {
              salaryStr = typeof item.salary === 'string'
                ? item.salary
                : (item.salary.min || item.salary.max)
                  ? `₹${item.salary.min?.toLocaleString()} - ₹${item.salary.max?.toLocaleString()} / year`
                  : salaryStr;
            }

            jobs.push({
              id:                 `linkedin-apify-${item.id || index}`,
              title:              title.trim().replace(/\s+/g, ' '),
              company:            company.trim().replace(/\s+/g, ' '),
              logoUrl:            item.company?.logo || item.companyLogo || item.logoUrl || '',
              source:             'LinkedIn',
              experienceLevel:    getExperienceLevel(minExp),
              minExperienceYears: minExp,
              skillsRequired:     deduceSkills(title, desc, userSkills),
              salary:             salaryStr,
              location:           item.location?.parsed?.text || item.location?.linkedinText || item.location || 'India',
              description:        desc,
              postedTime:         item.postedDate ? new Date(item.postedDate).toLocaleDateString() : (item.postedTime || 'Recently'),
              url:                item.linkedinUrl || item.jobUrl || item.url || `https://www.linkedin.com/jobs/view/${item.id || index}`,
            });
          }
        } catch (err) {
          console.error('[Apify] Failed to parse LinkedIn dataset:', err);
        }
      } else {
        log('LinkedIn crawler execution failed.');
      }

      // ── Naukri ───────────────────────────────────────────────────────────
      if (naukriRun.status === 'fulfilled') {
        log('Naukri crawler complete. Retrieving items...');
        try {
          const { items } = await client.dataset(naukriRun.value.defaultDatasetId).listItems();
          log(`Naukri: ${items.length} raw results. Processing...`);

          for (const [index, item] of items.entries()) {
            const title   = item.jobTitle || item.title || item.positionName;
            const company = item.company || item.companyName;
            if (!title || !company) continue;

            const desc   = item.description || item.jobDescription || `Active job opening for a ${title} at ${company}. Apply now!`;
            const minExp = parseNaukriExperience(item.experience);

            jobs.push({
              id:                 `naukri-apify-${item.id || index}`,
              title:              title.trim().replace(/\s+/g, ' '),
              company:            company.trim().replace(/\s+/g, ' '),
              logoUrl:            item.logoUrl || '',
              source:             'Naukri',
              experienceLevel:    getExperienceLevel(minExp),
              minExperienceYears: minExp,
              skillsRequired:     deduceSkills(title, desc, userSkills),
              salary:             item.salary || 'Not Disclosed',
              location:           item.location || 'India',
              description:        desc,
              postedTime:         item.postedTime || 'Recently',
              url:                item.link || item.url || '',
            });
          }
        } catch (err) {
          console.error('[Apify] Failed to parse Naukri dataset:', err);
        }
      } else {
        log('Naukri crawler execution failed.');
      }
    } catch (apifyErr) {
      console.error('[Apify] Scraper run failed:', apifyErr);
      log(`Crawler engine error: ${apifyErr.message}`);
    }
  }

  // ── Step 2: Always fetch ALL Admin Portal jobs — no role filter ────────────
  // Every job the admin adds must ALWAYS appear in the user's results,
  // regardless of what role keyword the user searched for.
  log('Fetching all Admin Portal jobs from Supabase...');
  try {
    const { data: dbJobs, error: dbErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('source', 'Admin Portal');

    if (dbErr) {
      log(`Admin Portal DB query error: ${dbErr.message}`);
    } else if (dbJobs?.length > 0) {
      log(`Found ${dbJobs.length} Admin Portal job(s). Merging...`);

      // De-duplicate: skip any admin job whose ID already exists in scraped results
      const scrapedIds = new Set(jobs.map((j) => j.id));

      adminJobs = dbJobs
        .filter((row) => !scrapedIds.has(row.id))
        .map((row) => ({
          id:                 row.id,
          title:              row.title,
          company:            row.company,
          logoUrl:            row.logo_url || '',
          logoColor:          row.logo_color || LOGO_COLORS[0],
          source:             row.source || 'Admin Portal',
          experienceLevel:    row.experience_level,
          minExperienceYears: row.min_experience_years || 0,
          skillsRequired:     row.skills_required || [],
          salary:             row.salary,
          location:           row.location,
          description:        row.description,
          postedTime:         row.posted_time,
          url:                row.url,
        }));

      jobs = [...jobs, ...adminJobs];
      log(`Total after merge: ${jobs.length} jobs (${jobs.length - adminJobs.length} scraped + ${adminJobs.length} admin).`);
    } else {
      log('No Admin Portal jobs found in database.');
    }
  } catch (dbErr) {
    console.error('[Admin DB] Query error:', dbErr);
  }

  if (jobs.length === 0) {
    throw new Error('No jobs found matching your criteria.');
  }

  log(`Aggregated ${jobs.length} job postings. Post-processing...`);

  // ── Step 3: Post-process — logo colors + Naukri deep-link URLs ────────────
  jobs = jobs.map((job, index) => {
    job.logoColor = LOGO_COLORS[index % LOGO_COLORS.length];

    if (job.source === 'Naukri' && (!job.url || job.url.includes('search') || !job.url.includes('job-listings'))) {
      const minExp    = job.minExperienceYears || 0;
      const maxExpMap = { Junior: 4, Mid: 5, Senior: 8 };
      const maxExp    = maxExpMap[job.experienceLevel] ?? 12;
      const cleanId   = job.id.replace(/[^0-9]/g, '') || '240524500185';
      const randomSid = `178057547${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;

      job.url = `https://www.naukri.com/job-listings-${slugify(job.title)}-${slugify(job.company)}-${slugify(job.location)}-${minExp}-to-${maxExp}-years-${cleanId}?src=directSearch&sid=${randomSid}&xp=${index + 1}&px=1`;
    }

    return job;
  });

  // ── Step 4: Cache fresh scraper results to Supabase ───────────────────────
  // Only upsert scraped jobs — admin jobs are already in DB (source of truth).
  const scrapedOnly = jobs.filter((j) => j.source !== 'Admin Portal');
  if (scrapedOnly.length > 0) {
    try {
      log('Caching scraper results to Supabase...');
      const rows = scrapedOnly.map((job) => ({
        id:                   job.id,
        title:                job.title,
        company:              job.company,
        logo_url:             job.logoUrl || null,
        logo_color:           job.logoColor,
        source:               job.source,
        experience_level:     job.experienceLevel,
        min_experience_years: job.minExperienceYears,
        skills_required:      job.skillsRequired,
        salary:               job.salary,
        location:             job.location,
        description:          job.description,
        posted_time:          job.postedTime,
        url:                  job.url,
      }));

      const { error: dbErr } = await supabase.from('jobs').upsert(rows, { onConflict: 'id' });
      if (dbErr) {
        console.error('[Supabase Upsert] Error:', dbErr);
        log(`Cache warning: ${dbErr.message}`);
      } else {
        log('Supabase cache updated successfully.');
      }
    } catch (upsertErr) {
      console.error('[Supabase Upsert] Unexpected error:', upsertErr);
    }
  }

  // ── Step 5: AI Matchmaking ─────────────────────────────────────────────────
  log('Invoking Llama 3.3 via Groq for AI matchmaking...');
  try {
    const matchedJobs = await calculateJobMatchesWithAI(jobs, role, skillsString, experienceYears);
    log('AI scoring complete.');
    return matchedJobs;
  } catch (aiErr) {
    console.warn('[Groq AI] Falling back to local scoring algorithm.', aiErr.message);
    log('Groq AI unavailable. Using local scoring fallback...');
    const matchedJobs = calculateJobMatches(jobs, role, userSkills, experienceYears);
    log('Local scoring complete.');
    return matchedJobs;
  }
}
