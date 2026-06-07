import { supabase } from '../config/supabase.js';

// Pre-defined logo colors to assign to job postings if not specified
const LOGO_COLORS = [
  'bg-indigo-600 text-white',
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-cyan-800 text-white',
  'bg-red-500 text-white',
  'bg-orange-500 text-white',
  'bg-sky-600 text-white',
  'bg-amber-600 text-white'
];

/**
 * Helper to determine experience seniority level based on minimum years of experience
 */
const deduceExperienceLevel = (years) => {
  const minExp = parseInt(years || '0', 10);
  if (minExp <= 1) return 'Junior';
  if (minExp <= 3) return 'Mid';
  if (minExp <= 7) return 'Senior';
  return 'Lead';
};

/**
 * GET /api/jobs
 * Retrieves list of jobs with support for search, filtering, sorting, and pagination.
 */
export const getJobs = async (req, res, next) => {
  try {
    const {
      search,
      experience_level,
      source,
      location,
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    // Build the base select query
    let query = supabase.from('jobs').select('*', { count: 'exact' });

    // 1. Text Search Filter (filters by title or company if search query is present)
    // Note: Supabase supports full-text search or ilike. Since we are using standard tables, 
    // we use a logical OR filter with ilike for flexible matching.
    if (search) {
      const cleanSearch = `%${search.trim()}%`;
      query = query.or(`title.ilike.${cleanSearch},company.ilike.${cleanSearch},description.ilike.${cleanSearch}`);
    }

    // 2. Exact match filters
    if (experience_level) {
      query = query.eq('experience_level', experience_level);
    }
    if (source) {
      query = query.eq('source', source);
    }
    if (location) {
      query = query.ilike('location', `%${location}%`);
    }

    // 3. Sorting (validates column parameters to prevent SQL injection)
    const allowedSortCols = ['created_at', 'min_experience_years', 'title', 'company', 'salary'];
    const activeSortCol = allowedSortCols.includes(sort_by) ? sort_by : 'created_at';
    const activeSortOrder = sort_order.toLowerCase() === 'asc' ? 'asc' : 'desc';
    query = query.order(activeSortCol, { ascending: activeSortOrder === 'asc' });

    // 4. Pagination
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10))); // Cap maximum items per request at 100
    const fromIndex = (pageNum - 1) * limitNum;
    const toIndex = fromIndex + limitNum - 1;
    query = query.range(fromIndex, toIndex);

    // Execute query
    const { data, count, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      meta: {
        total_items: count || 0,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil((count || 0) / limitNum)
      },
      jobs: data || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/jobs/:id
 * Retrieves a single job by its ID.
 */
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: `Job listing with ID '${id}' was not found.`
        });
      }
      throw error;
    }

    return res.json({
      success: true,
      job: data
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/jobs
 * Creates a new manual job listing.
 */
export const createJob = async (req, res, next) => {
  try {
    const {
      title,
      company,
      logo_url,
      logo_color,
      source,
      experience_level,
      min_experience_years,
      skills_required,
      salary,
      location,
      description,
      posted_time,
      url
    } = req.body;

    const jobId = `manual-${Date.now()}`;
    const minExp = parseInt(min_experience_years || '0', 10);
    const expLevel = experience_level || deduceExperienceLevel(minExp);
    
    // Normalize skills to string array
    let skillsArray = [];
    if (Array.isArray(skills_required)) {
      skillsArray = skills_required.map(s => s.trim()).filter(Boolean);
    } else if (typeof skills_required === 'string') {
      skillsArray = skills_required.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Default logo theme color if omitted
    const chosenColor = logo_color || LOGO_COLORS[Math.floor(Math.random() * LOGO_COLORS.length)];

    const newJob = {
      id: jobId,
      title: title.trim(),
      company: company.trim(),
      logo_url: logo_url ? logo_url.trim() : null,
      logo_color: chosenColor,
      source: source ? source.trim() : 'Admin Portal',
      experience_level: expLevel,
      min_experience_years: minExp,
      skills_required: skillsArray,
      salary: salary ? salary.trim() : 'Not Disclosed',
      location: location ? location.trim() : 'Remote',
      description: description ? description.trim() : 'No description provided.',
      posted_time: posted_time ? posted_time.trim() : 'Just now',
      url: url ? url.trim() : ''
    };

    const { data, error } = await supabase
      .from('jobs')
      .upsert(newJob, { onConflict: 'id' })
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Job posting published successfully.',
      job: data?.[0] || newJob
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/jobs/:id
 * Updates an existing job listing by ID.
 */
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // First check if the job exists
    const { data: existingJob, error: checkErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', id)
      .single();

    if (checkErr) {
      if (checkErr.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: `Cannot update. Job listing with ID '${id}' was not found.`
        });
      }
      throw checkErr;
    }

    // Normalize incoming updates if they exist
    const normalizedUpdates = { ...updates };
    
    if (updates.min_experience_years !== undefined) {
      normalizedUpdates.min_experience_years = parseInt(updates.min_experience_years || '0', 10);
      if (!updates.experience_level) {
        normalizedUpdates.experience_level = deduceExperienceLevel(normalizedUpdates.min_experience_years);
      }
    }

    if (updates.skills_required !== undefined) {
      if (typeof updates.skills_required === 'string') {
        normalizedUpdates.skills_required = updates.skills_required.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(normalizedUpdates)
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Job posting updated successfully.',
      job: data?.[0]
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/jobs/:id
 * Deletes a job listing by ID.
 */
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;

    // First verify job existence
    const { data: existingJob, error: checkErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', id)
      .single();

    if (checkErr) {
      if (checkErr.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: `Cannot delete. Job listing with ID '${id}' was not found.`
        });
      }
      throw checkErr;
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({
      success: true,
      message: `Job listing '${id}' deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
};
