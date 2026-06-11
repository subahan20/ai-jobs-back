import { Router } from 'express';
import { getProfile, saveProfile } from '../controllers/profileController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth);

router.route('/')
  .get(getProfile)
  .post(saveProfile)
  .put(saveProfile);

export default router;
