/**
 * Middleware to validate job creation and update payloads.
 */
export const validateJob = (req, res, next) => {
  const { title, company, min_experience_years, url, logo_url } = req.body;

  const errors = [];

  // Required fields validation
  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('Job title is required and must be a non-empty string.');
  }

  if (!company || typeof company !== 'string' || !company.trim()) {
    errors.push('Company name is required and must be a non-empty string.');
  }

  // URL format validations if provided
  if (url) {
    try {
      new URL(url);
    } catch (e) {
      errors.push('Provided application link URL is invalid.');
    }
  }

  if (logo_url) {
    try {
      new URL(logo_url);
    } catch (e) {
      errors.push('Provided company logo URL is invalid.');
    }
  }

  // Experience validation if provided
  if (min_experience_years !== undefined) {
    const exp = Number(min_experience_years);
    if (isNaN(exp) || exp < 0) {
      errors.push('Minimum experience years must be a non-negative number.');
    }
  }

  // If there are validation failures, return structured 400 response
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors
    });
  }

  next();
};
