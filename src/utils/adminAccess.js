export const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email = '') => {
  const allowed = getAdminEmails();
  if (!allowed.length) return true;
  return allowed.includes(String(email).trim().toLowerCase());
};
