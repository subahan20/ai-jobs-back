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
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.route('/')
  .get(getJobs)
  .post(requireAuth, requireAdmin, validateJob, createJob);

router.route('/:id')
  .get(getJobById)
  .put(requireAuth, requireAdmin, validateJob, updateJob)
  .delete(requireAuth, requireAdmin, deleteJob);

export default router;
