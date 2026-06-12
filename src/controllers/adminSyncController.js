import { runAdminBulkSync } from '../services/adminBulkScraper.js';
import { supabase as adminSupabase } from '../config/supabase.js';

let isSyncing = false;
let syncProgress = {
  status: 'idle',
  logs: [],
  totalSaved: 0
};

export const triggerAdminBulkSync = async (req, res, next) => {
  try {
    if (isSyncing) {
      return res.status(400).json({ success: false, message: 'Sync is already running' });
    }

    const { category } = req.body;

    isSyncing = true;
    syncProgress = { status: 'running', logs: ['Admin Bulk Sync started...'], totalSaved: 0 };

    // Run in background (Floating Promise) because 15 categories takes ~10 minutes
    runAdminBulkSync(category, (msg) => {
      syncProgress.logs.push(msg);
    })
      .then(result => {
        syncProgress.status = 'completed';
        syncProgress.totalSaved = result.totalSaved;
        syncProgress.logs.push(`Successfully synced ${result.totalSaved} jobs!`);
        isSyncing = false;
      })
      .catch(error => {
        syncProgress.status = 'failed';
        syncProgress.logs.push(`Error: ${error.message}`);
        isSyncing = false;
      });

    return res.status(200).json({
      success: true,
      message: 'Admin Bulk Sync started in background'
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminBulkSyncStatus = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      ...syncProgress,
      isSyncing
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminSyncedJobs = async (req, res, next) => {
  try {
    const { data, error } = await adminSupabase
      .from('ai_search')
      .select('*')
      .eq('platform', 'LinkedIn')
      .order('sync_time', { ascending: false })
      .limit(20);

    if (error && error.code === '42P01') {
      // Table doesn't exist yet
      return res.status(200).json({ success: true, jobs: [] });
    }
    
    if (error) throw error;

    return res.status(200).json({
      success: true,
      jobs: data || []
    });
  } catch (err) {
    next(err);
  }
};
