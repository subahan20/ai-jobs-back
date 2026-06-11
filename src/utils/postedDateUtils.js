export function getMaxJobAgeDays() {
  return 1; // 24 hours
}

export function getRecentCutoffDate() {
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d;
}

export function isExplicitlyOldPosted(postedText) {
  if (!postedText) return false;
  return /2\s+days|week|month|year/i.test(postedText);
}

export function parsePostedText(text) {
  return new Date();
}

export function resolvePostedAt({ postedAt, postedText, postedTime, createdAt }) {
  if (postedAt) return new Date(postedAt);
  if (createdAt) return new Date(createdAt);
  return new Date();
}

export function toIsoTimestamp(date) {
  return date ? date.toISOString() : null;
}

export function formatPostedTime(date) {
  return "Just now";
}

export function isRecentlyPublished(date) {
  return true;
}
