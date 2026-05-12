import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRightFromBracket, faPencil, faGear } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { mapProfile, mapDream } from '../utils/mappers';
import { AVATAR_ICONS, AVATAR_BACKGROUNDS, AVATAR_COLORS, DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import { buildProfilePath, buildDreamPath } from '../utils/urlHelpers';
import './Profile.css';
import { appUserPropType } from '../propTypes';

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
  const navigate = useNavigate();
  const viewerId = user?.uid || null;
  const editingRef = useRef(false);

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
    supabase.from('profiles').select('following_ids, follower_ids, username').eq('id', viewerId).single()
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
    let q = supabase.from('dreams').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(12);
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
      .order('created_at', { ascending: false }).limit(12)
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
    } catch {
      alert('Failed to update profile');
    }
    setLoading(false);
  };

  const handleFollow = async () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'follow' });
    try {
      const [{ data: v }, { data: t }] = await Promise.all([
        supabase.from('profiles').select('following_ids').eq('id', user.uid).single(),
        supabase.from('profiles').select('follower_ids').eq('id', targetUserId).single(),
      ]);
      await Promise.all([
        supabase.from('profiles').update({ following_ids: [...new Set([...(v?.following_ids || []), targetUserId])] }).eq('id', user.uid),
        supabase.from('profiles').update({ follower_ids:  [...new Set([...(t?.follower_ids  || []), user.uid])] }).eq('id', targetUserId),
      ]);
      setViewerData((prev) => prev ? { ...prev, followingIds: [...new Set([...(prev.followingIds || []), targetUserId])] } : prev);
      setUserData((prev) => prev ? { ...prev, followerIds: [...new Set([...(prev.followerIds || []), user.uid])] } : prev);
    } catch { alert('Unable to follow this user.'); }
    finally { setFollowAction({ type: null }); }
  };

  const handleUnfollow = async () => {
    if (!user?.uid || !targetUserId || viewingOwnProfile || followAction.type) return;
    setFollowAction({ type: 'unfollow' });
    try {
      const [{ data: v }, { data: t }] = await Promise.all([
        supabase.from('profiles').select('following_ids').eq('id', user.uid).single(),
        supabase.from('profiles').select('follower_ids').eq('id', targetUserId).single(),
      ]);
      await Promise.all([
        supabase.from('profiles').update({ following_ids: (v?.following_ids || []).filter((id) => id !== targetUserId) }).eq('id', user.uid),
        supabase.from('profiles').update({ follower_ids:  (t?.follower_ids  || []).filter((id) => id !== user.uid) }).eq('id', targetUserId),
      ]);
      setViewerData((prev) => prev ? { ...prev, followingIds: (prev.followingIds || []).filter((id) => id !== targetUserId) } : prev);
      setUserData((prev) => prev ? { ...prev, followerIds: (prev.followerIds || []).filter((id) => id !== user.uid) } : prev);
    } catch { alert('Unable to unfollow right now.'); }
    finally { setFollowAction({ type: null }); }
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
  const targetFollowerIds   = userData?.followerIds  || [];
  const targetFollowingIds  = userData?.followingIds || [];
  const isFollowingTarget   = !viewingOwnProfile && viewerFollowingIds.includes(targetUserId);
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
  }, [dreams, viewingOwnProfile, viewerFollowedByTarget, viewerId]);

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
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Pending sync';
    const visLabel = dream.visibility === 'anonymous' ? 'Shared anonymously' : dream.visibility === 'public' ? 'Public dream' : dream.visibility === 'following' || dream.visibility === 'followers' ? 'People you follow' : 'Private';
    const taggedList = Array.isArray(dream.taggedUsers) ? dream.taggedUsers : [];
    const visibleTagged = taggedList.slice(0, 3);
    const remainingTagged = Math.max(taggedList.length - visibleTagged.length, 0);
    return (
      <div key={dream.id} className="profile-dream-card" role="button" tabIndex={0}
        onClick={() => handleDreamNavigation(dream.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDreamNavigation(dream.id); } }}>
        <div className="profile-dream-top">
          <div className="dream-date-pill">{dateLabel}</div>
          <div className="dream-visibility-pill">{visLabel}</div>
        </div>
        {title ? <h3 className="profile-dream-title">{title}</h3> : <p className="pending-title">Title pending</p>}
        <p className="profile-dream-snippet">{snippet}</p>
        {dream.aiGenerated && dream.aiInsights && <p className="profile-dream-summary">{dream.aiInsights}</p>}
        {taggedList.length ? (
          <div className="profile-tagged-peek">
            <span className="tagged-label">Tagged</span>
            <div className="tagged-pill-row">
              {visibleTagged.map((entry, index) => (
                <span className="tagged-pill" key={`${dream.id}-tagged-${entry.userId || index}`}>
                  {entry.username ? `@${entry.username}` : (entry.displayName || 'Dreamer')}
                </span>
              ))}
              {remainingTagged > 0 && <span className="tagged-pill extra">+{remainingTagged} more</span>}
            </div>
          </div>
        ) : null}
        {dream.tags?.length ? (
          <div className="profile-dream-tags">
            {dream.tags.map((tag, index) => <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderTaggedDream = (dream) => {
    const isAnonymous = dream.visibility === 'anonymous';
    const authorName = isAnonymous ? 'Anonymous dreamer' : dream.authorProfile?.displayName || 'Dreamer';
    const authorHandle = !isAnonymous ? (dream.authorProfile?.username || '') : '';
    const dateLabel = dream.createdAt ? format(dream.createdAt, 'MMM d, yyyy') : 'Shared recently';
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
                <button type="button" className="settings-btn" onClick={() => navigate('/settings')}><FontAwesomeIcon icon={faGear} /><span>Settings</span></button>
                <button type="button" className="sign-out-profile-btn" onClick={async () => { try { await supabase.auth.signOut(); } catch { alert('Sign out failed. Please try again.'); } }}>
                  <FontAwesomeIcon icon={faRightFromBracket} /><span>Sign Out</span>
                </button>
              </div>
            )}
            {!viewingOwnProfile && (
              <div className="follow-actions">
                <button type="button" className={isFollowingTarget ? 'ghost-btn' : 'primary-btn'} onClick={isFollowingTarget ? handleUnfollow : handleFollow} disabled={isFollowActionBusy}>
                  {isFollowActionBusy ? 'Working…' : isFollowingTarget ? 'Following' : 'Follow'}
                </button>
                {followsYou && <span className="follow-note">Follows you</span>}
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
              <p className="connection-panel-subtitle">Tap anyone to jump into their profile.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setConnectionListType(null)}>Close</button>
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
    </div>
  );
}

Profile.propTypes = { user: appUserPropType };
