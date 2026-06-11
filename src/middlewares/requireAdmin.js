import { isAdminEmail } from '../utils/adminAccess.js';

export const requireAdmin = (req, res, next) => {
  if (!req.user?.email) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }

  next();
};
