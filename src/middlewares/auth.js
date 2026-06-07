import { supabase } from '../config/supabase.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication token is missing. Please log in.' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Malformed authorization token.' 
      });
    }

    // Verify session using Supabase auth service
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session has expired or token is invalid. Please log in again.' 
      });
    }

    // Attach user record to request scope
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
