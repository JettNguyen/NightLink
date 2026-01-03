import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { collection, doc, query, where, orderBy, limit, onSnapshot, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faPlus } from '@fortawesome/free-solid-svg-icons';
import { DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Feed.css';
import LoadingIndicator from '../components/LoadingIndicator';
import ReactionInsightsModal from '../components/ReactionInsightsModal';
import updateDreamReaction from '../services/ReactionService';
import fetchUserSummaries from '../services/UserService';
import { firebaseUserPropType } from '../propTypes';
import { COMMON_EMOJI_REACTIONS, filterEmojiInput } from '../constants/emojiOptions';

const INITIAL_INSIGHT_STATE = {
  open: false,
  emoji: '',
  title: '',
  subtitle: '',
  userIds: [],
  anchorRect: null
};

const normalizeAnchorRect = (rect) => {
  if (!rect) return null;
  const keys = ['top', 'right', 'bottom', 'left', 'width', 'height'];
  const next = {};
  for (const key of keys) {
    const value = typeof rect[key] === 'number' ? rect[key] : Number(rect[key]);
    if (Number.isNaN(value)) {
      return null;
    }
    next[key] = value;
  }
  return next;
};

export default function Feed({ user }) {
  const [rawDreams, setRawDreams] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [followingIdsLoaded, setFollowingIdsLoaded] = useState(false);
  const [followingProfiles, setFollowingProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reactionState, setReactionState] = useState({});
  const [customReactionTarget, setCustomReactionTarget] = useState(null);
  const [customReactionValue, setCustomReactionValue] = useState('');
  const [userSummaries, setUserSummaries] = useState({});
  const [reactionInsightState, setReactionInsightState] = useState(INITIAL_INSIGHT_STATE);
  const customEmojiInputRef = useRef(null);
  const userSummariesRef = useRef(userSummaries);
  const reactionInsightOpenRef = useRef(false);
  const hoverCloseTimeoutRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const navigate = useNavigate();
  const defaultReaction = '💙';

  const chunkArray = (list, chunkSize = 10) => {
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }
    return chunks;
  };
  const viewerId = user?.uid || null;

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const data = snapshot.data();
      setFollowingIds(data?.followingIds || []);
      setFollowingIdsLoaded(true);
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!followingIds.length) {
      setFollowingProfiles({});
      return undefined;
    }

    setFollowingProfiles({});
    const chunks = chunkArray(followingIds);
    const unsubscribes = chunks.map((chunk) => {
      const usersQuery = query(
        collection(db, 'users'),
        where(documentId(), 'in', chunk)
      );

      return onSnapshot(usersQuery, (snapshot) => {
        setFollowingProfiles((prev) => {
          const updated = { ...prev };
          snapshot.forEach((docSnap) => {
            updated[docSnap.id] = docSnap.data();
          });
          return updated;
        });
      }, () => {});
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [followingIds]);

  useEffect(() => {
    if (!followingIds.length) {
      setRawDreams([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    const chunkResults = new Map();
    const chunks = chunkArray(followingIds);
    const unsubscribes = chunks.map((chunk) => {
      const friendQuery = query(
        collection(db, 'dreams'),
        where('userId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      return onSnapshot(friendQuery, (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate?.() ?? data.createdAt ?? null;
          return {
            id: docSnap.id,
            ...data,
            visibility: data.visibility || 'private',
            createdAt
          };
        });

        chunkResults.set(chunk.join(','), docs);
        const merged = Array.from(chunkResults.values()).flat();
        const byId = new Map();
        merged.forEach((dream) => {
          byId.set(dream.id, dream);
        });
        const candidates = Array.from(byId.values()).filter((dream) => ['anonymous', 'public', 'following', 'followers'].includes(dream.visibility));
        setRawDreams(candidates);
        setLoading(false);
      }, () => {
        setError('Unable to load your following feed right now.');
        setLoading(false);
      });
    });

    return () => {
      chunkResults.clear();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [followingIds]);

  const visibleDreams = useMemo(() => {
    if (!rawDreams.length) return [];

    const filtered = rawDreams.filter((dream) => {
      if (!dream) return false;
      const visibility = dream.visibility || 'private';
      if (viewerId && Array.isArray(dream.excludedViewerIds) && dream.excludedViewerIds.includes(viewerId)) {
        return false;
      }
      if (viewerId && Array.isArray(dream.taggedUserIds) && dream.taggedUserIds.includes(viewerId)) {
        return true;
      }
      if (visibility === 'public' || visibility === 'anonymous') {
        return true;
      }
      if (!viewerId) {
        return false;
      }

      const authorProfile = dream.userId ? followingProfiles[dream.userId] : null;
      const authorFollowingIds = Array.isArray(authorProfile?.followingIds) ? authorProfile.followingIds : [];
      const authorFollowerIds = Array.isArray(authorProfile?.followerIds) ? authorProfile.followerIds : [];

      if (visibility === 'following') {
        return authorFollowingIds.includes(viewerId);
      }

      if (visibility === 'followers') {
        return authorFollowerIds.includes(viewerId);
      }

      if (visibility === 'private') {
        return dream.userId === viewerId;
      }

      return false;
    });

    return filtered.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [rawDreams, followingProfiles, viewerId]);

  useEffect(() => {
    setReactionState((prev) => {
      const next = {};
      visibleDreams.forEach((dream) => {
        if (!dream?.id) return;
        const counts = dream.reactionCounts || prev[dream.id]?.counts || {};
        const viewerReaction = dream.viewerReactions?.[viewerId] || prev[dream.id]?.viewerReaction || null;
        next[dream.id] = {
          counts,
          viewerReaction
        };
      });
      return next;
    });
  }, [visibleDreams, viewerId]);

  useEffect(() => {
    if (!customReactionTarget) return;
    if (!visibleDreams.some((dream) => dream.id === customReactionTarget)) {
      setCustomReactionTarget(null);
      setCustomReactionValue('');
    }
  }, [customReactionTarget, visibleDreams]);

  useEffect(() => {
    if (!customReactionTarget) {
      customEmojiInputRef.current = null;
      return;
    }
    const raf = requestAnimationFrame(() => {
      const input = customEmojiInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
      if (typeof navigator !== 'undefined' && navigator.virtualKeyboard?.show) {
        try {
          navigator.virtualKeyboard.show();
        } catch {
          /* ignored */
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [customReactionTarget]);

  const handleReactionSelection = useCallback(async (dream, emoji) => {
    if (!viewerId) {
      alert('Sign in to react to dreams');
      return;
    }

    const currentState = reactionState[dream.id];
    const currentReaction = currentState?.viewerReaction || null;
    if (currentReaction && emoji && emoji !== currentReaction) {
      alert('Clear your current reaction before choosing another emoji.');
      return;
    }

    const nextReaction = emoji === currentReaction ? null : emoji;

    setReactionState((prev) => {
      const counts = { ...(prev[dream.id]?.counts || dream.reactionCounts || {}) };

      if (currentReaction) {
        counts[currentReaction] = Math.max((counts[currentReaction] || 1) - 1, 0);
      }

      if (nextReaction) {
        counts[nextReaction] = (counts[nextReaction] || 0) + 1;
      }

      return {
        ...prev,
        [dream.id]: {
          counts,
          viewerReaction: nextReaction
        }
      };
    });

    try {
      await updateDreamReaction({
        dreamId: dream.id,
        dreamOwnerId: dream.userId,
        dreamTitleSnapshot: dream.title || dream.aiTitle || 'Dream',
        userId: viewerId,
        emoji: nextReaction,
        actorDisplayName: user?.displayName || user?.email || 'NightLink dreamer',
        actorUsername: user?.username || user?.handle || null
      });
    } catch (err) {
      console.error('Failed to update dream reaction', err);
      setReactionState((prev) => ({
        ...prev,
        [dream.id]: {
          counts: currentState?.counts || dream.reactionCounts || {},
          viewerReaction: currentReaction
        }
      }));
    }
  }, [reactionState, user, viewerId]);

  const closeCustomReactionPicker = () => {
    setCustomReactionTarget(null);
    setCustomReactionValue('');
  };

  const handleReactionClick = (event, dream, emoji) => {
    event.stopPropagation();
    event.preventDefault();
    closeCustomReactionPicker();
    handleReactionSelection(dream, emoji);
  };

  const openCustomReactionPicker = (event, dream) => {
    event.stopPropagation();
    event.preventDefault();
    setCustomReactionTarget(dream.id);
    setCustomReactionValue('');
  };

  const handleCustomEmojiChange = (value) => {
    setCustomReactionValue(filterEmojiInput(value));
  };

  const handleCustomReactionSubmit = (event, dream) => {
    event.preventDefault();
    event.stopPropagation();
    const emoji = filterEmojiInput(customReactionValue);
    if (!emoji) return;
    handleReactionSelection(dream, emoji);
    closeCustomReactionPicker();
  };

  const renderReactionChipSymbol = (emoji) => (
    emoji === defaultReaction
      ? <FontAwesomeIcon icon={faHeart} className="reaction-emoji-icon" aria-hidden="true" />
      : <span className="reaction-emoji" aria-hidden="true">{emoji}</span>
  );

  useEffect(() => {
    userSummariesRef.current = userSummaries;
  }, [userSummaries]);

  useEffect(() => {
    reactionInsightOpenRef.current = reactionInsightState.open;
  }, [reactionInsightState.open]);

  useEffect(() => () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const allIds = visibleDreams.flatMap((dream) => Object.keys(dream.viewerReactions || {}));
    if (!allIds.length) return;
    const missing = [...new Set(allIds)].filter((id) => !userSummariesRef.current[id]);
    if (!missing.length) return;
    fetchUserSummaries(missing).then((fetched) => {
      if (fetched && Object.keys(fetched).length) {
        setUserSummaries((prev) => ({ ...prev, ...fetched }));
      }
    }).catch(() => {});
  }, [visibleDreams]);

  const reactionInsightEntries = useMemo(() => {
    const ids = reactionInsightState.userIds || [];
    if (!ids.length) return [];
    return ids.map((id) => ({
      id,
      displayName: userSummaries[id]?.displayName || 'Dreamer',
      username: userSummaries[id]?.username || '',
      avatarIcon: userSummaries[id]?.avatarIcon || null,
      avatarBackground: userSummaries[id]?.avatarBackground || undefined,
      avatarColor: userSummaries[id]?.avatarColor || undefined
    }));
  }, [reactionInsightState.userIds, userSummaries]);

  const cancelModalAutoClose = useCallback(() => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleModalAutoClose = useCallback(() => {
    cancelModalAutoClose();
    if (!reactionInsightOpenRef.current) return;
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setReactionInsightState({ ...INITIAL_INSIGHT_STATE });
    }, 220);
  }, [cancelModalAutoClose]);

  const openReactionInsight = useCallback(async (payload = {}) => {
    const ids = [...new Set((payload.userIds || []).filter((id) => typeof id === 'string' && id.trim().length))];
    const anchorRect = normalizeAnchorRect(payload.anchorRect);
    if (!ids.length || !anchorRect) return;
    cancelModalAutoClose();
    const missing = ids.filter((id) => !userSummariesRef.current[id]);
    if (missing.length) {
      try {
        const fetched = await fetchUserSummaries(missing);
        if (fetched && Object.keys(fetched).length) {
          setUserSummaries((prev) => ({ ...prev, ...fetched }));
        }
      } catch (e) {
        console.error('Failed to fetch user summaries', e);
      }
    }
    setReactionInsightState({
      open: true,
      anchorRect,
      emoji: payload.emoji || '',
      title: payload.title || 'Reactions',
      subtitle: payload.subtitle || '',
      userIds: ids
    });
  }, [cancelModalAutoClose]);

  const getDreamReactionUserIds = useCallback((dream, emoji) => {
    if (!emoji || !dream?.viewerReactions) return [];
    return Object.entries(dream.viewerReactions)
      .filter(([, value]) => value === emoji)
      .map(([userId]) => userId)
      .filter(Boolean);
  }, []);

  const buildDreamReactionPayload = useCallback((dream, emoji) => {
    const userIds = getDreamReactionUserIds(dream, emoji);
    if (!userIds.length) return null;
    const countLabel = userIds.length === 1 ? '1 person' : `${userIds.length} people`;
    const actionLabel = emoji === defaultReaction ? 'hearted this dream' : 'reacted this way';
    return {
      title: 'Dream reactions',
      subtitle: `${countLabel} ${actionLabel}`,
      emoji: emoji || '',
      userIds
    };
  }, [getDreamReactionUserIds, defaultReaction]);

  const beginLongPressPreview = useCallback((payload, resolveAnchorRect) => {
    if (!payload?.userIds?.length) return;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    longPressTriggeredRef.current = false;
    longPressTimeoutRef.current = setTimeout(async () => {
      longPressTimeoutRef.current = null;
      longPressTriggeredRef.current = true;
      suppressNextClickRef.current = true;
      const anchorRect = typeof resolveAnchorRect === 'function'
        ? resolveAnchorRect()
        : resolveAnchorRect;
      await openReactionInsight({ ...payload, anchorRect });
    }, 450);
  }, [openReactionInsight]);

  const cancelLongPressPreview = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    const triggered = longPressTriggeredRef.current;
    longPressTriggeredRef.current = false;
    return triggered;
  }, []);

  const consumeSuppressedClick = useCallback((event) => {
    if (!suppressNextClickRef.current) return false;
    suppressNextClickRef.current = false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }, []);

  const handleTouchEndInteraction = useCallback((event) => {
    if (cancelLongPressPreview()) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      setReactionInsightState({ ...INITIAL_INSIGHT_STATE });
    }
  }, [cancelLongPressPreview]);

  const handleTouchMoveInteraction = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleDreamReactionHoverStart = useCallback((event, dream, emoji) => {
    const payload = buildDreamReactionPayload(dream, emoji);
    if (!payload) return;
    const anchorRect = event?.currentTarget?.getBoundingClientRect?.();
    openReactionInsight({ ...payload, anchorRect });
  }, [buildDreamReactionPayload, openReactionInsight]);

  const handleDreamReactionTouchStart = useCallback((event, dream, emoji) => {
    const payload = buildDreamReactionPayload(dream, emoji);
    if (!payload) return;
    const anchorElement = event?.currentTarget || null;
    beginLongPressPreview(payload, () => anchorElement?.getBoundingClientRect?.());
  }, [beginLongPressPreview, buildDreamReactionPayload]);

  return (
    <div className="page-container">
      <div className="page-header feed-header">
        <div>
          <h1>Following Feed</h1>
          <p className="page-subtitle">Dreams that are public, anonymous, and from people you follow.</p>
        </div>
        <div className="feed-actions">
          <span className="pill">Following {followingIds.length}</span>
          <button type="button" className="ghost-btn" onClick={() => navigate('/search')}>
            Find people
          </button>
        </div>
      </div>

      {error && <div className="alert-banner">{error}</div>}

      {!followingIdsLoaded ? (
          <div className="feed-empty-card loading-slot">
            <LoadingIndicator label="Loading your following feed…" size="md" />
          </div>
      ) : followingIds.length === 0 ? (
        <div className="feed-empty-card">
          <p>You are not following anyone yet.</p>
          <p className="empty-subtitle">Follow people from Search to see their dreams here.</p>
          <button type="button" className="primary-btn" onClick={() => navigate('/search')}>
            Find people
          </button>
        </div>
      ) : loading ? (
          <div className="feed-empty-card loading-slot">
            <LoadingIndicator label="Loading your following feed…" size="md" />
        </div>
      ) : visibleDreams.length === 0 ? (
        <div className="feed-empty-card">
          <p>No dreams from the people you follow yet.</p>
          <p className="empty-subtitle">As soon as they share something public, anonymous, or limited to people they follow, it will appear here.</p>
        </div>
      ) : (
        <div className="feed-list">
          {visibleDreams.map((dream) => {
            const profile = dream.userId ? followingProfiles[dream.userId] : null;
            const isAnonymous = dream.visibility === 'anonymous';
            const authorLabel = isAnonymous
              ? 'Anonymous dreamer'
              : profile?.displayName || dream.authorDisplayName || dream.userDisplayName || dream.ownerDisplayName || 'Dreamer';
            const authorUsername = !isAnonymous ? (profile?.username || dream.authorUsername || '') : '';
            const authorHandle = authorUsername ? `@${authorUsername}` : null;
            const avatarIconId = isAnonymous ? 'ghost' : profile?.avatarIcon;
            const avatarIcon = getAvatarIconById(avatarIconId);
            const avatarBackground = profile?.avatarBackground || DEFAULT_AVATAR_BACKGROUND;
            const avatarColor = profile?.avatarColor || DEFAULT_AVATAR_COLOR;
            const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Just now';
            const snippet = dream.content ? (dream.content.length > 240 ? `${dream.content.slice(0, 240)}…` : dream.content) : 'No entry text yet.';
            const visibilityLabel = dream.visibility === 'anonymous'
              ? 'Anonymous dream'
              : dream.visibility === 'following' || dream.visibility === 'followers'
                ? 'Shared with people they follow'
                : 'Public dream';
            const showProfileLink = !isAnonymous && Boolean(dream.userId);
            const profilePath = showProfileLink ? buildProfilePath(authorUsername, dream.userId) : null;
            const handleAuthorNavigation = (event) => {
              if (!showProfileLink) return;
              event.stopPropagation();
              event.preventDefault();
              if (profilePath) {
                navigate(profilePath);
              }
            };
            const openDreamDetail = () => {
              const detailPath = isAnonymous
                ? `/dream/${dream.id}`
                : buildDreamPath(authorUsername, dream.userId, dream.id);
              navigate(detailPath, { state: { fromNav: '/feed' } });
            };

            const reactionSnapshot = reactionState[dream.id] || { counts: dream.reactionCounts || {}, viewerReaction: dream.viewerReactions?.[viewerId] || null };
            const totalReactions = Object.values(reactionSnapshot.counts || {}).reduce((sum, value) => sum + (value || 0), 0);
            const reactionEntries = Object.entries(reactionSnapshot.counts || {})
              .filter(([emoji, count]) => typeof emoji === 'string' && emoji.trim().length && count > 0)
              .sort((a, b) => b[1] - a[1]);

            return (
              <div
                key={dream.id}
                className="feed-card"
                role="button"
                tabIndex={0}
                onClick={openDreamDetail}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDreamDetail();
                  }
                }}
              >
                <div className="feed-card-head">
                  <div className="feed-author-block">
                    <div
                      className="feed-avatar"
                      style={{ background: avatarBackground, color: avatarColor }}
                    >
                      <FontAwesomeIcon icon={avatarIcon} />
                    </div>
                    <div className="feed-author-meta">
                      {showProfileLink ? (
                        <button type="button" className="feed-author feed-author-link" onClick={handleAuthorNavigation}>
                          {authorLabel}
                        </button>
                      ) : (
                        <div className="feed-author">{authorLabel}</div>
                      )}
                      {authorHandle && (
                        showProfileLink ? (
                          <button type="button" className="feed-author-handle feed-author-link" onClick={handleAuthorNavigation}>
                            {authorHandle}
                          </button>
                        ) : (
                          <div className="feed-author-handle">{authorHandle}</div>
                        )
                      )}
                      <div className="feed-visibility">{visibilityLabel}</div>
                    </div>
                  </div>
                  <span className="feed-date">{dateLabel}</span>
                </div>

                {(dream.title || (dream.aiGenerated && dream.aiTitle)) ? (
                  <h3 className="feed-title">{dream.title || dream.aiTitle}</h3>
                ) : null}

                <p className="feed-content">{snippet}</p>

                {dream.aiGenerated && dream.aiInsights && (
                  <p className="feed-summary">{dream.aiInsights}</p>
                )}

                {dream.tags && dream.tags.length > 0 && (
                  <div className="feed-tags">
                    {dream.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag.value}</span>
                    ))}
                  </div>
                )}

                <div className="activity-reactions feed-reactions">
                  <div className="reaction-buttons">
                    <button
                      type="button"
                      className={`reaction-button${reactionSnapshot.viewerReaction === defaultReaction ? ' active' : ''}`}
                      onClick={(event) => {
                        if (consumeSuppressedClick(event)) return;
                        handleReactionClick(event, dream, defaultReaction);
                      }}
                      aria-label="React with a heart"
                    >
                      <FontAwesomeIcon icon={faHeart} className="reaction-icon" />
                      <span className="reaction-count">{reactionSnapshot.counts?.[defaultReaction] || 0}</span>
                    </button>
                    <button
                      type="button"
                      className="reaction-button custom-emoji-trigger"
                      onClick={(event) => openCustomReactionPicker(event, dream)}
                      aria-label="Add a custom emoji reaction"
                    >
                      <FontAwesomeIcon icon={faPlus} className="reaction-icon" />
                      <span className="reaction-count">Emoji</span>
                    </button>
                    <button
                      type="button"
                      className="reaction-button clear-reaction"
                      disabled={!reactionSnapshot.viewerReaction}
                      onClick={(event) => handleReactionClick(event, dream, null)}
                    >
                      Clear
                    </button>
                  </div>
                  {reactionEntries.length > 0 && (
                    <div className="reaction-chip-row" aria-label="Existing reactions">
                      {reactionEntries.map(([emoji, count]) => (
                        <button
                          key={`${dream.id}-reaction-${emoji}`}
                          type="button"
                          className={`reaction-chip${reactionSnapshot.viewerReaction === emoji ? ' active' : ''}`}
                          onClick={(event) => {
                            if (consumeSuppressedClick(event)) return;
                            handleReactionClick(event, dream, emoji);
                          }}
                          aria-label={`React with ${emoji}`}
                          onMouseEnter={(event) => handleDreamReactionHoverStart(event, dream, emoji)}
                          onMouseLeave={scheduleModalAutoClose}
                          onTouchStart={(event) => handleDreamReactionTouchStart(event, dream, emoji)}
                          onTouchEnd={handleTouchEndInteraction}
                          onTouchCancel={handleTouchEndInteraction}
                          onTouchMove={handleTouchMoveInteraction}
                        >
                          {renderReactionChipSymbol(emoji)}
                          <span className="reaction-count">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {customReactionTarget === dream.id && (
                    <div
                      className="custom-emoji-popover"
                      onClick={(event) => event.stopPropagation()}
                      role="group"
                      aria-label="Add an emoji reaction"
                    >
                      <div className="emoji-picker-grid">
                        {COMMON_EMOJI_REACTIONS.map((emoji) => (
                          <button
                            key={`${dream.id}-picker-${emoji}`}
                            type="button"
                            className="emoji-option"
                            onClick={(event) => {
                              event.preventDefault();
                              handleReactionSelection(dream, emoji);
                              closeCustomReactionPicker();
                            }}
                          >
                            <span aria-hidden="true">{emoji}</span>
                            <span className="sr-only">React with {emoji}</span>
                          </button>
                        ))}
                      </div>
                      <form
                        className="emoji-input-row"
                        onSubmit={(event) => handleCustomReactionSubmit(event, dream)}
                      >
                        <input
                          id={`custom-emoji-${dream.id}`}
                          type="text"
                          ref={(node) => {
                            if (customReactionTarget === dream.id) {
                              customEmojiInputRef.current = node;
                            }
                          }}
                          inputMode="text"
                          enterKeyHint="done"
                          autoComplete="off"
                          maxLength={4}
                          value={customReactionValue}
                          onChange={(event) => handleCustomEmojiChange(event.target.value)}
                          aria-label="Type an emoji"
                          placeholder="Type or paste an emoji"
                          autoFocus
                        />
                        <button type="submit" className="primary-btn" disabled={!filterEmojiInput(customReactionValue)}>
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
                    </div>
                  )}
                  <span className="reaction-total">
                    {totalReactions ? `${totalReactions} reaction${totalReactions === 1 ? '' : 's'}` : 'Be the first to react'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReactionInsightsModal
        open={reactionInsightState.open}
        anchorRect={reactionInsightState.anchorRect}
        title={reactionInsightState.title}
        subtitle={reactionInsightState.subtitle}
        emoji={reactionInsightState.emoji}
        entries={reactionInsightEntries}
      />
    </div>
  );
}

Feed.propTypes = {
  user: firebaseUserPropType
};
