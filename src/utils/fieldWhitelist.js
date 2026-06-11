export const JOB_UPDATE_FIELDS = [
  'title',
  'company',
  'logo_url',
  'logo_color',
  'source',
  'experience_level',
  'min_experience_years',
  'skills_required',
  'salary',
  'location',
  'description',
  'posted_time',
  'url',
  'employment_type',
  'category',
  'remote_on_site',
  'publish_state',
  'status',
];

export const PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'location',
  'portfolio_url',
  'degree',
  'university',
  'graduation_year',
  'cgpa',
  'preferred_role',
  'core_skills',
  'current_ctc',
  'expected_ctc',
  'work_experience',
  'linkedin_url',
  'github_url',
  'leetcode_url',
  'resume_source',
  'resume_url',
  'notice_period',
  'provider',
  'last_sign_in',
];

export const pickAllowedFields = (body = {}, allowedFields = []) =>
  allowedFields.reduce((result, field) => {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
    return result;
  }, {});

export const sanitizeSearchTerm = (value = '') =>
  String(value).trim().replace(/[,.()"'\\%]/g, '');
