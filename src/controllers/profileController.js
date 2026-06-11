import { createUserSupabase } from '../config/supabase.js';
import { PROFILE_FIELDS, pickAllowedFields } from '../utils/fieldWhitelist.js';
import { getAccessToken } from '../utils/accessToken.js';
import { resolveUserId } from '../utils/resolveUserId.js';

export const getProfile = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const userSupabase = createUserSupabase(accessToken);
    const { data, error } = await userSupabase
      .from('profile')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(200).json({ success: true, data: null });
      }
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const saveProfile = async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const body = pickAllowedFields(req.body ?? {}, PROFILE_FIELDS);
    const profileData = {
      ...body,
      id: userId,
      updated_at: new Date().toISOString(),
    };

    const userSupabase = createUserSupabase(accessToken);
    const { data, error } = await userSupabase
      .from('profile')
      .upsert(profileData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      message: 'Profile saved successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};
