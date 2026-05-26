import { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
import { mapProfile } from '../utils/mappers';
import { DEFAULT_AVATAR_BACKGROUND, DEFAULT_AVATAR_COLOR, getAvatarIconById } from '../constants/avatarOptions';
import { buildProfilePath } from '../utils/urlHelpers';
import LoadingIndicator from '../components/LoadingIndicator';
import './Connections.css';
import { appUserPropType } from '../propTypes';

const TAB_FOLLOWERS = 'followers';
const TAB_FOLLOWING = 'following';
const TAB_REQUESTS = 'requests';

const normalizeTab = (value, allowRequests) => {
  if (value === TAB_FOLLOWING) return TAB_FOLLOWING;
  if (allowRequests && value === TAB_REQUESTS) return TAB_REQUESTS;
  return TAB_FOLLOWERS;
};

export default function Connections({ user }) {
  const { handle: routeHandle } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => normalizeTab(searchParams.get('tab'), !routeHandle));
  const [targetUserId, setTargetUserId] = useState(() => (routeHandle ? null : (user?.uid || null)));
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [userData, setUserData] = useState(null);
  const [connectionProfiles, setConnectionProfiles] = useState([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [requestProfiles, setRequestProfiles] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestActionId, setRequestActionId] = useState(null);
  const navigate = useNavigate();

  const viewingOwnProfile = Boolean(user?.uid && targetUserId && targetUserId === user.uid);

  useEffect(() => {
    const next = normalizeTab(searchParams.get('tab'), viewingOwnProfile);
    setActiveTab(next);
  }, [searchParams, viewingOwnProfile]);

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
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(routeHandle)) {
          const { data } = await supabase.from('profiles').select('id').eq('id', routeHandle).single();
          if (!cancelled && data) {
            setTargetUserId(data.id);
            return;
          }
        }

        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('normalized_username', routeHandle.toLowerCase())
          .single();

        if (!cancelled) {
          if (data) {
            setTargetUserId(data.id);
          } else {
            setTargetUserId(null);
            setProfileNotFound(true);
            setProfileLoading(false);
          }
        }
      } catch {
        if (!cancelled) {
          setTargetUserId(null);
          setProfileNotFound(true);
          setProfileLoading(false);
        }
      }
    };

    resolveHandle();
    return () => {
      cancelled = true;
    };
  }, [routeHandle, user?.uid]);

  useEffect(() => {
    if (!targetUserId) return;
    setProfileLoading(true);
    setProfileNotFound(false);
    setUserData(null);
    setConnectionProfiles([]);

    supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single()
      .then(({ data }) => {
        if (!data) {
          setProfileNotFound(true);
          setProfileLoading(false);
          return;
        }
        setUserData(mapProfile(data));
        setProfileLoading(false);
      });
  }, [targetUserId]);

  useEffect(() => {
    if (!userData) {
      setConnectionProfiles([]);
      setConnectionLoading(false);
      return;
    }

    const ids = activeTab === TAB_FOLLOWERS ? (userData.followerIds || []) : (userData.followingIds || []);
    if (!ids.length) {
      setConnectionProfiles([]);
      setConnectionLoading(false);
      return;
    }

    setConnectionLoading(true);
    supabase
      .from('profiles')
      .select('id, display_name, username, avatar_icon, avatar_background, avatar_color')
      .in('id', ids)
      .then(({ data }) => {
        const mapped = (data || []).map(mapProfile);
        mapped.sort((a, b) => {
          const aName = (a.displayName || a.username || '').toLowerCase();
          const bName = (b.displayName || b.username || '').toLowerCase();
          return aName.localeCompare(bName);
        });
        setConnectionProfiles(mapped);
        setConnectionLoading(false);
      });
  }, [activeTab, userData]);

  const followersCount = userData?.followerIds?.length || 0;
  const followingCount = userData?.followingIds?.length || 0;
  const requestCount = requestProfiles.length;
  const profileLabel = userData?.displayName || userData?.username || 'Dreamer';

  const tabDescription = useMemo(() => {
    if (activeTab === TAB_REQUESTS) {
      return 'Pending follow requests awaiting your approval';
    }
    if (activeTab === TAB_FOLLOWERS) {
      return viewingOwnProfile ? 'People following you' : `People following ${profileLabel}`;
    }
    return viewingOwnProfile ? 'People you follow' : `People ${profileLabel} follows`;
  }, [activeTab, profileLabel, viewingOwnProfile]);

  const handleTabSelect = useCallback((tab) => {
    const nextTab = normalizeTab(tab, viewingOwnProfile);
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, viewingOwnProfile]);

  const handleProfileNavigation = useCallback((profile) => {
    if (!profile) return;
    navigate(buildProfilePath(profile.username, profile.id));
  }, [navigate]);

  useEffect(() => {
    if (!viewingOwnProfile || activeTab !== TAB_REQUESTS) {
      setRequestProfiles([]);
      setRequestsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchRequests = async () => {
      setRequestsLoading(true);
      try {
        const { data: requestRows } = await supabase
          .from('follow_requests')
          .select('id, requester_id, status, created_at')
          .eq('target_id', user.uid)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (cancelled) return;

        const requesterIds = (requestRows || []).map((row) => row.requester_id).filter(Boolean);
        if (!requesterIds.length) {
          setRequestProfiles([]);
          setRequestsLoading(false);
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_icon, avatar_background, avatar_color')
          .in('id', requesterIds);

        if (cancelled) return;

        const byId = new Map((profiles || []).map((p) => [p.id, mapProfile(p)]));
        const merged = (requestRows || [])
          .map((row) => {
            const profile = byId.get(row.requester_id);
            if (!profile) return null;
            return {
              requestId: row.id,
              requesterId: row.requester_id,
              createdAt: row.created_at,
              ...profile,
            };
          })
          .filter(Boolean);

        setRequestProfiles(merged);
      } catch {
        if (!cancelled) setRequestProfiles([]);
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    };

    fetchRequests();
    return () => {
      cancelled = true;
    };
  }, [activeTab, user?.uid, viewingOwnProfile]);

  const handleRequestDecision = useCallback(async (requesterId, decision) => {
    if (!requesterId || !viewingOwnProfile || !user?.uid) return;
    const actionKey = `${decision}:${requesterId}`;
    setRequestActionId(actionKey);

    try {
      const rpcName = decision === 'accept' ? 'accept_follow_request' : 'decline_follow_request';
      let handled = false;
      try {
        const { error } = await supabase.rpc(rpcName, { requester_id: requesterId });
        if (!error) handled = true;
      } catch {
        handled = false;
      }

      if (!handled) {
        const status = decision === 'accept' ? 'accepted' : 'declined';
        const { error: updateError } = await supabase
          .from('follow_requests')
          .update({ status })
          .eq('requester_id', requesterId)
          .eq('target_id', user.uid)
          .eq('status', 'pending');
        if (updateError) throw updateError;
      }

      setRequestProfiles((prev) => prev.filter((item) => item.requesterId !== requesterId));
      if (decision === 'accept') {
        setUserData((prev) => prev ? {
          ...prev,
          followerIds: Array.from(new Set([...(prev.followerIds || []), requesterId]))
        } : prev);
      }
    } catch {
      // No-op: keep the request row visible if the action fails.
    } finally {
      setRequestActionId(null);
    }
  }, [user?.uid, viewingOwnProfile]);

  if (!targetUserId) return <div className="page-container">Connections unavailable.</div>;
  if (profileNotFound) return <div className="page-container">We could not find that dreamer.</div>;
  if (profileLoading || !userData) {
    return (
      <div className="page-container">
        <div className="connections-loading loading-slot"><LoadingIndicator label="Loading connections…" size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="connections-header">
        <h1>Connections</h1>
        <p className="page-subtitle">{tabDescription}</p>
      </div>

      <div className="connections-tab-group" role="tablist" aria-label="Connections tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_FOLLOWERS}
          className={`connections-tab${activeTab === TAB_FOLLOWERS ? ' active' : ''}`}
          onClick={() => handleTabSelect(TAB_FOLLOWERS)}
        >
          Followers {followersCount}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_FOLLOWING}
          className={`connections-tab${activeTab === TAB_FOLLOWING ? ' active' : ''}`}
          onClick={() => handleTabSelect(TAB_FOLLOWING)}
        >
          Following {followingCount}
        </button>
        {viewingOwnProfile && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === TAB_REQUESTS}
            className={`connections-tab${activeTab === TAB_REQUESTS ? ' active' : ''}`}
            onClick={() => handleTabSelect(TAB_REQUESTS)}
          >
            Requests {requestCount}
          </button>
        )}
      </div>

      {activeTab === TAB_REQUESTS ? (
        requestsLoading ? (
          <div className="connections-empty loading-slot"><LoadingIndicator label="Loading requests…" size="sm" /></div>
        ) : requestProfiles.length === 0 ? (
          <p className="connections-empty">No pending requests right now.</p>
        ) : (
          <div className="connections-list">
            {requestProfiles.map((profile) => {
              const accepting = requestActionId === `accept:${profile.requesterId}`;
              const declining = requestActionId === `decline:${profile.requesterId}`;
              const busy = Boolean(requestActionId);
              return (
                <div key={profile.requesterId} className="connections-card connections-card-request">
                  <button
                    type="button"
                    className="connections-card-main"
                    onClick={() => handleProfileNavigation(profile)}
                  >
                    <div className="connections-avatar" style={{ background: profile.avatarBackground || DEFAULT_AVATAR_BACKGROUND }}>
                      <FontAwesomeIcon icon={getAvatarIconById(profile.avatarIcon)} style={{ color: profile.avatarColor || DEFAULT_AVATAR_COLOR }} />
                    </div>
                    <div className="connections-meta">
                      <div className="connections-name">{profile.displayName || 'Dreamer'}</div>
                      {profile.username && <div className="connections-username">@{profile.username}</div>}
                    </div>
                  </button>
                  <div className="connections-request-actions">
                    <button type="button" className="request-btn request-btn-accept" disabled={busy} onClick={() => handleRequestDecision(profile.requesterId, 'accept')}>
                      {accepting ? 'Accepting…' : 'Accept'}
                    </button>
                    <button type="button" className="request-btn request-btn-decline" disabled={busy} onClick={() => handleRequestDecision(profile.requesterId, 'decline')}>
                      {declining ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : connectionLoading ? (
        <div className="connections-empty loading-slot"><LoadingIndicator label="Fetching dreamers…" size="sm" /></div>
      ) : connectionProfiles.length === 0 ? (
        <p className="connections-empty">
          {activeTab === TAB_FOLLOWERS
            ? (viewingOwnProfile ? 'No followers yet.' : `No followers for ${profileLabel} yet.`)
            : (viewingOwnProfile ? 'You are not following anyone yet.' : `${profileLabel} is not following anyone yet.`)}
        </p>
      ) : (
        <div className="connections-list">
          {connectionProfiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              className="connections-card"
              onClick={() => handleProfileNavigation(profile)}
            >
              <div className="connections-avatar" style={{ background: profile.avatarBackground || DEFAULT_AVATAR_BACKGROUND }}>
                <FontAwesomeIcon icon={getAvatarIconById(profile.avatarIcon)} style={{ color: profile.avatarColor || DEFAULT_AVATAR_COLOR }} />
              </div>
              <div className="connections-meta">
                <div className="connections-name">{profile.displayName || 'Dreamer'}</div>
                {profile.username && <div className="connections-username">@{profile.username}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

Connections.propTypes = {
  user: appUserPropType,
};
