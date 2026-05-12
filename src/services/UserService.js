import { supabase } from '../supabase';
import { mapProfile } from '../utils/mappers';

const userSummaryCache = new Map();

const normalizeProfile = (row) => {
  if (!row) return null;
  const p = mapProfile(row);
  return {
    id: p.id,
    displayName: p.displayName,
    username: p.username,
    avatarIcon: p.avatarIcon,
    avatarBackground: p.avatarBackground,
    avatarColor: p.avatarColor,
  };
};

export const fetchUserSummaries = async (rawIds = []) => {
  const ids = [...new Set(rawIds.filter((id) => typeof id === 'string' && id.trim().length))];
  if (!ids.length) return {};

  const pending = ids.filter((id) => !userSummaryCache.has(id));
  if (pending.length) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_icon, avatar_background, avatar_color')
        .in('id', pending);
      (data || []).forEach((row) => {
        userSummaryCache.set(row.id, normalizeProfile(row));
      });
    } catch (error) {
      console.error('Failed to fetch user summaries', error);
    }
  }

  return ids.reduce((acc, id) => {
    if (userSummaryCache.has(id)) acc[id] = userSummaryCache.get(id);
    return acc;
  }, {});
};

export const getCachedUserSummary = (userId) => (
  (typeof userId === 'string' && userSummaryCache.get(userId)) || null
);

export const primeUserSummaryCache = (profiles = []) => {
  profiles.forEach((profile) => {
    if (profile?.id) userSummaryCache.set(profile.id, normalizeProfile(profile));
  });
};

export const clearUserSummaryCache = () => {
  userSummaryCache.clear();
};

export const persistFeedSeenTimestamp = async (uid, seenAt = Date.now()) => {
  if (!uid) return false;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ feed_seen_at_ms: seenAt })
      .eq('id', uid);
    return !error;
  } catch (error) {
    console.error('Failed to persist feed seen timestamp', error);
    return false;
  }
};

export default fetchUserSummaries;
