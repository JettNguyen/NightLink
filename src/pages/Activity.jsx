import { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import LoadingIndicator from '../components/LoadingIndicator';
import { buildDreamPath, buildProfilePath } from '../utils/urlHelpers';
import updateDreamReaction from '../services/ReactionService';
import { markActivityEntryRead, removeActivityEntry } from '../services/ActivityService';
import './Activity.css';

export default function Activity({ user, activityPreview }) {
  const viewerId = user?.uid || null;
  const navigate = useNavigate();
  const [reactionState, setReactionState] = useState({});
  const [clearingEntries, setClearingEntries] = useState(() => new Set());
  const [customReactionTarget, setCustomReactionTarget] = useState(null);
  const [customReactionValue, setCustomReactionValue] = useState('');
  const defaultReaction = '❤️';

  const {
    inboxEntries = [],
    inboxLoading = Boolean(viewerId),
    inboxError = '',
    followingUpdates = [],
    followingLoading = Boolean(viewerId),
    profileLoading = Boolean(viewerId)
  } = activityPreview || {};

  const activityEntries = useMemo(() => (
    [...inboxEntries].sort((a, b) => {
      const aTime = a.createdAt?.getTime?.() || 0;
      const bTime = b.createdAt?.getTime?.() || 0;
      return bTime - aTime;
    })
  ), [inboxEntries]);

  const notificationsSummary = useMemo(() => (
    activityEntries.length
      ? `Latest ${Math.min(activityEntries.length, 20)} updates`
      : 'You’re all caught up'
  ), [activityEntries.length]);

  useEffect(() => {
    setReactionState((prev) => {
      const nextState = {};
      followingUpdates.forEach((entry) => {
        const counts = entry.reactionCounts || prev[entry.id]?.counts || {};
        const viewerReaction = entry.viewerReaction ?? prev[entry.id]?.viewerReaction ?? null;
        nextState[entry.id] = {
          counts,
          viewerReaction
        };
      });
      return nextState;
    });
  }, [followingUpdates]);

  useEffect(() => {
    if (!customReactionTarget) return;
    if (!followingUpdates.some((entry) => entry.id === customReactionTarget)) {
      setCustomReactionTarget(null);
      setCustomReactionValue('');
    }
  }, [customReactionTarget, followingUpdates]);

  const handleCardKeyPress = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  const handleDreamNavigation = (ownerUsername, ownerId, dreamId) => {
    if (!dreamId) return;
    if (ownerUsername) {
      navigate(buildDreamPath(ownerUsername, ownerId, dreamId));
    } else {
      navigate(`/dream/${dreamId}`);
    }
  };

  const handleNotificationInteraction = useCallback(async (entry, action) => {
    if (!entry) return;
    if (viewerId && entry.read === false) {
      await markActivityEntryRead(viewerId, entry.id);
    }
    action?.();
  }, [viewerId]);

  const handleNotificationClear = useCallback(async (event, entry) => {
    event.preventDefault();
    event.stopPropagation();
    if (!viewerId || !entry?.id) return;

    setClearingEntries((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });

    try {
      await removeActivityEntry(viewerId, entry.id);
    } catch (error) {
      console.error('Failed to clear notification', error);
      setClearingEntries((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      return;
    }

    setClearingEntries((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
  }, [viewerId]);

  const renderNotificationCard = (entry) => {
    const entryType = entry.type || 'mention';
    const relativeTime = entry.createdAt ? formatDistanceToNow(entry.createdAt, { addSuffix: true }) : 'moments ago';
    const actorName = entry.actorDisplayName || 'Someone';
    const dreamTitle = entry.dreamTitleSnapshot || entry.dreamTitle || 'Untitled dream';
    const bodyFallback = (entry.content || '').trim() || 'Tap to view the dream.';
    const isUnread = entry.read === false;

    let pillLabel = 'Mention';
    let headline = `${actorName} mentioned you in “${dreamTitle}”`;
    let bodyText = bodyFallback;
    let onPress = () => handleDreamNavigation(entry.dreamOwnerUsername, entry.dreamOwnerId, entry.dreamId);

    if (entryType === 'reply') {
      pillLabel = 'Reply';
      headline = `${actorName} replied to your comment in “${dreamTitle}”`;
    } else if (entryType === 'comment') {
      pillLabel = 'Comment';
      headline = `${actorName} commented on “${dreamTitle}”`;
    } else if (entryType === 'tag') {
      pillLabel = 'Tag';
      headline = `${actorName} tagged you in “${dreamTitle}”`;
    } else if (entryType === 'reaction') {
      pillLabel = 'Reaction';
      headline = `${actorName} reacted to “${dreamTitle}”`;
      bodyText = entry.emoji ? `Reaction: ${entry.emoji}` : bodyFallback;
    } else if (entryType === 'follow') {
      pillLabel = 'Follow';
      headline = `${actorName} followed you`;
      bodyText = entry.actorUsername ? `@${entry.actorUsername}` : 'Tap to view their profile.';
      onPress = () => {
        if (!entry.actorId) return;
        navigate(buildProfilePath(entry.actorUsername || null, entry.actorId));
      };
    }

    const isDisabled = entryType === 'follow' && !entry.actorId && !entry.actorUsername;
    const cardClassName = `activity-card${isUnread ? ' activity-card-unread' : ''}${isDisabled ? ' activity-card-disabled' : ''}`;

    const handleInteraction = () => handleNotificationInteraction(entry, onPress);

    return (
      <article
        key={entry.id}
        className={cardClassName}
        role={isDisabled ? 'group' : 'button'}
        tabIndex={isDisabled ? -1 : 0}
        onClick={() => !isDisabled && handleInteraction()}
        onKeyDown={(event) => !isDisabled && handleCardKeyPress(event, handleInteraction)}
        aria-disabled={isDisabled}
      >
        <div className="activity-card-head">
          <div className="activity-pill-group">
            <span className={`activity-pill ${entryType}`}>{pillLabel}</span>
            {isUnread && <span className="activity-dot" aria-label="Unread notification" />}
          </div>
          <span className="activity-time">{relativeTime}</span>
        </div>
        <p className="activity-title">{headline}</p>
        <p className="activity-body">{bodyText}</p>
        <div className="activity-card-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="activity-clear-btn"
            disabled={clearingEntries.has(entry.id)}
            onClick={(event) => handleNotificationClear(event, entry)}
          >
            Clear
          </button>
        </div>
      </article>
    );
  };

  const closeCustomReactionPicker = () => {
    setCustomReactionTarget(null);
    setCustomReactionValue('');
  };

  const openCustomReactionPicker = (event, entry) => {
    event.stopPropagation();
    event.preventDefault();
    setCustomReactionTarget(entry.id);
    setCustomReactionValue('');
  };

  const handleCustomEmojiChange = (value) => {
    const normalized = Array.from(value || '').slice(-2).join('');
    setCustomReactionValue(normalized);
  };

  const handleCustomReactionSubmit = (event, entry) => {
    event.preventDefault();
    event.stopPropagation();
    const emoji = customReactionValue.trim();
    if (!emoji) return;
    handleReactionSelection(entry, emoji);
    closeCustomReactionPicker();
  };

  const renderFollowingCard = (entry) => {
    const relativeTime = (entry.updatedAt || entry.createdAt)
      ? formatDistanceToNow(entry.updatedAt || entry.createdAt, { addSuffix: true })
      : 'moments ago';
    const ownerName = entry.ownerProfile?.displayName || 'Dreamer';
    const ownerHandle = entry.ownerProfile?.username ? `@${entry.ownerProfile.username}` : '';
    const title = entry.title?.trim() || (entry.aiGenerated ? entry.aiTitle : '') || 'Untitled dream';
    const summary = entry.aiGenerated && entry.aiInsights ? entry.aiInsights : (entry.content || '').slice(0, 180);
    const reactionSnapshot = reactionState[entry.id] || { counts: entry.reactionCounts || {}, viewerReaction: entry.viewerReaction || null };
    const totalReactions = Object.values(reactionSnapshot.counts || {}).reduce((sum, value) => sum + (value || 0), 0);
    const handleNavigate = () => handleDreamNavigation(entry.ownerProfile?.username || '', entry.userId, entry.id);

    return (
      <article
        key={entry.id}
        className="activity-card activity-card-clickable"
        role="button"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={(event) => handleCardKeyPress(event, handleNavigate)}
      >
        <div className="activity-card-head">
          <span className="activity-pill teal">Following</span>
          <span className="activity-time">{relativeTime}</span>
        </div>
        <p className="activity-title">{ownerName} {ownerHandle && <span className="muted">{ownerHandle}</span>}</p>
        <p className="activity-body">
          {title}
          {summary ? ` • ${summary}` : ''}
        </p>
        <div className="activity-reactions" onClick={(event) => event.stopPropagation()}>
          <div className="reaction-buttons">
            <button
              type="button"
              className={`reaction-button${reactionSnapshot.viewerReaction === defaultReaction ? ' active' : ''}`}
              onClick={(event) => handleReactionButtonClick(event, entry, defaultReaction)}
              aria-label="React with a heart"
            >
              <FontAwesomeIcon icon={faHeart} className="reaction-icon" />
              <span className="reaction-count">{reactionSnapshot.counts?.[defaultReaction] || 0}</span>
            </button>
            <button
              type="button"
              className="reaction-button custom-emoji-trigger"
              onClick={(event) => openCustomReactionPicker(event, entry)}
              aria-label="Add a custom emoji reaction"
            >
              <FontAwesomeIcon icon={faPlus} className="reaction-icon" />
              <span className="reaction-count">Emoji</span>
            </button>
            <button
              type="button"
              className="reaction-button clear-reaction"
              disabled={!reactionSnapshot.viewerReaction}
              onClick={(event) => handleReactionButtonClick(event, entry, null)}
            >
              Clear
            </button>
          </div>
          {customReactionTarget === entry.id && (
            <form className="custom-emoji-popover" onSubmit={(event) => handleCustomReactionSubmit(event, entry)}>
              <input
                id={`activity-custom-emoji-${entry.id}`}
                type="text"
                inputMode="text"
                maxLength={4}
                value={customReactionValue}
                onChange={(event) => handleCustomEmojiChange(event.target.value)}
                aria-label="Choose an emoji reaction"
                placeholder="Type an emoji"
                autoFocus
              />
              <button type="submit" className="primary-btn" disabled={!customReactionValue.trim()}>
                Add
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeCustomReactionPicker();
                }}
              >
                Cancel
              </button>
            </form>
          )}
          <span className="reaction-total">
            {totalReactions ? `${totalReactions} reaction${totalReactions === 1 ? '' : 's'}` : 'Be the first to react'}
          </span>
        </div>
      </article>
    );
  };

  const handleReactionButtonClick = (event, entry, emoji) => {
    event.stopPropagation();
    event.preventDefault();
    closeCustomReactionPicker();
    handleReactionSelection(entry, emoji);
  };

  const handleReactionSelection = useCallback(async (entry, emoji) => {
    if (!viewerId) {
      alert('Sign in to react to dreams');
      return;
    }

    const currentState = reactionState[entry.id];
    const currentReaction = currentState?.viewerReaction || null;
    const nextReaction = emoji === currentReaction ? null : emoji;

    setReactionState((prev) => {
      const counts = { ...(prev[entry.id]?.counts || entry.reactionCounts || {}) };

      if (currentReaction) {
        counts[currentReaction] = Math.max((counts[currentReaction] || 1) - 1, 0);
      }

      if (nextReaction) {
        counts[nextReaction] = (counts[nextReaction] || 0) + 1;
      }

      return {
        ...prev,
        [entry.id]: {
          counts,
          viewerReaction: nextReaction
        }
      };
    });

    try {
      await updateDreamReaction({
        dreamId: entry.id,
        dreamOwnerId: entry.userId,
        dreamTitleSnapshot: entry.title,
        userId: viewerId,
        emoji: nextReaction,
        actorDisplayName: user?.displayName || user?.email || 'NightLink dreamer',
        actorUsername: user?.username || user?.handle || null
      });
    } catch (error) {
      console.error('Failed to update reaction', error);
      setReactionState((prev) => ({
        ...prev,
        [entry.id]: {
          counts: currentState?.counts || entry.reactionCounts || {},
          viewerReaction: currentReaction
        }
      }));
    }
  }, [reactionState, user, viewerId]);

  return (
    <div className="page-container activity-page">
      <div className="activity-head">
        <div>
          <h1>Activity</h1>
          <p className="activity-subtitle">Mentions, replies, and dream updates from the people you follow.</p>
        </div>
      </div>

      <section className="activity-section">
        <div className="activity-section-head">
          <div>
            <h2>Notifications</h2>
            <p className="activity-subtitle">{notificationsSummary}</p>
          </div>
        </div>
        {inboxLoading ? (
          <div className="loading-inline">
            <LoadingIndicator label="Pulling your notifications…" size="sm" align="start" />
          </div>
        ) : inboxError && activityEntries.length === 0 ? (
          <p className="detail-hint">{inboxError}</p>
        ) : activityEntries.length ? (
          <div className="activity-list">
            {activityEntries.map((entry) => renderNotificationCard(entry))}
          </div>
        ) : (
          <p className="detail-hint">You don’t have any notifications yet.</p>
        )}
      </section>

      <section className="activity-section">
        <div className="activity-section-head">
          <div>
            <h2>Following feed</h2>
            <p className="activity-subtitle">
              {profileLoading
                ? 'Loading your circle…'
                : followingUpdates.length
                  ? `${followingUpdates.length} recent updates`
                  : 'No new entries yet'}
            </p>
          </div>
        </div>
        {followingLoading ? (
          <div className="loading-inline">
            <LoadingIndicator label="Pulling new dreams…" size="sm" align="start" />
          </div>
        ) : followingUpdates.length ? (
          <div className="activity-list">
            {followingUpdates.map((entry) => renderFollowingCard(entry))}
          </div>
        ) : (
          <p className="detail-hint">Your following list is quiet. Check back later.</p>
        )}
      </section>
    </div>
  );
}
