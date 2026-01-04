import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, getDoc, addDoc, orderBy } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { db } from '../firebase';
import LoadingIndicator from '../components/LoadingIndicator';
import ReactionInsightsModal from '../components/ReactionInsightsModal';
import { logActivityEvents } from '../services/ActivityService';
import updateDreamReaction, { toggleCommentHeart } from '../services/ReactionService';
import fetchUserSummaries from '../services/UserService';
import './DreamDetail.css';
import { firebaseUserPropType } from '../propTypes';
import { COMMON_EMOJI_REACTIONS, filterEmojiInput } from '../constants/emojiOptions';

const PROMPT_TEMPLATES = {
  balanced: 'You\'re here to break down dreams in a way that actually helps. Pick out 1-2 symbols that stand out and explain what they might mean, then drop a reflection question and one small thing they can actually do about it. Keep it real and useful—3-6 sentences max. Be warm but don\'t overcomplicate it.',
  investigator: 'You\'re analyzing this dream like you\'re piecing together clues. Look for patterns, recurring symbols, or subconscious hints and explain why they matter based on what dreams usually mean. Keep it sharp and to the point—3-6 sentences. Be thoughtful but don\'t go overboard with the analysis.',
  therapist: 'You\'re helping someone work through their emotions via their dreams. Validate what they\'re feeling, reflect on what emotional needs or conflicts might be coming up, and ask one gentle question that helps them dig deeper. 3-6 sentences, no judgment. Just supportive and real.',
  coach: 'You\'re checking this dream for stress signals and how their sleep\'s actually doing. Point out anything that screams anxiety, burnout, or restlessness, then suggest one thing they can try tonight to sleep better. 3-6 sentences. Keep it practical and supportive, not preachy.',
  creative: 'You\'re helping turn their dream into story material. Point out the wildest or most vivid parts, suggest how it could work as a plot, character arc, or worldbuilding element, and keep them grounded while firing up their creativity. 3-6 sentences. Be inspiring without being extra.',
  mystical: 'You\'re reading this dream through a spiritual lens, tapping into archetypes and universal symbols like the moon, shadows, journeys, rebirth. Use poetic language and pull out the deeper meaning or soul lesson they need to hear. 3-6 sentences. Be mystical and intentional, not vague.',
  comedian: 'You\'re finding the humor in how absurd dreams can get. Roast the weirdest parts with some playful commentary, but still acknowledge the real feelings underneath. 3-6 sentences. Be funny in a way that lands—warm and clever, not trying too hard.',
  scientist: 'You\'re breaking down the neuroscience behind this dream—REM sleep, memory consolidation, emotional processing, all that. Explain why their brain cooked up this scenario in a way that actually makes sense. 3-6 sentences. Be smart but don\'t make it feel like a textbook.'
};

const PROMPT_LABELS = {
  balanced: 'Balanced guide',
  investigator: 'Detective mode',
  therapist: 'Inner therapist',
  coach: 'Sleep coach',
  creative: 'Story weaver',
  mystical: 'Mystic oracle',
  comedian: 'Dream comedian',
  scientist: 'Brain scientist'
};

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', helper: 'Only you can see this.' },
  { value: 'public', label: 'Public', helper: 'Visible on your profile and feed.' },
  { value: 'following', label: 'Followers only', helper: 'People you follow can see it.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared without your identity.' }
];

const AI_URL = import.meta.env.VITE_AI_ENDPOINT || '/api/ai';
const DEFAULT_EMOJI = '💙';
const ACTIVITY_PRIORITY = { mention: 2, reply: 1, comment: 0 };
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

const visibilityLabel = (v = 'private') => ({
  public: 'Public dream',
  anonymous: 'Anonymous dream',
  following: 'Shared with followers',
  followers: 'Shared with followers'
}[v] || 'Private dream');

const canAccess = (dream, uid, author) => {
  if (!dream) return false;
  if (dream.userId === uid) return true;
  if (!uid) return false;
  
  const excluded = dream.excludedViewerIds || [];
  if (excluded.includes(uid)) return false;
  
  const tagged = dream.taggedUserIds || [];
  if (tagged.includes(uid)) return true;
  
  const vis = dream.visibility || 'private';
  if (vis === 'public' || vis === 'anonymous') return true;
  
  const following = author?.followingIds || [];
  const followers = author?.followerIds || [];
  
  if (vis === 'following') return following.includes(uid);
  if (vis === 'followers') return followers.includes(uid);
  return false;
};

export default function DreamDetail({ user }) {
  const { dreamId } = useParams();
  const navigate = useNavigate();
  const [dream, setDream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [editingContent, setEditingContent] = useState(false);
  const [contentInput, setContentInput] = useState('');
  const [editableTags, setEditableTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [applyingAiTitle, setApplyingAiTitle] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [promptSelectorOpen, setPromptSelectorOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [audienceOptions, setAudienceOptions] = useState([]);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceQuery, setAudienceQuery] = useState('');
  const [excludedViewerIds, setExcludedViewerIds] = useState([]);
  const [taggedPeople, setTaggedPeople] = useState([]);
  const [tagHandle, setTagHandle] = useState('');
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [taggingStatus, setTaggingStatus] = useState('');
  const [viewerProfile, setViewerProfile] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');
  const [commentError, setCommentError] = useState('');
  const [removingCommentId, setRemovingCommentId] = useState(null);
  const [heartingCommentIds, setHeartingCommentIds] = useState(() => new Set());
  const [sharingControlsOpen, setSharingControlsOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [reactionSnapshot, setReactionSnapshot] = useState({ counts: {}, viewerReaction: null });
  const [customEmojiValue, setCustomEmojiValue] = useState('');
  const [customEmojiPickerOpen, setCustomEmojiPickerOpen] = useState(false);
  const [userSummaries, setUserSummaries] = useState({});
  const [reactionInsightState, setReactionInsightState] = useState(INITIAL_INSIGHT_STATE);
  const viewerId = user?.uid || null;
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const location = useLocation();
  const fromNav = location.state?.fromNav || null;
  const commentInputRef = useRef(null);
  const emojiInputRef = useRef(null);
  const userSummariesRef = useRef(userSummaries);
  const reactionInsightOpenRef = useRef(false);
  const hoverCloseTimeoutRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const commentLookup = useMemo(() => (
    comments.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry;
      }
      return acc;
    }, {})
  ), [comments]);
  const parentLookup = useMemo(() => (
    comments.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry.parentCommentId || null;
      }
      return acc;
    }, {})
  ), [comments]);
  const commentThreads = useMemo(() => {
    if (!comments.length) return [];
    const clones = comments.map((entry) => ({ ...entry, replies: [] }));
    const cloneMap = clones.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry;
      }
      return acc;
    }, {});

    const roots = [];
    clones.forEach((entry) => {
      const parentId = entry.parentCommentId;
      if (parentId && cloneMap[parentId]) {
        cloneMap[parentId].replies.push(entry);
      } else {
        roots.push(entry);
      }
    });

    const sortBranch = (node) => {
      if (!node?.replies?.length) return;
      node.replies.sort((a, b) => {
        const aTime = a.createdAt?.getTime?.() || 0;
        const bTime = b.createdAt?.getTime?.() || 0;
        return aTime - bTime;
      });
      node.replies.forEach(sortBranch);
    };

    roots.forEach(sortBranch);
    return roots;
  }, [comments]);

  useEffect(() => {
    userSummariesRef.current = userSummaries;
  }, [userSummaries]);

  useEffect(() => {
    reactionInsightOpenRef.current = reactionInsightState.open;
  }, [reactionInsightState.open]);

  const totalDreamReactions = useMemo(() => (
    Object.values(reactionSnapshot.counts || {}).reduce((sum, value) => sum + (value || 0), 0)
  ), [reactionSnapshot]);

  const reactionEntries = useMemo(() => (
    Object.entries(reactionSnapshot.counts || {})
      .filter(([emoji, count]) => typeof emoji === 'string' && emoji.trim().length && count > 0)
      .sort((a, b) => b[1] - a[1])
  ), [reactionSnapshot]);

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

  const renderReactionSymbol = (emoji) => (
    emoji === DEFAULT_EMOJI
      ? <FontAwesomeIcon icon={faHeart} className="reaction-emoji-icon" aria-hidden="true" />
      : <span className="reaction-emoji" aria-hidden="true">{emoji}</span>
  );

  const ensureUserSummaries = useCallback(async (ids = []) => {
    const normalized = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length))];
    if (!normalized.length) return;
    const missing = normalized.filter((id) => !userSummariesRef.current[id]);
    if (!missing.length) return;
    try {
      const fetched = await fetchUserSummaries(missing);
      if (fetched && Object.keys(fetched).length) {
        setUserSummaries((prev) => ({ ...prev, ...fetched }));
      }
    } catch (error) {
      console.error('Failed to fetch user summaries', error);
    }
  }, []);

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
    await ensureUserSummaries(ids);
    setReactionInsightState({
      open: true,
      anchorRect,
      emoji: payload.emoji || '',
      title: payload.title || 'Reactions',
      subtitle: payload.subtitle || '',
      userIds: ids
    });
  }, [ensureUserSummaries, cancelModalAutoClose]);

  const getDreamReactionUserIds = useCallback((emoji) => {
    if (!emoji || !dream?.viewerReactions) return [];
    return Object.entries(dream.viewerReactions)
      .filter(([, value]) => value === emoji)
      .map(([userId]) => userId)
      .filter(Boolean);
  }, [dream?.viewerReactions]);

  const getCommentHeartUserIds = useCallback((entry) => (
    Object.keys(entry?.heartUserIds || {}).filter((id) => typeof id === 'string' && id.trim().length)
  ), []);

  const buildDreamReactionPayload = useCallback((emoji) => {
    const userIds = getDreamReactionUserIds(emoji);
    if (!userIds.length) return null;
    const countLabel = userIds.length === 1 ? '1 person' : `${userIds.length} people`;
    const actionLabel = emoji === DEFAULT_EMOJI ? 'hearted this dream' : 'reacted this way';
    return {
      title: 'Dream reactions',
      subtitle: `${countLabel} ${actionLabel}`,
      emoji: emoji || '',
      userIds
    };
  }, [getDreamReactionUserIds]);

  const buildCommentHeartPayload = useCallback((entry) => {
    const userIds = getCommentHeartUserIds(entry);
    if (!userIds.length) return null;
    const countLabel = userIds.length === 1 ? '1 person' : `${userIds.length} people`;
    return {
      title: 'Comment hearts',
      subtitle: `${countLabel} hearted this comment`,
      emoji: DEFAULT_EMOJI,
      userIds
    };
  }, [getCommentHeartUserIds]);

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

  const handleDreamReactionHoverStart = useCallback((event, emoji) => {
    const payload = buildDreamReactionPayload(emoji);
    if (!payload) return;
    const anchorRect = event?.currentTarget?.getBoundingClientRect?.();
    openReactionInsight({ ...payload, anchorRect });
  }, [buildDreamReactionPayload, openReactionInsight]);

  const handleDreamReactionTouchStart = useCallback((event, emoji) => {
    const payload = buildDreamReactionPayload(emoji);
    if (!payload) return;
    const anchorElement = event?.currentTarget || null;
    beginLongPressPreview(payload, () => anchorElement?.getBoundingClientRect?.());
  }, [beginLongPressPreview, buildDreamReactionPayload]);

  const handleCommentHeartHoverStart = useCallback((event, entry) => {
    const payload = buildCommentHeartPayload(entry);
    if (!payload) return;
    const anchorRect = event?.currentTarget?.getBoundingClientRect?.();
    openReactionInsight({ ...payload, anchorRect });
  }, [buildCommentHeartPayload, openReactionInsight]);

  const handleCommentHeartTouchStart = useCallback((event, entry) => {
    const payload = buildCommentHeartPayload(entry);
    if (!payload) return;
    const anchorElement = event?.currentTarget || null;
    beginLongPressPreview(payload, () => anchorElement?.getBoundingClientRect?.());
  }, [beginLongPressPreview, buildCommentHeartPayload]);

  const getRootCommentId = (commentId) => {
    if (!commentId) return null;
    let currentId = commentId;
    const visited = new Set();
    while (parentLookup[currentId]) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      currentId = parentLookup[currentId];
    }
    return currentId || commentId;
  };

  const toggleThreadVisibility = (threadId) => {
    if (!threadId) return;
    setExpandedThreads((prev) => ({
      ...prev,
      [threadId]: !prev[threadId]
    }));
  };

  const clearReplyTarget = () => {
    setReplyTarget(null);
  };

  const closeCustomEmojiPicker = () => {
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');
  };

  const openCustomEmojiPicker = () => {
    setCustomEmojiPickerOpen(true);
    setCustomEmojiValue('');
  };

  const handleCustomEmojiChange = (value) => {
    setCustomEmojiValue(filterEmojiInput(value));
  };

  const handleCustomEmojiSubmit = (event) => {
    event.preventDefault();
    const emoji = filterEmojiInput(customEmojiValue);
    if (!emoji) return;
    handleDreamReactionSelection(emoji);
    closeCustomEmojiPicker();
  };

  const handleDreamReactionSelection = useCallback(async (emoji) => {
    if (!viewerId) {
      alert('Sign in to react to dreams');
      return;
    }

    if (!dream?.id) {
      return;
    }

    const previousSnapshot = {
      counts: reactionSnapshot.counts || {},
      viewerReaction: reactionSnapshot.viewerReaction || null
    };

    const currentReaction = previousSnapshot.viewerReaction;
    if (currentReaction && emoji && emoji !== currentReaction) {
      setStatusMessage('Clear your current reaction before choosing another emoji.');
      setCustomEmojiPickerOpen(false);
      setCustomEmojiValue('');
      return;
    }

    const nextReaction = emoji === currentReaction ? null : emoji;
    const optimisticCounts = { ...previousSnapshot.counts };

    if (currentReaction) {
      optimisticCounts[currentReaction] = Math.max((optimisticCounts[currentReaction] || 1) - 1, 0);
    }

    if (nextReaction) {
      optimisticCounts[nextReaction] = (optimisticCounts[nextReaction] || 0) + 1;
    }

    setReactionSnapshot({
      counts: optimisticCounts,
      viewerReaction: nextReaction
    });
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');

    try {
      await updateDreamReaction({
        dreamId: dream.id,
        dreamOwnerId: dream.userId,
        dreamTitleSnapshot: dream.title || dream.aiTitle || 'Dream entry',
        userId: viewerId,
        emoji: nextReaction,
        actorDisplayName: user?.displayName || user?.email || 'NightLink dreamer',
        actorUsername: user?.username || user?.handle || null
      });
    } catch (error) {
      console.error('Failed to update reaction', error);
      setReactionSnapshot(previousSnapshot);
    }
  }, [dream, reactionSnapshot, user, viewerId]);

  const containerClass = 'page-container dream-detail-page';
  const goBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
      return;
    }
    if (fromNav) {
      navigate(fromNav);
      return;
    }
    navigate(isOwner ? '/journal' : '/feed');
  };

  useEffect(() => {
    if (!isOwner) {
      setEditingTitle(false);
      setEditingDate(false);
      setEditingContent(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (!viewerId) {
      setViewerProfile(null);
      setUserSettings(null);
      return undefined;
    }

    let cancelled = false;
    const loadViewerProfile = async () => {
      try {
        const viewerSnap = await getDoc(doc(db, 'users', viewerId));
        if (cancelled) return;
        const data = viewerSnap.exists() ? { id: viewerSnap.id, ...viewerSnap.data() } : null;
        setViewerProfile(data);
        setUserSettings(data?.settings || null);
      } catch {
        if (!cancelled) {
          setViewerProfile(null);
          setUserSettings(null);
        }
      }
    };

    loadViewerProfile();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!dreamId) {
      setError('Missing dream id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    let cancelled = false;

    const ref = doc(db, 'dreams', dreamId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      (async () => {
        if (!snapshot.exists()) {
          if (!cancelled) {
            setError('Dream not found.');
            setDream(null);
            setLoading(false);
          }
          return;
        }

        const data = snapshot.data();
        const ownerId = data.userId || null;
        let resolvedAuthorProfile = null;

        if (ownerId) {
          try {
            const authorSnap = await getDoc(doc(db, 'users', ownerId));
            if (authorSnap.exists()) {
              resolvedAuthorProfile = { id: authorSnap.id, ...authorSnap.data() };
            }
          } catch {
            resolvedAuthorProfile = null;
          }
        }

        const hasAccess = canAccess(data, viewerId, resolvedAuthorProfile);
        if (!hasAccess) {
          if (!cancelled) {
            setError('You do not have permission to view this dream.');
            setDream(null);
            setAuthorProfile(resolvedAuthorProfile);
            setIsOwner(false);
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const createdAtDate = data.createdAt?.toDate?.() ?? data.createdAt ?? null;

        setDream({
          id: snapshot.id,
          ...data,
          visibility: data.visibility || 'private',
          createdAt: createdAtDate
        });
        setAuthorProfile(resolvedAuthorProfile);
        setIsOwner(Boolean(ownerId && viewerId && ownerId === viewerId));
        setTitleInput(data.title || '');
        setDateInput(createdAtDate ? format(createdAtDate, 'yyyy-MM-dd') : '');
        setContentInput(data.content || '');
        setEditableTags(Array.isArray(data.tags) ? data.tags : []);
        setExcludedViewerIds(Array.isArray(data.excludedViewerIds) ? data.excludedViewerIds : []);
        setTaggedPeople(Array.isArray(data.taggedUsers) ? data.taggedUsers : []);
        setTaggingStatus('');
        setTagHandle('');
        setStatusMessage('');
        setLoading(false);
      })();
    }, () => {
      if (!cancelled) {
        setError('Failed to load this dream.');
        setDream(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dreamId, viewerId]);

  useEffect(() => {
    if (!dreamId) {
      setComments([]);
      setCommentsLoading(false);
      return undefined;
    }

    setCommentsLoading(true);
    setCommentError('');
    const commentsRef = collection(db, 'dreams', dreamId, 'comments');
    const commentsQuery = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const nextComments = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const createdAt = data.createdAt?.toDate?.() ?? null;
        const heartUserIds = (data.heartUserIds && typeof data.heartUserIds === 'object') ? data.heartUserIds : {};
        const heartCount = typeof data.heartCount === 'number'
          ? data.heartCount
          : Object.keys(heartUserIds).length;
        return {
          id: docSnap.id,
          ...data,
          heartUserIds,
          heartCount,
          createdAt
        };
      });
      setComments(nextComments);
      setCommentsLoading(false);
    }, () => {
      setCommentError('Could not load comments.');
      setComments([]);
      setCommentsLoading(false);
    });

    return () => unsubscribe();
  }, [dreamId]);

  useEffect(() => {
    if (!dream) {
      setReactionSnapshot({ counts: {}, viewerReaction: null });
      setCustomEmojiPickerOpen(false);
      setCustomEmojiValue('');
      return;
    }

    setReactionSnapshot({
      counts: dream.reactionCounts || {},
      viewerReaction: dream.viewerReactions?.[viewerId] || null
    });
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');
  }, [dream, viewerId]);

  useEffect(() => {
    ensureUserSummaries(Object.keys(dream?.viewerReactions || {}));
  }, [dream?.viewerReactions, ensureUserSummaries]);

  useEffect(() => {
    if (!comments.length) return;
    const ids = comments.flatMap((entry) => Object.keys(entry.heartUserIds || {}));
    ensureUserSummaries(ids);
  }, [comments, ensureUserSummaries]);

  useEffect(() => {
    if (!replyTarget) return;
    if (!comments.some((comment) => comment.id === replyTarget.id)) {
      setReplyTarget(null);
    }
  }, [comments, replyTarget]);

  useEffect(() => {
    if (!customEmojiPickerOpen) {
      return;
    }
    const input = emojiInputRef.current;
    if (!input) {
      return;
    }
    const raf = requestAnimationFrame(() => {
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
  }, [customEmojiPickerOpen]);

  useEffect(() => () => {
    cancelModalAutoClose();
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, [cancelModalAutoClose]);

  const formattedDate = useMemo(() => {
    if (!dream?.createdAt) return '';
    try {
      return format(dream.createdAt, 'MMMM d, yyyy');
    } catch {
      return '';
    }
  }, [dream?.createdAt]);

  useEffect(() => {
    if (!user?.uid || !dream || dream.userId !== user.uid) {
      setAudienceOptions([]);
      setAudienceLoading(false);
      setAudienceQuery('');
      return undefined;
    }

    let cancelled = false;
    setAudienceLoading(true);
    setAudienceQuery('');

    const loadFollowing = async () => {
      try {
        const viewerSnap = await getDoc(doc(db, 'users', user.uid));
        const viewerData = viewerSnap.data() || {};
        const followingIds = Array.isArray(viewerData.followingIds) ? viewerData.followingIds : [];
        const connectionIds = followingIds.filter((id) => id && id !== user.uid);
        if (!connectionIds.length) {
          if (!cancelled) setAudienceOptions([]);
          return;
        }

        const profiles = await Promise.all(
          connectionIds.map(async (id) => {
            try {
              const profileSnap = await getDoc(doc(db, 'users', id));
              if (!profileSnap.exists()) return null;
              const profileData = profileSnap.data();
              return {
                id,
                displayName: profileData.displayName || 'Dreamer',
                username: profileData.username || '',
              };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setAudienceOptions(profiles.filter(Boolean));
        }
      } catch {
        if (!cancelled) setAudienceOptions([]);
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    };

    loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, dream?.userId]);

  const handleVisibilityChange = async (value) => {
    if (!dream || !isOwner || dream.visibility === value) return;
    setUpdatingVisibility(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        visibility: value,
        updatedAt: serverTimestamp()
      });
    } catch {
      setError('Could not update visibility.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!dream || !isOwner) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: titleInput.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingTitle(false);
    } catch {
      setError('Could not update title.');
    }
  };

  const handleSaveDate = async () => {
    if (!dream || !isOwner || !dateInput) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        createdAt: new Date(dateInput),
        updatedAt: serverTimestamp()
      });
      setEditingDate(false);
    } catch {
      setError('Could not update date.');
    }
  };

  const handleCancelContentEdit = () => {
    setEditingContent(false);
    setContentInput(dream?.content || '');
    setEditableTags(Array.isArray(dream?.tags) ? dream.tags : []);
    setNewTag('');
  };

  const handleSaveContent = async () => {
    if (!dream || !isOwner || !contentInput.trim()) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        content: contentInput.trim(),
        tags: editableTags,
        updatedAt: serverTimestamp()
      });
      setEditingContent(false);
      setNewTag('');
    } catch {
      setError('Could not update dream content.');
    }
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || editableTags.some((tag) => tag.value === trimmed)) return;
    setEditableTags((prev) => [...prev, { value: trimmed, category: 'theme' }]);
    setNewTag('');
  };

  const handleRemoveTag = (value) => {
    setEditableTags((prev) => prev.filter((tag) => tag.value !== value));
  };

  const persistAudience = async (nextIds) => {
    if (!dream || !isOwner) return;
    setAudienceBusy(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        excludedViewerIds: nextIds,
        updatedAt: serverTimestamp()
      });
      setExcludedViewerIds(nextIds);
    } catch {
      setError('Could not update audience overrides.');
    } finally {
      setAudienceBusy(false);
    }
  };

  const handleToggleAudience = (viewerId) => {
    if (!viewerId || !dream || !isOwner) return;
    const next = excludedViewerIds.includes(viewerId)
      ? excludedViewerIds.filter((id) => id !== viewerId)
      : [...excludedViewerIds, viewerId];
    persistAudience(next);
  };

  const normalizeHandle = (value = '') => value.replace(/^@/, '').trim().toLowerCase();

  const extractMentionHandles = (value = '') => {
    const matches = new Set();
    const mentionPattern = /@([a-zA-Z0-9_]+)/g;
    let match = mentionPattern.exec(value);
    while (match) {
      const normalized = normalizeHandle(match[1]);
      if (normalized) {
        matches.add(normalized);
      }
      match = mentionPattern.exec(value);
    }
    return Array.from(matches);
  };

  const resolveMentionTargets = async (text = '') => {
    const handles = extractMentionHandles(text);
    if (!handles.length) {
      return { ids: [], handles: [] };
    }

    const idSet = new Set();
    const usersRef = collection(db, 'users');
    const chunkSize = 10;
    const queries = [];
    for (let i = 0; i < handles.length; i += chunkSize) {
      const slice = handles.slice(i, i + chunkSize);
      queries.push(getDocs(query(usersRef, where('normalizedUsername', 'in', slice))));
    }

    try {
      const snapshots = await Promise.all(queries);
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          idSet.add(docSnap.id);
        });
      });
    } catch {
      return { ids: [], handles };
    }

    return {
      ids: Array.from(idSet),
      handles
    };
  };

  const tagSuggestions = useMemo(() => {
    const normalized = normalizeHandle(tagHandle);
    if (!normalized) return [];
    return audienceOptions
      .filter((profile) => {
        if (!profile?.id) return false;
        if (profile.id === user?.uid) return false;
        if (taggedPeople.some((entry) => entry.userId === profile.id)) {
          return false;
        }
        const username = (profile.username || '').toLowerCase();
        const displayName = (profile.displayName || '').toLowerCase();
        return username.includes(normalized) || displayName.includes(normalized);
      })
      .slice(0, 5);
  }, [audienceOptions, tagHandle, taggedPeople, user?.uid]);

  const audienceLookup = useMemo(() => (
    audienceOptions.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {})
  ), [audienceOptions]);

  const filteredAudience = useMemo(() => {
    const normalized = audienceQuery.trim().toLowerCase();
    if (!normalized) return [];
    return audienceOptions.filter((profile) => {
      const label = `${profile.displayName || ''} ${profile.username || ''}`.toLowerCase();
      return label.includes(normalized);
    });
  }, [audienceOptions, audienceQuery]);

  const persistTaggedPeople = async (nextList, successMessage) => {
    if (!dream || !isOwner) return;
    setTaggingBusy(true);
    setTaggingStatus('');
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        taggedUsers: nextList,
        taggedUserIds: nextList.map((entry) => entry.userId),
        updatedAt: serverTimestamp()
      });
      setTaggedPeople(nextList);
      setTagHandle('');
      if (successMessage) {
        setTaggingStatus(successMessage);
      }
    } catch {
      setTaggingStatus('Could not update tagged dreamers.');
    } finally {
      setTaggingBusy(false);
    }
  };

  const handleRemoveTaggedPerson = (personId) => {
    if (!isOwner) return;
    const next = taggedPeople.filter((entry) => entry.userId !== personId);
    persistTaggedPeople(next, 'Removed.');
  };

  const handleSelectTagSuggestion = (profile) => {
    if (!profile?.id || taggingBusy || !isOwner) return;
    if (taggedPeople.some((entry) => entry.userId === profile.id)) {
      setTaggingStatus('Already tagged.');
      return;
    }
    const next = [
      ...taggedPeople,
      {
        userId: profile.id,
        username: profile.username || '',
        displayName: profile.displayName || 'Dreamer'
      }
    ];
    setTagHandle('');
    persistTaggedPeople(next, 'Tagged successfully.');
  };

  const handleAddTaggedPerson = async () => {
    if (taggingBusy || !isOwner) return;
    const raw = tagHandle.trim();
    if (!raw || !user?.uid) return;
    const normalizedHandle = normalizeHandle(raw);
    if (!normalizedHandle) return;
    if (taggedPeople.some((entry) => entry.username?.toLowerCase() === normalizedHandle)) {
      setTaggingStatus('Already tagged.');
      setTagHandle('');
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const matches = await getDocs(query(usersRef, where('normalizedUsername', '==', normalizedHandle), limit(1)));
      if (matches.empty) {
        setTaggingStatus('No user found for that handle.');
        return;
      }

      const match = matches.docs[0];
      if (match.id === user.uid) {
        setTaggingStatus('You are already the author.');
        return;
      }

      if (taggedPeople.some((entry) => entry.userId === match.id)) {
        setTaggingStatus('Already tagged.');
        return;
      }

      const data = match.data();
      const next = [
        ...taggedPeople,
        {
          userId: match.id,
          username: data.username || normalizedHandle,
          displayName: data.displayName || 'Dreamer'
        }
      ];
      await persistTaggedPeople(next, 'Tagged successfully.');
    } catch {
      setTaggingStatus('Could not tag that user.');
    }
  };

  const handleSubmitComment = async () => {
    if (!viewerId || commentBusy) return;
    const trimmed = commentInput.trim();
    const activeDreamId = dream?.id || dreamId;
    if (!trimmed || !activeDreamId) return;

    setCommentBusy(true);
    setCommentStatus('');
    try {
      const currentReplyTarget = replyTarget;
      const mentionTargets = await resolveMentionTargets(trimmed);
      const mentionHandles = Array.isArray(mentionTargets?.handles) ? mentionTargets.handles : [];
      const activityTargets = new Set(mentionTargets.ids);
      if (dream?.userId && dream.userId !== viewerId) {
        activityTargets.add(dream.userId);
      }
      if (currentReplyTarget?.userId && currentReplyTarget.userId !== viewerId) {
        activityTargets.add(currentReplyTarget.userId);
      }
      const activityTargetIds = Array.from(activityTargets);
      const snapshotTitle = dream?.title?.trim()
        || (dream?.aiGenerated ? dream?.aiTitle : '')
        || 'Untitled dream';
      const commentsRef = collection(db, 'dreams', activeDreamId, 'comments');
      const commentDocRef = await addDoc(commentsRef, {
        content: trimmed,
        userId: viewerId,
        authorDisplayName: viewerProfile?.displayName || user?.displayName || 'Dreamer',
        authorUsername: viewerProfile?.username || user?.username || '',
        dreamId: activeDreamId,
        dreamOwnerId: dream?.userId || null,
        dreamOwnerUsername: authorProfile?.username || '',
        dreamTitleSnapshot: snapshotTitle,
        mentions: mentionTargets.ids,
        mentionHandles: mentionTargets.handles,
        parentCommentId: currentReplyTarget?.id || null,
        parentCommentUserId: currentReplyTarget?.userId || null,
        activityTargetIds,
        heartUserIds: {},
        heartCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const actorDisplayName = viewerProfile?.displayName || user?.displayName || 'Dreamer';
      const actorUsername = viewerProfile?.username || user?.username || '';
      const targetEventMap = new Map();
      const registerActivity = (targetId, type) => {
        if (!targetId || targetId === viewerId) return;
        const priority = ACTIVITY_PRIORITY[type] || 0;
        const existing = targetEventMap.get(targetId);
        if (!existing || priority > existing.priority) {
          targetEventMap.set(targetId, { type, priority });
        }
      };

      (mentionTargets.ids || []).forEach((targetId) => registerActivity(targetId, 'mention'));
      if (dream?.userId) {
        registerActivity(dream.userId, 'comment');
      }
      if (currentReplyTarget?.userId) {
        registerActivity(currentReplyTarget.userId, 'reply');
      }

      const basePayload = {
        actorId: viewerId,
        actorDisplayName,
        actorUsername,
        dreamId: activeDreamId,
        dreamOwnerId: dream?.userId || null,
        dreamOwnerUsername: authorProfile?.username || '',
        dreamTitleSnapshot: snapshotTitle,
        commentId: commentDocRef.id,
        parentCommentId: currentReplyTarget?.id || null,
        parentCommentUserId: currentReplyTarget?.userId || null,
        content: trimmed,
        mentionHandles
      };

      const events = Array.from(targetEventMap.entries()).map(([targetUserId, meta]) => ({
        targetUserId,
        payload: {
          ...basePayload,
          type: meta.type
        }
      }));

      if (events.length) {
        try {
          await logActivityEvents(events);
        } catch (activityError) {
          console.error('logActivityEvents failed', activityError);
        }
      }
      setCommentInput('');
      setCommentStatus('Posted.');
      if (currentReplyTarget?.rootId) {
        setExpandedThreads((prev) => ({
          ...prev,
          [currentReplyTarget.rootId]: true
        }));
      }
      setReplyTarget(null);
    } catch {
      setCommentStatus('Could not post your comment.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId, authorId) => {
    if (!commentId || !dream?.id || !viewerId) return;
    if (!isOwner && authorId !== viewerId) return;
    if (!window.confirm('Remove this comment?')) return;

    setRemovingCommentId(commentId);
    setCommentStatus('');
    try {
      await deleteDoc(doc(db, 'dreams', dream.id, 'comments', commentId));
    } catch {
      setCommentStatus('Could not remove that comment.');
    } finally {
      setRemovingCommentId(null);
    }
  };

  const handleReplyToComment = (entry) => {
    if (!viewerId || !entry?.id) return;
    if (entry.authorUsername) {
      const mention = `@${entry.authorUsername}`;
      setCommentInput((prev) => {
        const existing = prev || '';
        if (existing.toLowerCase().includes(mention.toLowerCase())) {
          return existing;
        }
        const spacer = existing.trim().length ? ' ' : '';
        return `${existing}${spacer}${mention} `;
      });
    }
    const rootId = getRootCommentId(entry.id) || entry.id;
    setReplyTarget({
      id: entry.id,
      userId: entry.userId || null,
      authorDisplayName: entry.authorDisplayName || 'Dreamer',
      authorUsername: entry.authorUsername || '',
      rootId
    });
    setExpandedThreads((prev) => ({
      ...prev,
      [rootId]: true
    }));
    setCommentStatus('');
    requestAnimationFrame(() => {
      commentInputRef.current?.focus();
    });
  };

  const handleToggleCommentHeart = async (entry) => {
    if (!viewerId || !dream?.id || !entry?.id) return;
    if (heartingCommentIds.has(entry.id)) return;

    setHeartingCommentIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });

    let previousEntry = null;
    setComments((prev) => prev.map((comment) => {
      if (comment.id !== entry.id) return comment;
      previousEntry = comment;
      const viewerHearted = Boolean(comment.heartUserIds?.[viewerId]);
      const nextMap = { ...(comment.heartUserIds || {}) };
      if (viewerHearted) {
        delete nextMap[viewerId];
      } else {
        nextMap[viewerId] = true;
      }
      const nextCount = Math.max((comment.heartCount || 0) + (viewerHearted ? -1 : 1), 0);
      return {
        ...comment,
        heartUserIds: nextMap,
        heartCount: nextCount
      };
    }));

    try {
      await toggleCommentHeart({
        dreamId: dream.id,
        commentId: entry.id,
        userId: viewerId,
        actorDisplayName: viewerProfile?.displayName || user?.displayName || 'Dreamer',
        actorUsername: viewerProfile?.username || user?.username || '',
        commentAuthorId: entry.userId || null,
        dreamTitleSnapshot: dream?.title || dream?.aiTitle || 'Dream entry'
      });
    } catch (error) {
      console.error('toggleCommentHeart failed', error);
      if (previousEntry) {
        setComments((prev) => prev.map((comment) => (
          comment.id === entry.id ? previousEntry : comment
        )));
      }
    } finally {
      setHeartingCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleAnalyzeDream = async (customPrompt = null) => {
    if (!dream || !isOwner || dream.id.startsWith('local-')) return;

    const trimmedContent = (dream.content || '').trim();
    if (!trimmedContent) {
      setStatusMessage('Dream content is empty, nothing to analyze.');
      return;
    }

    setAnalyzing(true);
    setStatusMessage('');

    try {
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        setStatusMessage('Please sign in again to use AI features.');
        setAnalyzing(false);
        return;
      }

      const requestBody = {
        dreamText: trimmedContent,
        idToken
      };

      if (customPrompt) {
        requestBody.customPrompt = customPrompt;
      }

      const response = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || `Summary service error (HTTP ${response.status})`);
      }

      const generatedTitle = payload?.title?.trim() || '';
      const generatedInsights = (payload?.themes || payload?.summary || payload?.insights || '').trim();
      const updates = { aiGenerated: true };

      if (generatedTitle) {
        updates.aiTitle = generatedTitle;
        if (!dream.title?.trim()) {
          updates.title = generatedTitle;
        }
      }

      if (generatedInsights) {
        updates.aiInsights = generatedInsights;
      }

      if (!generatedTitle || !generatedInsights) {
        throw new Error('AI response was incomplete.');
      }

      await updateDoc(doc(db, 'dreams', dream.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });

      setStatusMessage('Title and summary updated.');
    } catch (err) {
      setStatusMessage(err.message || 'Summary generation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReanalyze = async (promptKey) => {
    if (!dream || !isOwner) return;

    setReanalyzing(true);
    setPromptSelectorOpen(false);
    setStatusMessage('');

    try {
      let customPrompt = null;

      if (promptKey === 'current') {
        const userPromptPreset = userSettings?.aiPromptPreset || 'balanced';
        if (userPromptPreset === 'custom') {
          customPrompt = userSettings?.aiPromptCustom || PROMPT_TEMPLATES.balanced;
        } else {
          customPrompt = PROMPT_TEMPLATES[userPromptPreset] || PROMPT_TEMPLATES.balanced;
        }
      } else if (promptKey && PROMPT_TEMPLATES[promptKey]) {
        customPrompt = PROMPT_TEMPLATES[promptKey];
      }

      await handleAnalyzeDream(customPrompt);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleApplyAiTitle = async () => {
    if (!dream?.aiTitle || !isOwner) return;
    setApplyingAiTitle(true);
    setStatusMessage('');

    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: dream.aiTitle,
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Title updated from AI suggestion.');
    } catch {
      setStatusMessage('Could not apply AI title.');
    } finally {
      setApplyingAiTitle(false);
    }
  };

  const handleDelete = async () => {
    if (!dream || !isOwner || dream.id.startsWith('local-')) return;
    if (!window.confirm('Delete this dream? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'dreams', dream.id));
      navigate('/journal');
    } catch {
      setError('Failed to delete this dream.');
      setDeleting(false);
    }
  };

  const renderCommentCard = (entry, depth = 0) => {
    const canRemove = isOwner || entry.userId === viewerId;
    const relativeTime = entry.createdAt ? formatDistanceToNow(entry.createdAt, { addSuffix: true }) : 'Just now';
    const replyingTo = entry.parentCommentId ? commentLookup[entry.parentCommentId] : null;
    const viewerHearted = Boolean(entry.heartUserIds?.[viewerId]);
    const heartCount = entry.heartCount || 0;
    const heartDisabled = heartingCommentIds.has(entry.id);
    return (
      <div className={`comment-card${depth ? ' comment-card-reply' : ''}`}>
        <div className="comment-meta">
          <div className="comment-meta-names">
            <span className="comment-author">{entry.authorDisplayName || 'Dreamer'}</span>
            {entry.authorUsername && <span className="comment-handle">@{entry.authorUsername}</span>}
          </div>
          <span className="comment-time">{relativeTime}</span>
        </div>
        {replyingTo && (
          <p className="comment-reply-context">
            Replying to {replyingTo.authorUsername ? `@${replyingTo.authorUsername}` : replyingTo.authorDisplayName || 'this comment'}
          </p>
        )}
        <p className="comment-body">{entry.content || ''}</p>
        {(viewerId || canRemove) ? (
          <div className="comment-actions">
            {viewerId ? (
              <button
                type="button"
                className={`comment-heart-btn${viewerHearted ? ' active' : ''}`}
                onClick={(event) => {
                  if (consumeSuppressedClick(event)) return;
                  handleToggleCommentHeart(entry);
                }}
                disabled={heartDisabled}
                aria-pressed={viewerHearted}
                onMouseEnter={(event) => handleCommentHeartHoverStart(event, entry)}
                onMouseLeave={scheduleModalAutoClose}
                onTouchStart={(event) => handleCommentHeartTouchStart(event, entry)}
                onTouchEnd={handleTouchEndInteraction}
                onTouchCancel={handleTouchEndInteraction}
                onTouchMove={handleTouchMoveInteraction}
              >
                <FontAwesomeIcon icon={faHeart} />
                <span className="comment-heart-count">{heartCount}</span>
              </button>
            ) : <span />}
            <div className="comment-action-links">
              {viewerId ? (
                <button
                  type="button"
                  className="comment-reply-btn"
                  onClick={() => handleReplyToComment(entry)}
                >
                  Reply
                </button>
              ) : null}
              {canRemove && (
                <button
                  type="button"
                  className="comment-delete-btn"
                  onClick={() => handleDeleteComment(entry.id, entry.userId)}
                  disabled={removingCommentId === entry.id}
                >
                  {removingCommentId === entry.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderCommentThread = (entry, depth = 0) => {
    const hasReplies = Array.isArray(entry.replies) && entry.replies.length > 0;
    if (depth === 0) {
      const isExpanded = expandedThreads[entry.id];
      return (
        <div key={entry.id} className="comment-thread">
          {renderCommentCard(entry, depth)}
          {hasReplies && (
            <>
              <button
                type="button"
                className="comment-replies-toggle"
                onClick={() => toggleThreadVisibility(entry.id)}
              >
                {isExpanded ? 'Hide replies' : `View replies (${entry.replies.length})`}
              </button>
              {isExpanded && (
                <div className="comment-thread-children">
                  {entry.replies.map((child) => renderCommentThread(child, depth + 1))}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    return (
      <div key={entry.id} className="comment-thread nested">
        {renderCommentCard(entry, depth)}
        {hasReplies && (
          <div className="comment-thread-children">
            {entry.replies.map((child) => renderCommentThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={containerClass}>
        <div className="detail-placeholder loading-slot">
          <LoadingIndicator label="Loading dream…" size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={goBack}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Go back</span>
        </button>
        <div className="detail-error">{error}</div>
      </div>
    );
  }

  if (!dream) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={goBack}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Go back</span>
        </button>
        <div className="detail-error">Dream not available.</div>
      </div>
    );
  }

  const titleText = dream.title?.trim() || (dream.aiGenerated && dream.aiTitle) || 'Untitled dream';
  const hasAudienceQuery = audienceQuery.trim().length > 0;
  const commentCountLabel = comments.length ? ` (${comments.length})` : '';
  const visibilitySummary = visibilityLabel(dream.visibility);

  return (
    <div className={containerClass}>
      <div className="detail-card">
        <div className="detail-toolbar">
          <button
            type="button"
            className="detail-back-btn"
            onClick={goBack}
          >
            <span className="detail-back-icon" aria-hidden="true">&larr;</span>
            <span>Go back</span>
          </button>
        </div>
        <div className="detail-head">
          <div className="detail-title-block">
            {isOwner ? (
              editingTitle ? (
                <div className="detail-title-edit">
                  <input
                    type="text"
                    className="detail-title-input"
                    placeholder="Enter a title"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveTitle();
                      }
                    }}
                    autoFocus
                  />
                  <button type="button" className="ghost-btn" onClick={handleSaveTitle}>Save</button>
                  <button type="button" className="ghost-btn" onClick={() => setEditingTitle(false)}>Cancel</button>
                </div>
              ) : (
                <h1 className="detail-title">
                  <button
                    type="button"
                    className="detail-title-editable"
                    onClick={() => setEditingTitle(true)}
                  >
                    {titleText} <span className="edit-hint">✎</span>
                  </button>
                </h1>
              )
            ) : (
              <h1 className="detail-title">{titleText}</h1>
            )}
          </div>
          <div className="detail-date-block">
            {isOwner && editingDate ? (
              <div className="detail-date-edit detail-date-edit--standalone">
                <input
                  type="date"
                  className="detail-date-input"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                />
                <button type="button" className="ghost-btn" onClick={handleSaveDate}>Save</button>
                <button type="button" className="ghost-btn" onClick={() => setEditingDate(false)}>Cancel</button>
              </div>
            ) : formattedDate ? (
              isOwner ? (
                <button
                  type="button"
                  className="detail-date-pill detail-date-pill--interactive"
                  onClick={() => setEditingDate(true)}
                >
                  {formattedDate}
                  <span className="edit-hint">✎</span>
                </button>
              ) : (
                <div className="detail-date-pill">{formattedDate}</div>
              )
            ) : null}
          </div>
        </div>

        <div className="detail-body">
            {isOwner && editingContent ? (
              <>
                <textarea
                  className="detail-textarea"
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                />
                <div className="detail-tags-editor">
                  <label htmlFor="detail-tag-input">Tags</label>
                  <div className="detail-tag-input-row">
                    <input
                      id="detail-tag-input"
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add a tag"
                    />
                    <button type="button" className="add-tag-btn" onClick={handleAddTag}>+ Tag</button>
                  </div>
                  {editableTags.length ? (
                    <div className="detail-tag-list">
                      {editableTags.map((tag) => (
                        <span className="detail-tag-chip" key={`edit-tag-${tag.value}`}>
                          {tag.value}
                          <button type="button" className="detail-tag-remove" onClick={() => handleRemoveTag(tag.value)} aria-label={`Remove tag ${tag.value}`}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="detail-edit-actions">
                  <button type="button" className="ghost-btn" onClick={handleCancelContentEdit}>Cancel</button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleSaveContent}
                    disabled={!contentInput.trim()}
                  >
                    Save changes
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{dream.content}</p>
                {dream.tags?.length ? (
                  <div className="detail-tags detail-tags-inline">
                    {dream.tags.map((tag, index) => (
                      <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
                    ))}
                  </div>
                ) : null}
                {isOwner && (
                  <button type="button" className="ghost-btn" onClick={() => {
                    setEditingContent(true);
                    setContentInput(dream.content || '');
                    setEditableTags(Array.isArray(dream.tags) ? dream.tags : []);
                  }}>
                    Edit content
                  </button>
                )}
              </>
            )}
          </div>

        <div className="activity-reactions detail-reactions" aria-label="Dream reactions">
          <div className="reaction-buttons">
            <button
              type="button"
              className={`reaction-button${reactionSnapshot.viewerReaction === DEFAULT_EMOJI ? ' active' : ''}`}
              onClick={(event) => {
                if (consumeSuppressedClick(event)) return;
                handleDreamReactionSelection(DEFAULT_EMOJI);
              }}
              aria-label="React with a heart"
            >
              <FontAwesomeIcon icon={faHeart} className="reaction-icon" />
              <span className="reaction-count">{reactionSnapshot.counts?.[DEFAULT_EMOJI] || 0}</span>
            </button>
            <button
              type="button"
              className="reaction-button custom-emoji-trigger"
              onClick={openCustomEmojiPicker}
              aria-label="Add a custom emoji reaction"
            >
              <FontAwesomeIcon icon={faPlus} className="reaction-icon" />
              <span className="reaction-count">Emoji</span>
            </button>
            <button
              type="button"
              className="reaction-button clear-reaction"
              disabled={!reactionSnapshot.viewerReaction}
              onClick={() => handleDreamReactionSelection(null)}
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
                    handleDreamReactionSelection(emoji);
                  }}
                  aria-label={`React with ${emoji}`}
                  onMouseEnter={(event) => handleDreamReactionHoverStart(event, emoji)}
                  onMouseLeave={scheduleModalAutoClose}
                  onTouchStart={(event) => handleDreamReactionTouchStart(event, emoji)}
                  onTouchEnd={handleTouchEndInteraction}
                  onTouchCancel={handleTouchEndInteraction}
                  onTouchMove={handleTouchMoveInteraction}
                >
                  {renderReactionSymbol(emoji)}
                  <span className="reaction-count">{count}</span>
                </button>
              ))}
            </div>
          )}
          {customEmojiPickerOpen && (
            <div className="custom-emoji-popover">
              <div className="emoji-picker-grid" role="listbox" aria-label="Emoji suggestions">
                {COMMON_EMOJI_REACTIONS.map((emoji) => (
                  <button
                    key={`picker-${emoji}`}
                    type="button"
                    className="emoji-option"
                    onClick={() => handleDreamReactionSelection(emoji)}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span className="sr-only">React with {emoji}</span>
                  </button>
                ))}
              </div>
              <form className="emoji-input-row" onSubmit={handleCustomEmojiSubmit}>
                <input
                  type="text"
                  ref={emojiInputRef}
                  inputMode="text"
                  enterKeyHint="done"
                  autoComplete="off"
                  maxLength={4}
                  value={customEmojiValue}
                  onChange={(event) => handleCustomEmojiChange(event.target.value)}
                  aria-label="Type an emoji"
                  placeholder="Type or paste an emoji"
                  autoFocus
                />
                <button type="submit" className="primary-btn" disabled={!filterEmojiInput(customEmojiValue)}>
                  Add
                </button>
                <button type="button" className="ghost-btn" onClick={closeCustomEmojiPicker}>
                  Cancel
                </button>
              </form>
            </div>
          )}
          <span className="reaction-total">
            {totalDreamReactions ? `${totalDreamReactions} reaction${totalDreamReactions === 1 ? '' : 's'}` : 'Be the first to react'}
          </span>
        </div>

        {statusMessage && (
          <p className="detail-status-message">{statusMessage}</p>
        )}

        <div className="detail-summary">
            <div>
              <h3>Summary</h3>
              {dream.aiGenerated && dream.aiInsights ? (
                <p className="detail-insight">{dream.aiInsights}</p>
              ) : (
                <p className="detail-insight muted">No summary yet.</p>
              )}
            </div>
            {isOwner && !dream.aiGenerated ? (
              <button
                type="button"
                className="primary-btn"
                onClick={handleAnalyzeDream}
                disabled={analyzing}
              >
                {analyzing ? 'Generating title & summary…' : 'Generate title & summary'}
              </button>
            ) : null}
            {isOwner && dream.aiGenerated ? (
              <div className="reanalyze-controls">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setPromptSelectorOpen(!promptSelectorOpen)}
                  disabled={reanalyzing || analyzing}
                >
                  {reanalyzing ? 'Regenerating…' : 'Regenerate with different prompt'}
                </button>
                {promptSelectorOpen && (
                  <div className="prompt-selector-panel">
                    <p className="prompt-selector-label">Choose a prompt style:</p>
                    <button
                      type="button"
                      className="prompt-option-btn current-prompt"
                      onClick={() => handleReanalyze('current')}
                      disabled={reanalyzing}
                    >
                      <strong>Use my settings</strong>
                      <span>({PROMPT_LABELS[userSettings?.aiPromptPreset] || 'Balanced guide'})</span>
                    </button>
                    <div className="prompt-options-grid">
                      {Object.keys(PROMPT_TEMPLATES).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="prompt-option-btn"
                          onClick={() => handleReanalyze(key)}
                          disabled={reanalyzing}
                        >
                          {PROMPT_LABELS[key]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setPromptSelectorOpen(false)}
                      style={{ marginTop: '0.5rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

        {isOwner && dream.aiGenerated && dream.aiTitle && dream.aiTitle !== (dream.title || '').trim() ? (
          <div className="ai-title-hint">
            <p className="ai-title-label">AI suggestion: <span>{dream.aiTitle}</span></p>
            <button
              type="button"
              className="ghost-btn"
              onClick={handleApplyAiTitle}
              disabled={applyingAiTitle}
            >
              {applyingAiTitle ? 'Applying…' : 'Use AI title'}
            </button>
          </div>
        ) : null}

        <div className="detail-comments">
          <div className="detail-section-head">
            <p className="detail-label">Comments{commentCountLabel}</p>
          </div>
          {commentsLoading ? (
            <div className="loading-inline">
              <LoadingIndicator label="Loading comments…" size="sm" align="start" />
            </div>
          ) : commentError ? (
            <p className="detail-hint">{commentError}</p>
          ) : commentThreads.length ? (
            <div className="comments-list">
              {commentThreads.map((entry) => renderCommentThread(entry))}
            </div>
          ) : (
            <p className="detail-hint">No comments yet. Be the first to add one.</p>
          )}
          {viewerId ? (
            <div className="comment-composer">
              {replyTarget && (
                <div className="reply-context">
                  <span>
                    Replying to {replyTarget.authorUsername ? `@${replyTarget.authorUsername}` : replyTarget.authorDisplayName}
                  </span>
                  <button type="button" onClick={clearReplyTarget}>
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                ref={commentInputRef}
                placeholder="Add a thoughtful note"
                value={commentInput}
                onChange={(e) => {
                  setCommentInput(e.target.value);
                  if (commentStatus) {
                    setCommentStatus('');
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <div className="comment-composer-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSubmitComment}
                  disabled={commentBusy || !commentInput.trim()}
                >
                  {commentBusy ? 'Posting…' : 'Post comment'}
                </button>
              </div>
              {commentStatus && <p className="detail-hint composer-status">{commentStatus}</p>}
            </div>
          ) : (
            <p className="detail-hint">Sign in to add your take.</p>
          )}
        </div>

        {isOwner && (
          <div className="detail-share-accordion">
            <button
              type="button"
              className="detail-share-toggle"
              onClick={() => setSharingControlsOpen((prev) => !prev)}
              aria-expanded={sharingControlsOpen}
            >
              <div>
                <p className="detail-label">Sharing options</p>
                <p className="detail-hint">{visibilitySummary}</p>
              </div>
              <span className={`share-toggle-icon${sharingControlsOpen ? ' open' : ''}`} aria-hidden="true">›</span>
            </button>
            {sharingControlsOpen && (
              <div className="detail-share-panel">
                <div className="detail-visibility">
                  <p className="detail-label">Visibility</p>
                  <div className="detail-visibility-options">
                    {VISIBILITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={(dream.visibility === option.value || (option.value === 'following' && dream.visibility === 'followers')) ? 'pill pill-active' : 'pill'}
                        onClick={() => handleVisibilityChange(option.value)}
                        disabled={updatingVisibility}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {dream.visibility !== 'private' && (
                  <div className="detail-audience">
                    <div className="detail-section-head">
                      <p className="detail-label">Hide from specific people</p>
                      <p className="detail-hint">Search your following to keep certain dreamers from seeing this entry.</p>
                    </div>
                    {audienceLoading ? (
                      <div className="loading-inline">
                        <LoadingIndicator label="Loading your following…" size="sm" align="start" />
                      </div>
                    ) : audienceOptions.length === 0 ? (
                      <p className="detail-hint">Follow people to curate this list.</p>
                    ) : (
                      <>
                        <div className="audience-search-input">
                          <input
                            type="text"
                            placeholder="Search your following"
                            value={audienceQuery}
                            onChange={(e) => setAudienceQuery(e.target.value)}
                          />
                        </div>
                        {!hasAudienceQuery ? (
                          <p className="detail-hint">Start typing to search your following.</p>
                        ) : (
                          <div className="audience-result-list">
                            {filteredAudience.length ? (
                              filteredAudience.map((profile) => {
                                const isHidden = excludedViewerIds.includes(profile.id);
                                return (
                                  <button
                                    key={profile.id}
                                    type="button"
                                    className={`audience-result${isHidden ? ' active' : ''}`}
                                    onClick={() => handleToggleAudience(profile.id)}
                                    disabled={audienceBusy}
                                  >
                                    <div className="audience-result-meta">
                                      <span className="result-name">{profile.displayName}</span>
                                      {profile.username && <span className="result-handle">@{profile.username}</span>}
                                    </div>
                                    <span className="result-status">{isHidden ? 'Hidden' : 'Visible'}</span>
                                  </button>
                                );
                              })
                            ) : (
                              <p className="detail-hint">
                                No matches for &ldquo;{audienceQuery}&rdquo;.
                              </p>
                            )}
                          </div>
                        )}
                        {excludedViewerIds.length > 0 && (
                          <div className="selected-pill-row">
                            {excludedViewerIds.map((id) => {
                              const profile = audienceLookup[id];
                              const label = profile?.username ? `@${profile.username}` : profile?.displayName || 'Dreamer';
                              return (
                                <span key={id} className="selected-pill">
                                  {label}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAudience(id)}
                                    aria-label={`Remove ${label}`}
                                    disabled={audienceBusy}
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                    {audienceBusy && <p className="detail-hint">Updating…</p>}
                  </div>
                )}

                <div className="detail-tagged">
                  <p className="detail-label">Tag people</p>
                  <div className="tag-people-input">
                    <input
                      type="text"
                      placeholder="@username"
                      value={tagHandle}
                      onChange={(e) => {
                        setTagHandle(e.target.value);
                        setTaggingStatus('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTaggedPerson();
                        }
                      }}
                    />
                    <button type="button" className="add-tag-btn" onClick={handleAddTaggedPerson} disabled={taggingBusy || !tagHandle.trim()}>
                      {taggingBusy ? 'Tagging…' : 'Tag'}
                    </button>
                  </div>
                  {tagSuggestions.length > 0 && (
                    <div className="tag-suggestion-list">
                      {tagSuggestions.map((profile) => (
                        <button
                          type="button"
                          key={profile.id}
                          className="tag-suggestion-item"
                          onClick={() => handleSelectTagSuggestion(profile)}
                          disabled={taggingBusy}
                        >
                          <span className="suggestion-name">{profile.displayName}</span>
                          {profile.username && <span className="suggestion-username">@{profile.username}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {taggingStatus && <p className="detail-hint">{taggingStatus}</p>}
                  {taggedPeople.length ? (
                    <div className="tagged-pill-row">
                      {taggedPeople.map((entry) => (
                        <span key={entry.userId} className="tagged-pill">
                          @{entry.username || entry.displayName}
                          <button type="button" aria-label={`Remove ${entry.username || entry.displayName}`} onClick={() => handleRemoveTaggedPerson(entry.userId)} disabled={taggingBusy}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="detail-hint">Tagged dreamers will see this on their profile.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className="secondary-btn" onClick={goBack}>
            Close
          </button>
          {isOwner && (
            <button
              type="button"
              className="danger-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete dream'}
            </button>
          )}
        </div>
      </div>

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

DreamDetail.propTypes = {
  user: firebaseUserPropType
};
