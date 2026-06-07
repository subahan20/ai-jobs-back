import { Router } from 'express';
import {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob
} from '../controllers/jobController.js';
import { validateJob } from '../middlewares/validation.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// Routes for the Jobs resource
router.route('/')
  .get(getJobs)
  .post(requireAuth, validateJob, createJob);

router.route('/:id')
  .get(getJobById)
  .put(requireAuth, validateJob, updateJob)
  .delete(requireAuth, deleteJob);

export default router;
