import {
  discoverJobsFromPlatforms,
  getStoredAiSearchJobs,
  groupJobsByPlatform,
  mapStoredJobRow,
  saveAiSearchJobs,
} from '../utils/aiSearchHelpers.js';
import {
  appendSearchLog,
  createSearchSession,
  getSearchSession,
  updateSearchSession,
} from '../utils/aiSearchSessionStore.js';
import { createUserSupabase } from '../config/supabase.js';
import { getAccessToken } from '../utils/accessToken.js';
import { resolveUserId } from '../utils/resolveUserId.js';

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

    discoverJobsFromPlatforms({
      ...searchMeta,
      onLog: (msg) => {
        appendSearchLog(searchId, userId, msg, userSupabase).catch(() => {});
      },
    })
      .then(async (jobs) => {
        const savedRows = await saveAiSearchJobs(userId, searchMeta, jobs, userSupabase);
        const mappedJobs = savedRows.map(mapStoredJobRow);
        const session = await getSearchSession(searchId, userId, userSupabase);
        const logs = [
          ...(session?.logs || []),
          `Saved ${mappedJobs.length} jobs to ai_search_jobs.`,
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
      message: 'AI search started. Poll /api/ai-search/status/:searchId for results.',
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
      const rows = await getStoredAiSearchJobs(userId, undefined, userSupabase);
      jobs = rows.map(mapStoredJobRow).filter((job) => job.title && job.url);
      byPlatform = groupJobsByPlatform(jobs);
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
    const { platform } = req.query;

    const userSupabase = createUserSupabase(accessToken);
    const rows = await getStoredAiSearchJobs(userId, platform, userSupabase);
    const jobs = rows.map(mapStoredJobRow).filter((job) => job.title && job.url);

    return res.status(200).json({
      success: true,
      total: jobs.length,
      byPlatform: groupJobsByPlatform(jobs),
      jobs,
    });
  } catch (err) {
    next(err);
  }
};
