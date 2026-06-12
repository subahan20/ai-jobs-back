import { runAllScrapers } from '../services/jobScraperService.js';
import {
  appendSearchLog,
  createSearchSession,
  getSearchSession,
  updateSearchSession,
} from '../utils/aiSearchSessionStore.js';
import { createUserSupabase, supabase as adminSupabase } from '../config/supabase.js';
import { getAccessToken } from '../utils/accessToken.js';
import { resolveUserId } from '../utils/resolveUserId.js';
import { calculateMatchScore } from '../utils/aiSearchHelpers.js';

export const triggerAiSearch = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const userSupabase = createUserSupabase(accessToken);
    const { role = '', skills = '', experience = 0, location = '' } = req.body || {};

    if (!role.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Preferred role is required to run AI search.',
      });
    }

    const searchId = `aisearch_${Math.random().toString(36).slice(2, 12)}`;

    const searchMeta = {
      role: role.trim(),
      skills: String(skills || '').trim(),
      experience: Number(experience) || 0,
      location: String(location || '').trim(),
    };

    await createSearchSession({ id: searchId, userId, searchMeta }, userSupabase);

    // Floating Promise for background execution
    runAllScrapers(searchMeta.role, searchMeta.location)
      .then(async (jobs) => {
        const session = await getSearchSession(searchId, userId, userSupabase);
        const logs = [
          ...(session?.logs || []),
          `Saved ${jobs.length} jobs to global jobs table.`,
        ];

        await updateSearchSession(searchId, userId, {
          status: 'completed',
          logs,
        }, userSupabase);
      })
      .catch(async (err) => {
        const errorMessage = err?.message || 'AI search failed.';
        const session = await getSearchSession(searchId, userId, userSupabase);
        const logs = [...(session?.logs || []), `[ERROR] ${errorMessage}`];

        await updateSearchSession(searchId, userId, {
          status: 'failed',
          error: errorMessage,
          logs,
        }, userSupabase);
      });

    return res.status(200).json({
      success: true,
      searchId,
      message: 'AI scraping started in the background. Poll /api/ai-search/status/:searchId for results.',
    });
  } catch (err) {
    next(err);
  }
};

export const getAiSearchStatus = async (req, res, next) => {
  try {
    const { searchId } = req.params;
    const userId = resolveUserId(req);
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const userSupabase = createUserSupabase(accessToken);
    const session = await getSearchSession(searchId, userId, userSupabase);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Search session not found.',
      });
    }

    let jobs = [];
    let byPlatform = {};

    if (session.status === 'completed') {
      // Fetch relevant jobs from global pool
      const roleSearch = session.role_searched || '';
      const userSkills = (session.skills_searched || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const experienceYears = Number(session.experience_searched) || 0;
      
      let query = adminSupabase.from('ai_search_jobs').select('*');
      if (roleSearch) {
        query = query.or(`title.ilike.%${roleSearch}%,description.ilike.%${roleSearch}%`);
      }

      const { data } = await query.order('created_at', { ascending: false }).limit(200);
      
      if (data) {
        // Calculate match scores and filter
        const scoredJobs = data.map(job => {
          // Normalize job structure for match calculation
          const mappedJob = {
            id: job.id,
            title: job.title,
            company: job.company,
            description: job.description,
            skillsRequired: job.skills_required || [],
            minExperienceYears: job.min_experience_years,
            postedTime: job.created_at,
            source: job.platform,
            url: job.url,
            location: job.location,
            salary: job.salary,
            logo_url: null
          };
          const score = calculateMatchScore(mappedJob, roleSearch, userSkills, experienceYears);
          return { ...mappedJob, matchScore: score, skillsMatchPercent: score };
        });

        // Filter out jobs that completely failed strict matching
        const relevantJobs = scoredJobs.filter(job => job.matchScore > 0);

        // Sort by match score descending
        relevantJobs.sort((a, b) => b.matchScore - a.matchScore);
        
        // Take top 50 matches
        jobs = relevantJobs.slice(0, 50);

        byPlatform = jobs.reduce((acc, job) => {
          const key = job.source || job.platform;
          if (!acc[key]) acc[key] = [];
          acc[key].push(job);
          return acc;
        }, {});
      }
    }

    return res.status(200).json({
      success: true,
      status: session.status,
      jobs,
      byPlatform,
      logs: session.logs || [],
      error: session.error,
    });
  } catch (err) {
    next(err);
  }
};

export const listAiSearchJobs = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    
    // Fetch user profile
    const userSupabase = createUserSupabase(accessToken);
    const { data: profile } = await userSupabase
      .from('profile')
      .select('preferred_role, core_skills, work_experience')
      .eq('id', userId)
      .single();

    const roleSearch = profile?.preferred_role || '';
    const userSkillsStr = Array.isArray(profile?.core_skills) ? profile.core_skills.join(', ') : (profile?.core_skills || '');
    const userSkills = userSkillsStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const experienceYears = Number(profile?.work_experience) || 0;

    const { platform } = req.query;

    let query = adminSupabase.from('ai_search').select('*').eq('platform', 'LinkedIn');
    if (platform) {
      query = query.eq('platform', platform);
    }
    const { data } = await query.order('sync_time', { ascending: false }).limit(500);

    let jobs = data ? data.map(job => {
      const mappedJob = {
        id: job.id,
        title: job.job_title,
        company: job.company_name,
        location: job.location,
        salary: job.salary,
        skillsRequired: job.skills ? job.skills.split(', ') : [],
        description: job.job_description,
        url: job.apply_url,
        source: job.platform,
        platform: job.platform,
        postedTime: job.posted_at,
        postedAt: job.posted_at,
        createdAt: job.sync_time,
        roleSearched: job.job_category,
        skillsSearched: userSkillsStr,
        minExperienceYears: Number(job.experience) || 0
      };

      if (roleSearch || userSkills.length > 0) {
        const score = calculateMatchScore(mappedJob, roleSearch, userSkills, experienceYears);
        mappedJob.matchScore = score;
        mappedJob.skillsMatchPercent = score;
      } else {
        mappedJob.matchScore = 100;
        mappedJob.skillsMatchPercent = 100;
      }

      return mappedJob;
    }) : [];

    if (roleSearch || userSkills.length > 0) {
      jobs = jobs.filter(job => job.matchScore > 0);
      jobs.sort((a, b) => b.matchScore - a.matchScore);
      jobs = jobs.slice(0, 20);
    } else {
      jobs = jobs.slice(0, 20);
    }

    const byPlatform = jobs.reduce((acc, job) => {
      const key = job.source;
      if (!acc[key]) acc[key] = [];
      acc[key].push(job);
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      total: jobs.length,
      byPlatform,
      jobs,
      userRole: roleSearch,
    });
  } catch (err) {
    next(err);
  }
};


