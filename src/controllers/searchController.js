import { performJobSearchAndScrape } from '../utils/searchHelpers.js';

// In-memory registry to store running searches
const activeJobs = new Map();

/**
 * Trigger job search in background
 * POST /api/jobs/search
 */
export const triggerSearch = async (req, res, next) => {
  try {
    const { role = '', skills = '', experience = 0 } = req.body || {};

    if (!role.trim()) {
      return res.status(400).json({ success: false, error: 'Preferred role is required to start a search.' });
    }

    const jobId = 'job_' + Math.random().toString(36).substring(2, 15);
    
    // Set initial status in memory
    activeJobs.set(jobId, {
      status: 'active',
      jobs: [],
      logs: ['Search task initialized.'],
      error: null,
      createdAt: Date.now()
    });

    // Start background processing immediately without holding up the response
    performJobSearchAndScrape({
      role: role.trim(),
      skills: skills.trim(),
      experience: Number(experience) || 0,
      onLog: (msg) => {
        const job = activeJobs.get(jobId);
        if (job) {
          job.logs.push(msg);
        }
      }
    })
      .then((completedJobs) => {
        const job = activeJobs.get(jobId);
        if (job) {
          job.status = 'completed';
          job.jobs = completedJobs;
          job.logs.push('Search task completed successfully.');
        }
      })
      .catch((err) => {
        const job = activeJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = err?.message || 'Search execution failed on background worker.';
          job.logs.push(`[ERROR] Search failed: ${job.error}`);
        }
      });

    // Clean up memory after 10 minutes to prevent leaks
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, 600000);

    return res.status(200).json({
      success: true,
      jobId
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve search task status from memory
 * GET /api/jobs/search/status/:id
 */
export const checkSearchStatus = async (req, res, next) => {
  try {
    const jobId = req.params.id;
    const task = activeJobs.get(jobId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Search session expired or not found. Please trigger a new search.'
      });
    }

    return res.status(200).json({
      success: true,
      status: task.status,
      jobs: task.jobs,
      logs: task.logs,
      error: task.error
    });
  } catch (err) {
    next(err);
  }
};
