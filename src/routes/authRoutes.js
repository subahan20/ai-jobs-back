import express from 'express';
import { signUp, login, getGoogleUrl, exchangeCallback } from '../controllers/authController.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/login', login);
router.get('/google', getGoogleUrl);
router.post('/callback', exchangeCallback);

export default router;
