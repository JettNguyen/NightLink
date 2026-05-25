import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightFromBracket, faPencil, faGear } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';
import { mapProfile, mapDream } from '../utils/mappers';
import { AVATAR_ICONS, AVATAR_BACKGROUNDS, AVATAR_COLORS, DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import { formatDreamDate } from '../utils/dates';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics';
import { logActivityEvent } from '../services/ActivityService';
import Toast from '../components/Toast';
import './Profile.css';
import { appUserPropType } from '../propTypes';

const DEFAULT_API_ORIGIN = 'https://www.nightlink.dev';

const resolveAccountEndpoint = () => {
  const configuredEndpoint = (import.meta.env.VITE_ACCOUNT_ENDPOINT || '').trim();
  if (configuredEndpoint) return configuredEndpoint;

  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (configuredApiBase) return `${configuredApiBase.replace(/\/$/, '')}/api/account`;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return '/api/account';
  }

  return `${DEFAULT_API_ORIGIN}/api/account`;
};

const ACCOUNT_ENDPOINT = resolveAccountEndpoint();

export default function Profile({ user }) {
  const { handle: routeHandle } = useParams();
  const [targetUserId, setTargetUserId] = useState(() => (routeHandle ? null : (user?.uid || null)));
  const viewingOwnProfile = Boolean(user?.uid && targetUserId && targetUserId === user.uid);
  const [userData, setUserData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [dreams, setDreams] = useState([]);
  const [dreamsLoading, setDreamsLoading] = useState(true);
  const [taggedDreams, setTaggedDreams] = useState([]);
  const [taggedDreamsLoading, setTaggedDreamsLoading] = useState(true);
  const [dreamTab, setDreamTab] = useState('authored');
  const [isEditing, setIsEditing] = useState(false);
  const [avatarIcon, setAvatarIcon] = useState(AVATAR_ICONS[0].id);
  const [avatarBackground, setAvatarBackground] = useState(AVATAR_BACKGROUNDS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [viewerData, setViewerData] = useState(null);
  const [followAction, setFollowAction] = useState({ type: null });
  const [connectionListType, setConnectionListType] = useState(null);
  const [connectionProfiles, setConnectionProfiles] = useState([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const navigate = useNavigate();
  const viewerId = user?.uid || null;
  const editingRef = useRef(false);
  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  useEffect(() => { editingRef.current = isEditing; }, [isEditing]);

  // Resolve handle → targetUserId
  useEffect(() => {
    if (!routeHandle) {
      setTargetUserId(user?.uid || null);
      setProfileNotFound(false);
      return;
    }

    let cancelled = false;
    const resolveHandle = async () => {
      setProfileLoading(true);
      setProfileNotFound(false);
      setUserData(null);
      try {
        // Try as UUID first (direct ID)
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(routeHandle)) {
          const { data } = await supabase.from('profiles').select('id').eq('id', routeHandle).single();
          if (!cancelled && data) { setTargetUserId(data.id); return; }
        }
        // Fall back to normalized username lookup
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('normalized_username', routeHandle.toLowerCase())
          .single();
        if (!cancelled) {
          if (data) { setTargetUserId(data.id); }
          else { setTargetUserId(null); setProfileNotFound(true); setProfileLoading(false); }
        }
      } catch {
        if (!cancelled) { setTargetUserId(null); setProfileNotFound(true); setProfileLoading(false); }
      }
    };
    resolveHandle();
    return () => { cancelled = true; };
  }, [routeHandle, user?.uid]);

  // Load viewer's own profile (for following state)
  useEffect(() => {
    if (!viewerId) { setViewerData(null); return; }
    supabase.from('profiles').select('following_ids, follower_ids, username, settings').eq('id', viewerId).single()
      .then(({ data }) => setViewerData(data ? mapProfile(data) : null));
  }, [viewerId]);

  // Load target user profile
  useEffect(() => {
    if (!targetUserId) return;
    setProfileNotFound(false);
    setProfileLoading(true);
    setUserData(null);
    setDreams([]);
    setDreamsLoading(true);
    setTaggedDreams([]);
    setTaggedDreamsLoading(true);
    setConnectionProfiles([]);
    setConnectionListType(null);
    setIsEditing(false);
    setDreamTab('authored');

    supabase.from('profiles').select('*').eq('id', targetUserId).single()
      .then(({ data }) => {
        if (!data) { setProfileNotFound(true); setProfileLoading(false); return; }
        const p = mapProfile(data);
        setUserData(p);
        if (!editingRef.current) {
          setDisplayName(p.displayName || '');
          setUsername(p.username || '');
          setBio(p.settings?.bio || '');
          if (targetUserId === viewerId) {
            setAvatarIcon(p.avatarIcon || AVATAR_ICONS[0].id);
            setAvatarBackground(p.avatarBackground || AVATAR_BACKGROUNDS[0]);
            setAvatarColor(p.avatarColor || AVATAR_COLORS[0]);
          }
        }
        setProfileLoading(false);
      });
  }, [targetUserId, viewerId]);

  // Load dreams for target user
  useEffect(() => {
    if (!targetUserId) return;
    let q = supabase.from('dreams').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false });
    if (!viewingOwnProfile) q = q.in('visibility', ['public', 'anonymous', 'following', 'followers']);
    q.then(({ data }) => {
      setDreams((data || []).map(mapDream));
      setDreamsLoading(false);
    });
  }, [targetUserId, viewingOwnProfile]);

  // Load tagged dreams
  useEffect(() => {
    if (!targetUserId) { setTaggedDreams([]); setTaggedDreamsLoading(false); return; }
    setTaggedDreamsLoading(true);
    supabase.from('dreams').select('*').contains('tagged_user_ids', [targetUserId])
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const baseList = (data || []).map(mapDream);
        const authorIds = [...new Set(baseList.map((d) => d.userId).filter((id) => id && id !== targetUserId))];
        let authorMap = {};
        if (authorIds.length) {
          const { data: profiles } = await supabase.from('profiles').select('id, display_name, username').in('id', authorIds);
          (profiles || []).forEach((p) => { authorMap[p.id] = p; });
        }
        setTaggedDreams(baseList.map((d) => authorMap[d.userId] ? { ...d, authorProfile: mapProfile({ ...authorMap[d.userId], id: d.userId }) } : d));
        setTaggedDreamsLoading(false);
      });
  }, [targetUserId]);

  // Load connections (followers/following list)
  useEffect(() => {
    if (!connectionListType || !userData) { setConnectionProfiles([]); setConnectionLoading(false); return; }
    const ids = connectionListType === 'followers' ? (userData.followerIds || []) : (userData.followingIds || []);
    if (!ids.length) { setConnectionProfiles([]); setConnectionLoading(false); return; }
    setConnectionLoading(true);
    supabase.from('profiles').select('id, display_name, username, avatar_icon, avatar_background, avatar_color').in('id', ids)
      .then(({ data }) => {
        setConnectionProfiles((data || []).map(mapProfile));
        setConnectionLoading(false);
      });
  }, [connectionListType, userData?.followerIds, userData?.followingIds]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!viewingOwnProfile || !user?.uid) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        display_name:     displayName.trim(),
        username:         username.trim() || userData.username,
        normalized_username: (username.trim() || userData.username).toLowerCase(),
        avatar_icon:      avatarIcon,
        avatar_background: avatarBackground,
        avatar_color:     avatarColor,
        settings:         { ...(userData.settings || {}), bio: bio.trim() || null },
      }).eq('id', user.uid);
      if (error) throw error;
      setIsEditing(false);
      // Refresh local state
      const { data } = await supabase.from('profiles').select('*').eq('id', user.uid).single();
      if (data) setUserData(mapProfile(data));
      void triggerMediumHaptic();
    } catch {
      setToast('Failed to update profile.');
    }
    setLoading(false);
  };

  const handleFollow = async () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'follow' });
    try {
      const { error } = await supabase.rpc('follow_user', { target_id: targetUserId });
      if (error) throw error;
      setViewerData((prev) => prev ? { ...prev, followingIds: [...new Set([...(prev.followingIds || []), targetUserId])] } : prev);
      setUserData((prev) => prev ? { ...prev, followerIds: [...new Set([...(prev.followerIds || []), user.uid])] } : prev);
      void triggerLightHaptic();
      void logActivityEvent(targetUserId, {
        actorId: user.uid,
        actorDisplayName: viewerData?.displayName || null,
        actorUsername: viewerData?.username || null,
        type: 'follow',
      });
    } catch { setToast('Unable to follow this user.'); }
    finally { setFollowAction({ type: null }); }
  }

  const handleUnfollow = async () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'unfollow' });
    try {
      const { error } = await supabase.rpc('unfollow_user', { target_id: targetUserId });
      if (error) throw error;
      setViewerData((prev) => prev ? { ...prev, followingIds: (prev.followingIds || []).filter((id) => id !== targetUserId) } : prev);
      setUserData((prev) => prev ? { ...prev, followerIds: (prev.followerIds || []).filter((id) => id !== user.uid) } : prev);
      void triggerLightHaptic();
      void supabase.from('activity').delete()
        .eq('target_user_id', targetUserId).eq('actor_id', user.uid).eq('type', 'follow');
    } catch { setToast('Unable to unfollow right now.'); }
    finally { setFollowAction({ type: null }); }
  }

  const handleBlockUser = async () => {
    if (!viewerId || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'block' });
    try {
      const currentSettings = viewerData?.settings || {};
      const currentBlocked = Array.isArray(currentSettings.blockedUserIds) ? currentSettings.blockedUserIds : [];
      const nextBlocked = [...new Set([...currentBlocked, targetUserId])];
      const { error } = await supabase
        .from('profiles')
        .update({ settings: { ...currentSettings, blockedUserIds: nextBlocked } })
        .eq('id', viewerId);
      if (error) throw error;
      setViewerData((prev) => prev ? { ...prev, settings: { ...(prev.settings || {}), blockedUserIds: nextBlocked } } : prev);
      // Auto-unfollow the blocked user in both directions.
      const isFollowing = (viewerData?.followingIds || []).includes(targetUserId);
      if (isFollowing) {
        await supabase.rpc('unfollow_user', { target_id: targetUserId });
        setViewerData((prev) => prev ? { ...prev, followingIds: (prev.followingIds || []).filter((id) => id !== targetUserId) } : prev);
        setUserData((prev) => prev ? { ...prev, followerIds: (prev.followerIds || []).filter((id) => id !== viewerId) } : prev);
      }
      setToast('User blocked. Their content is now hidden from your feed.');
    } catch {
      setToast('Could not block this user right now.');
    } finally {
      setFollowAction({ type: null });
    }
  };

  const handleUnblockUser = async () => {
    if (!viewerId || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'unblock' });
    try {
      const currentSettings = viewerData?.settings || {};
      const currentBlocked = Array.isArray(currentSettings.blockedUserIds) ? currentSettings.blockedUserIds : [];
      const nextBlocked = currentBlocked.filter((id) => id !== targetUserId);
      const { error } = await supabase
        .from('profiles')
        .update({ settings: { ...currentSettings, blockedUserIds: nextBlocked } })
        .eq('id', viewerId);
      if (error) throw error;
      setViewerData((prev) => prev ? { ...prev, settings: { ...(prev.settings || {}), blockedUserIds: nextBlocked } } : prev);
      setToast('User unblocked.');
    } catch {
      setToast('Could not unblock this user right now.');
    } finally {
      setFollowAction({ type: null });
    }
  };

  const handleReportUser = () => {
    if (!viewerId || !targetUserId || viewingOwnProfile) return;
    setReportReason('');
    setReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (!reportReason.trim()) return;
    setReportBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const idToken = sessionData?.session?.access_token;
      if (!idToken) throw new Error('Please sign in again before reporting.');

      const response = await fetch(ACCOUNT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          action: 'report_content',
          uid: viewerId,
          targetType: 'user',
          targetId: targetUserId,
          targetUserId,
          reason: reportReason.trim(),
          details: `Reported profile from @${userData?.username || 'unknown'}`
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Could not submit report.');
      setReportModal(false);
      setReportReason('');
      setToast('Report submitted. We review safety reports within 24 hours.');
    } catch (error) {
      setToast(error.message || 'Could not submit report.');
    } finally {
      setReportBusy(false);
      setFollowAction({ type: null });
    }
  };

  const handleDreamNavigation = useCallback((dreamId, ownerUsername, ownerId) => {
    if (!dreamId) return;
    const slug = ownerUsername || userData?.username || '';
    const owner = ownerId || targetUserId;
    navigate(buildDreamPath(slug, owner, dreamId), { state: { fromNav: '/profile' } });
  }, [userData?.username, navigate, targetUserId]);

  const handleProfileNavigation = useCallback((profile) => {
    if (!profile) return;
    if (typeof profile === 'string') { navigate(buildProfilePath(null, profile)); setConnectionListType(null); return; }
    navigate(buildProfilePath(profile.username, profile.id));
    setConnectionListType(null);
  }, [navigate]);

  const viewerFollowingIds  = viewerData?.followingIds || [];
  const viewerBlockedIds = Array.isArray(viewerData?.settings?.blockedUserIds) ? viewerData.settings.blockedUserIds : [];
  const targetFollowerIds   = userData?.followerIds  || [];
  const targetFollowingIds  = userData?.followingIds || [];
  const isFollowingTarget   = !viewingOwnProfile && viewerFollowingIds.includes(targetUserId);
  const isBlockedTarget = !viewingOwnProfile && viewerBlockedIds.includes(targetUserId);
  const followsYou          = !viewingOwnProfile && targetFollowingIds.includes(user?.uid);
  const viewerFollowedByTarget = useMemo(() => !viewingOwnProfile && !!viewerId && targetFollowingIds.includes(viewerId), [viewerId, viewingOwnProfile, targetFollowingIds]);
  const connectionHeadingName = userData?.displayName || 'this dreamer';
  const activeProfileUsername = viewingOwnProfile ? (userData?.username || viewerData?.username || '') : (userData?.username || '');
  const displayAvatarIconId  = viewingOwnProfile ? (avatarIcon || AVATAR_ICONS[0].id)       : (userData?.avatarIcon || AVATAR_ICONS[0].id);
  const displayAvatarBackground = viewingOwnProfile ? (avatarBackground || AVATAR_BACKGROUNDS[0]) : (userData?.avatarBackground || AVATAR_BACKGROUNDS[0]);
  const displayAvatarColor   = viewingOwnProfile ? (avatarColor || AVATAR_COLORS[0])         : (userData?.avatarColor || AVATAR_COLORS[0]);
  const selectedIcon = useMemo(() => getAvatarIconById(displayAvatarIconId), [displayAvatarIconId]);
  const isFollowActionBusy = Boolean(followAction.type);

  const viewerCanSeeTaggedDream = useCallback((dream) => {
    if (!dream) return false;
    const vis = dream.visibility || 'private';
    if (vis === 'private') return viewerId && dream.userId === viewerId;
    if (viewerId && (dream.excludedViewerIds || []).includes(viewerId)) return false;
    if (viewerId && dream.userId === viewerId) return true;
    if (viewerId && (dream.taggedUserIds || []).includes(viewerId)) return true;
    if (viewerId === targetUserId) return true;
    if (vis === 'public' || vis === 'anonymous') return true;
    return false;
  }, [viewerId, targetUserId]);

  const displayedDreams = useMemo(() => {
    if (viewingOwnProfile) return dreams;
    // Hide all dreams if the profile owner is blocked.
    if (isBlockedTarget) return [];
    return dreams.filter((d) => {
      if (!d) return false;
      const vis = d.visibility || 'private';
      if (vis === 'private') return viewerId && d.userId === viewerId;
      if (viewerId && (d.excludedViewerIds || []).includes(viewerId)) return false;
      if (viewerId && (d.taggedUserIds || []).includes(viewerId)) return true;
      if (vis === 'public') return true;
      if ((vis === 'following' || vis === 'followers') && viewerFollowedByTarget) return true;
      return false;
    });
  }, [dreams, viewingOwnProfile, viewerFollowedByTarget, viewerId, isBlockedTarget]);

  const taggedDreamsForProfile = useMemo(() => {
    if (!targetUserId) return [];
    return taggedDreams
      .filter((d) => d && (d.taggedUserIds || []).includes(targetUserId) && (viewerId === targetUserId || viewerCanSeeTaggedDream(d)))
      .sort((a, b) => ((b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)));
  }, [taggedDreams, targetUserId, viewerId, viewerCanSeeTaggedDream]);

  if (!targetUserId) return <div className="page-container">Profile unavailable.</div>;
  if (profileNotFound)  return <div className="page-container">We could not find that dreamer.</div>;
  if (profileLoading || !userData) return (
    <div className="page-container">
      <div className="profile-loading loading-slot"><LoadingIndicator label="Loading profile…" size="lg" /></div>
    </div>
  );

  const isTaggedTab = dreamTab === 'tagged';
  const activeDreams = isTaggedTab ? taggedDreamsForProfile : displayedDreams;
  const activeDreamsLoading = isTaggedTab ? taggedDreamsLoading : dreamsLoading;
  const dreamSectionTitle = isTaggedTab ? (viewingOwnProfile ? 'Tagged dreams' : 'Tagged for this dreamer') : (viewingOwnProfile ? 'Your dreams' : 'Recent dreams');
  const dreamSectionSubtitle = isTaggedTab
    ? (viewingOwnProfile ? 'Anytime someone mentions you, it lands in this list.' : 'Entries that mention this dreamer and are visible to you.')
    : (viewingOwnProfile ? 'A gallery of your latest journal entries.' : 'Only entries they have shared with you appear here.');
  const emptyPrimary = isTaggedTab ? (viewingOwnProfile ? 'Nobody has tagged you yet' : 'No tagged dreams to show') : (viewingOwnProfile ? 'No dreams yet' : 'No dreams shared with you yet');
  const emptySecondary = isTaggedTab
    ? (viewingOwnProfile ? 'When another dreamer mentions you, their entry appears here automatically.' : 'As soon as a visible tagged entry exists, it will show up in this tab.')
    : (viewingOwnProfile ? 'Start a new entry to see it here.' : viewerFollowedByTarget ? 'They have not shared any public or limited dreams recently.' : 'This dreamer only shares entries with people they follow.');

  const renderDreamPreview = (dream) => {
    const title = dream.title || (dream.aiGenerated ? dream.aiTitle?.trim() : '');
    const snippet = dream.content?.length > 180 ? `${dream.content.slice(0, 180)}…` : dream.content;
    const dateLabel = dream.createdAt ? formatDreamDate(dream.createdAt, 'MMM d') : 'Pending';
    const visLabel = dream.visibility === 'anonymous' ? 'Anon' : dream.visibility === 'public' ? 'Public' : dream.visibility === 'following' || dream.visibility === 'followers' ? 'Followers' : 'Private';
    const hasAi = Boolean(dream.aiGenerated && dream.aiInsights);
    const tagCount = dream.tags?.length || 0;
    const taggedCount = Array.isArray(dream.taggedUsers) ? dream.taggedUsers.length : 0;
    return (
      <div key={dream.id} className={`profile-dream-card${hasAi ? ' profile-dream-card--analyzed' : ''}`} role="button" tabIndex={0}
        onClick={() => handleDreamNavigation(dream.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDreamNavigation(dream.id); } }}>
        <div className="profile-dream-top">
          <div className="dream-date-pill">{dateLabel}</div>
          <div className={`profile-vis-pill profile-vis--${dream.visibility || 'private'}`}>{visLabel}</div>
          {hasAi && <span className="profile-ai-badge" aria-label="AI analyzed">✦</span>}
        </div>
        {title ? <h3 className="profile-dream-title">{title}</h3> : <p className="pending-title">Untitled</p>}
        <p className="profile-dream-snippet">{snippet}</p>
        {(tagCount > 0 || taggedCount > 0) && (
          <div className="profile-dream-footer-meta">
            {tagCount > 0 && <span className="profile-tag-count">{tagCount} {tagCount === 1 ? 'tag' : 'tags'}</span>}
            {taggedCount > 0 && <span className="profile-tag-count">{taggedCount} tagged</span>}
          </div>
        )}
      </div>
    );
  };

  const renderTaggedDream = (dream) => {
    const isAnonymous = dream.visibility === 'anonymous';
    const authorName = isAnonymous ? 'Anonymous dreamer' : dream.authorProfile?.displayName || 'Dreamer';
    const authorHandle = !isAnonymous ? (dream.authorProfile?.username || '') : '';
    const dateLabel = dream.createdAt ? formatDreamDate(dream.createdAt) : 'Shared recently';
    const snippet = dream.content?.length > 200 ? `${dream.content.slice(0, 200)}…` : (dream.content || 'No description yet.');
    return (
      <div key={dream.id} className="tagged-dream-card" role="button" tabIndex={0}
        onClick={() => handleDreamNavigation(dream.id, authorHandle, dream.userId)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDreamNavigation(dream.id, authorHandle, dream.userId); } }}>
        <div className="tagged-dream-head">
          <div>
            <p className="tagged-author">{authorName}</p>
            <p className="tagged-meta">{authorHandle ? `@${authorHandle} • ` : ''}{dateLabel}</p>
          </div>
          {!isAnonymous && dream.userId && (
            <button type="button" className="tagged-view-profile" onClick={(e) => { e.stopPropagation(); handleProfileNavigation({ id: dream.userId, username: authorHandle }); }}>
              View profile
            </button>
          )}
        </div>
        <p className="tagged-snippet">{snippet}</p>
        {dream.aiGenerated && dream.aiInsights && <p className="tagged-summary">{dream.aiInsights}</p>}
        <div className="tagged-pill-row">
          <span className="tagged-pill shared-pill">Shared with you</span>
          {isAnonymous && <span className="tagged-pill muted-pill">Anonymous</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="profile-header">
        <div className="profile-avatar">
          <div className="avatar-circle" style={{ background: displayAvatarBackground }} aria-label="Profile avatar">
            <FontAwesomeIcon icon={selectedIcon} style={{ color: displayAvatarColor, fontSize: '2.4rem' }} />
          </div>
        </div>

        {viewingOwnProfile && isEditing ? (
          <form onSubmit={handleSaveProfile} className="profile-edit-form">
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display Name" required className="profile-input" />
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="profile-input" />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio" rows={4} className="profile-textarea" />
            <div className="avatar-customizer">
              <p className="customizer-label">Avatar icon</p>
              <div className="avatar-option-grid">
                {AVATAR_ICONS.map((option) => (
                  <button key={option.id} type="button" className={`avatar-option ${avatarIcon === option.id ? 'selected' : ''}`} onClick={() => setAvatarIcon(option.id)}>
                    <FontAwesomeIcon icon={option.icon} /><span>{option.label}</span>
                  </button>
                ))}
              </div>
              <p className="customizer-label">Background</p>
              <div className="color-swatch-grid">
                {AVATAR_BACKGROUNDS.map((color) => (
                  <button key={color} type="button" className={`color-swatch ${avatarBackground === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setAvatarBackground(color)} aria-label={`Select background ${color}`} />
                ))}
              </div>
              <p className="customizer-label">Icon color</p>
              <div className="color-swatch-grid">
                {AVATAR_COLORS.map((color) => (
                  <button key={color} type="button" className={`color-swatch ${avatarColor === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => setAvatarColor(color)} aria-label={`Select icon color ${color}`} />
                ))}
              </div>
            </div>
            <div className="profile-actions">
              <button type="button" onClick={() => { setDisplayName(userData.displayName || ''); setUsername(userData.username || ''); setBio(userData.settings?.bio || ''); setAvatarIcon(userData.avatarIcon || AVATAR_ICONS[0].id); setAvatarBackground(userData.avatarBackground || AVATAR_BACKGROUNDS[0]); setAvatarColor(userData.avatarColor || AVATAR_COLORS[0]); setIsEditing(false); }} className="secondary-btn">Cancel</button>
              <button type="submit" disabled={loading} className="primary-btn">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        ) : (
          <div className="profile-info">
            <h1>{userData.displayName || 'Dreamer'}</h1>
            {userData.username && <p className="profile-username">@{userData.username}</p>}
            {userData.settings?.bio && <p className="profile-bio">{userData.settings.bio}</p>}
            {viewingOwnProfile && userData.email && !userData.isAnonymous && <p className="profile-email">{userData.email}</p>}
            {viewingOwnProfile && (
              <div className="profile-btn-row">
                <button onClick={() => setIsEditing(true)} className="edit-profile-btn"><FontAwesomeIcon icon={faPencil} /><span>Edit Profile</span></button>
                {!isNativeIOS && (
                  <button type="button" className="settings-btn" onClick={() => navigate('/settings')}><FontAwesomeIcon icon={faGear} /><span>Settings</span></button>
                )}
                {!isNativeIOS && (
                  <button type="button" className="sign-out-profile-btn" onClick={async () => { try { await supabase.auth.signOut(); } catch { setToast('Sign out failed. Please try again.'); } }}>
                    <FontAwesomeIcon icon={faRightFromBracket} /><span>Sign Out</span>
                  </button>
                )}
              </div>
            )}
            {!viewingOwnProfile && (
              <div className="follow-actions">
                <button type="button" className={isFollowingTarget ? 'ghost-btn' : 'primary-btn'} onClick={isFollowingTarget ? handleUnfollow : handleFollow} disabled={isFollowActionBusy || isBlockedTarget}>
                  {isFollowActionBusy ? 'Working…' : isFollowingTarget ? 'Following' : 'Follow'}
                </button>
                <button type="button" className="ghost-btn" onClick={isBlockedTarget ? handleUnblockUser : handleBlockUser} disabled={isFollowActionBusy}>
                  {isFollowActionBusy ? 'Working…' : isBlockedTarget ? 'Unblock' : 'Block'}
                </button>
                <button type="button" className="ghost-btn" onClick={handleReportUser} disabled={isFollowActionBusy}>
                  {isFollowActionBusy ? 'Working…' : 'Report'}
                </button>
                {followsYou && <span className="follow-note">Follows you</span>}
                {isBlockedTarget && <span className="follow-note">Blocked</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-stats">
        <button type="button" className="stat-item stat-button" onClick={() => setConnectionListType((prev) => prev === 'followers' ? null : 'followers')} aria-expanded={connectionListType === 'followers'}>
          <div className="stat-value">{targetFollowerIds.length}</div><div className="stat-label">Followers</div>
        </button>
        <button type="button" className="stat-item stat-button" onClick={() => setConnectionListType((prev) => prev === 'following' ? null : 'following')} aria-expanded={connectionListType === 'following'}>
          <div className="stat-value">{targetFollowingIds.length}</div><div className="stat-label">Following</div>
        </button>
      </div>

      {connectionListType && (
        <div className="connection-panel">
          <div className="connection-panel-head">
            <div>
              <h2>{connectionListType === 'followers' ? (viewingOwnProfile ? 'Your followers' : `Followers of ${connectionHeadingName}`) : (viewingOwnProfile ? 'People you follow' : `People ${connectionHeadingName} follows`)}</h2>
            </div>
            <button type="button" className="close-button" onClick={() => setConnectionListType(null)}>Close</button>
          </div>
          {connectionLoading ? (
            <div className="connection-panel-placeholder loading-slot"><LoadingIndicator label="Fetching dreamers…" size="sm" /></div>
          ) : connectionProfiles.length === 0 ? (
            <p className="connection-panel-placeholder">{connectionListType === 'followers' ? (viewingOwnProfile ? 'No followers yet.' : 'No followers to show yet.') : (viewingOwnProfile ? 'You are not following anyone yet.' : 'No following info to show yet.')}</p>
          ) : (
            <div className="connection-list">
              {connectionProfiles.map((connection) => (
                <button type="button" key={connection.id} className="connection-card" onClick={() => handleProfileNavigation(connection)}>
                  <div className="connection-avatar" style={{ background: connection.avatarBackground || DEFAULT_AVATAR_BACKGROUND }}>
                    <FontAwesomeIcon icon={getAvatarIconById(connection.avatarIcon)} style={{ color: connection.avatarColor || DEFAULT_AVATAR_COLOR }} />
                  </div>
                  <div className="connection-meta">
                    <div className="connection-name">{connection.displayName || 'Dreamer'}</div>
                    {connection.username && <div className="connection-username">@{connection.username}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="profile-dreams">
        <div className="profile-dreams-head">
          <div>
            <h2>{dreamSectionTitle}</h2>
            <p className="profile-dreams-subtitle">{dreamSectionSubtitle}</p>
          </div>
          <div className="dream-tab-group">
            <button type="button" className={isTaggedTab ? 'dream-tab' : 'dream-tab active'} onClick={() => setDreamTab('authored')} aria-pressed={dreamTab === 'authored'}>
              {viewingOwnProfile ? 'Your dreams' : 'Their dreams'}
            </button>
            <button type="button" className={isTaggedTab ? 'dream-tab active' : 'dream-tab'} onClick={() => setDreamTab('tagged')} aria-pressed={dreamTab === 'tagged'}>
              {viewingOwnProfile ? 'Tagged' : 'Tagged dreams'}
            </button>
          </div>
        </div>
        {activeDreamsLoading ? (
          <div className="profile-dreams-loading loading-slot"><LoadingIndicator label="Loading dreams…" /></div>
        ) : activeDreams.length === 0 ? (
          <div className="profile-dreams-empty"><p>{emptyPrimary}</p><p className="empty-subtitle">{emptySecondary}</p></div>
        ) : (
          <div className="profile-dream-grid">
            {isTaggedTab ? activeDreams.map((d) => renderTaggedDream(d)) : activeDreams.map(renderDreamPreview)}
          </div>
        )}
      </div>

      <Toast message={toast} onDismiss={() => setToast('')} />

      {reportModal && (
        <div className="report-modal-backdrop" onClick={() => setReportModal(false)}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Report user</h3>
            <p className="report-modal-desc">Select the reason. Reports are reviewed within 24 hours.</p>
            <div className="report-reasons">
              {['Harassment or bullying', 'Hate speech', 'Sexual content', 'Violence', 'Spam', 'Other'].map((r) => (
                <button key={r} type="button" className={`report-reason-btn${reportReason === r ? ' selected' : ''}`} onClick={() => setReportReason(r)}>{r}</button>
              ))}
            </div>
            <div className="report-modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setReportModal(false)}>Cancel</button>
              <button type="button" className="danger-btn" onClick={handleSubmitReport} disabled={!reportReason.trim() || reportBusy}>{reportBusy ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Profile.propTypes = { user: appUserPropType };
