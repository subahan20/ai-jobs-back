import { supabase } from '../config/supabase.js';

/**
 * Handle Admin signup via email & password
 */
export const signUp = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(201).json({
      success: true,
      message: 'Signup successful. Please check your inbox if email verification is enabled.',
      user: data.user,
      session: data.session
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Admin login via email & password
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: data.user,
      session: data.session
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Google OAuth redirect URL
 */
export const getGoogleUrl = async (req, res, next) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3001/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      url: data.url
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Exchange OAuth authorization code for session tokens
 */
export const exchangeCallback = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code is required.' });
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      message: 'OAuth authentication successful.',
      user: data.user,
      session: data.session
    });
  } catch (err) {
    next(err);
  }
};
