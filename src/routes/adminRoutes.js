import express from 'express';
import { triggerAdminBulkSync, getAdminBulkSyncStatus, getAdminSyncedJobs } from '../controllers/adminSyncController.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = express.Router();

// Apply admin authentication middleware
router.use(requireAuth);
router.use(requireAdmin);

router.post('/bulk-sync', triggerAdminBulkSync);
router.get('/bulk-sync/status', getAdminBulkSyncStatus);
router.get('/synced-jobs', getAdminSyncedJobs);

export default router;
