import { supabase } from '../supabase';

const PUSHABLE_ACTIVITY_TYPES = new Set(['reaction', 'commentReaction', 'mention', 'reply', 'comment', 'dreamUpdate', 'follow']);

export const logActivityEvent = async (targetId, payload = {}) => {
  if (!targetId || !payload.actorId || targetId === payload.actorId) return null;
  try {
    const { error } = await supabase.from('activity').insert({
      target_user_id:       targetId,
      actor_id:             payload.actorId,
      actor_display_name:   payload.actorDisplayName || null,
      actor_username:       payload.actorUsername || null,
      type:                 payload.type,
      emoji:                payload.emoji || null,
      dream_id:             payload.dreamId || null,
      dream_owner_id:       payload.dreamOwnerId || null,
      dream_title_snapshot: payload.dreamTitleSnapshot || null,
      comment_id:           payload.commentId || null,
      read:                 false,
    });
    if (error) throw error;
    triggerPushNotification(targetId, payload);
    return null;
  } catch (e) {
    console.error('Activity log failed', e);
    return null;
  }
};

export const logActivityEvents = (events = []) => (
  Promise.all(events.map((e) => logActivityEvent(e?.targetUserId, e?.payload)))
);

export const markActivityEntryRead = async (uid, id) => {
  if (!uid || !id) return false;
  try {
    const { error } = await supabase
      .from('activity')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('target_user_id', uid);
    return !error;
  } catch (e) {
    console.error('Mark read failed', e);
    return false;
  }
};

export const markActivityEntriesRead = async (uid, ids = []) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!uid || !unique.length) return 0;
  const results = await Promise.all(unique.map((id) => markActivityEntryRead(uid, id)));
  return results.filter(Boolean).length;
};

export const removeActivityEntry = async (uid, id) => {
  if (!uid || !id) return false;
  try {
    const { error } = await supabase
      .from('activity')
      .delete()
      .eq('id', id)
      .eq('target_user_id', uid);
    return !error;
  } catch (e) {
    console.error('Delete activity failed', e);
    return false;
  }
};

const triggerPushNotification = async (targetId, payload = {}) => {
  if (!PUSHABLE_ACTIVITY_TYPES.has(payload.type)) return;
  if (!targetId || !payload.actorId) return;
  try {
    await supabase.functions.invoke('notify', {
      body: { targetUserId: targetId, payload },
    });
  } catch (error) {
    console.error('Notification request failed', error);
  }
};
