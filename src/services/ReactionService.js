import { supabase } from '../supabase';
import { logActivityEvent } from './ActivityService';

export const updateDreamReaction = async ({
  dreamId, dreamOwnerId, dreamTitleSnapshot,
  userId, emoji, actorDisplayName, actorUsername
}) => {
  if (!dreamId || !userId) throw new Error('Missing dreamId or userId');

  const { data, error } = await supabase.rpc('toggle_dream_reaction', {
    p_dream_id: dreamId,
    p_user_id:  userId,
    p_emoji:    emoji || null,
  });
  if (error) throw error;

  const result = data || {};
  if (result.changed && result.next && dreamOwnerId && dreamOwnerId !== userId) {
    await logActivityEvent(dreamOwnerId, {
      type: 'reaction',
      actorId: userId,
      actorDisplayName,
      actorUsername,
      emoji: result.next,
      dreamId,
      dreamOwnerId,
      dreamTitleSnapshot
    });
  }
  return result;
};

export default updateDreamReaction;

export const toggleCommentHeart = async ({
  dreamId,
  commentId,
  userId,
  actorDisplayName,
  actorUsername,
  commentAuthorId,
  dreamTitleSnapshot
}) => {
  if (!commentId || !userId) throw new Error('Missing comment reaction params');

  const { data, error } = await supabase.rpc('toggle_comment_heart', {
    p_comment_id: commentId,
    p_user_id:    userId,
  });
  if (error) throw error;

  const result = data || {};
  if (result.added && commentAuthorId && commentAuthorId !== userId) {
    await logActivityEvent(commentAuthorId, {
      type: 'commentReaction',
      actorId: userId,
      actorDisplayName,
      actorUsername,
      dreamId,
      commentId,
      dreamTitleSnapshot,
      emoji: '💙'
    });
  }
  return result;
};
