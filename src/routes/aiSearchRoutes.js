import { Router } from 'express';
import {
  getAiSearchStatus,
  listAiSearchJobs,
  triggerAiSearch,
} from '../controllers/aiSearchController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', listAiSearchJobs);
router.post('/', triggerAiSearch);
router.get('/status/:searchId', getAiSearchStatus);

export default router;
