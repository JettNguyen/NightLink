import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import LoadingIndicator from '../components/LoadingIndicator';
import { buildDreamPath } from '../utils/urlHelpers';
import './Activity.css';

export default function Activity({ user, activityPreview }) {
  const viewerId = user?.uid || null;
  const navigate = useNavigate();

  const {
    inboxEntries = [],
    inboxLoading = Boolean(viewerId),
    inboxError = '',
    followingUpdates = [],
    followingLoading = Boolean(viewerId),
    profileLoading = Boolean(viewerId)
  } = activityPreview || {};

  const inboxSummary = useMemo(() => {
    if (!inboxEntries.length) return 'No mentions or replies yet';
    const latest = inboxEntries[0]?.createdAt;
    if (!latest) return `${inboxEntries.length} updates`;
    return `${inboxEntries.length} update${inboxEntries.length === 1 ? '' : 's'} • Updated ${formatDistanceToNow(latest, { addSuffix: true })}`;
  }, [inboxEntries]);

  const handleDreamNavigation = (ownerUsername, ownerId, dreamId) => {
    if (!dreamId) return;
    if (ownerUsername) {
      navigate(buildDreamPath(ownerUsername, ownerId, dreamId));
    } else {
      navigate(`/dream/${dreamId}`);
    }
  };

  const determineInboxType = (entry) => {
    if (!viewerId) return 'mention';
    if (Array.isArray(entry.mentions) && entry.mentions.includes(viewerId)) return 'mention';
    if (entry.parentCommentUserId && entry.parentCommentUserId === viewerId) return 'reply';
    if (entry.dreamOwnerId && entry.dreamOwnerId === viewerId) return 'comment';
    return 'mention';
  };

  const renderInboxCard = (entry) => {
    const relativeTime = entry.createdAt ? formatDistanceToNow(entry.createdAt, { addSuffix: true }) : 'moments ago';
    const dreamTitle = entry.dreamTitleSnapshot || 'Untitled dream';
    const authorName = entry.authorDisplayName || 'Someone';
    const entryType = determineInboxType(entry);

    let pillLabel = 'Activity';
    let headline = `${authorName} mentioned you in “${dreamTitle}”`;

    if (entryType === 'reply') {
      pillLabel = 'Reply';
      headline = `${authorName} replied to your comment in “${dreamTitle}”`;
    } else if (entryType === 'comment') {
      pillLabel = 'Comment';
      headline = `${authorName} commented on “${dreamTitle}”`;
    } else {
      pillLabel = 'Mention';
    }

    const bodyText = (entry.content || '').trim() || 'New comment';

    return (
      <button
        type="button"
        key={entry.id}
        className="activity-card"
        onClick={() => handleDreamNavigation(entry.dreamOwnerUsername, entry.dreamOwnerId, entry.dreamId)}
      >
        <div className="activity-card-head">
          <span className={`activity-pill ${entryType}`}>{pillLabel}</span>
          <span className="activity-time">{relativeTime}</span>
        </div>
        <p className="activity-title">{headline}</p>
        <p className="activity-body">{bodyText}</p>
      </button>
    );
  };

  const renderFollowingCard = (entry) => {
    const relativeTime = (entry.updatedAt || entry.createdAt)
      ? formatDistanceToNow(entry.updatedAt || entry.createdAt, { addSuffix: true })
      : 'moments ago';
    const ownerName = entry.ownerProfile?.displayName || 'Dreamer';
    const ownerHandle = entry.ownerProfile?.username ? `@${entry.ownerProfile.username}` : '';
    const title = entry.title?.trim() || (entry.aiGenerated ? entry.aiTitle : '') || 'Untitled dream';
    const summary = entry.aiGenerated && entry.aiInsights ? entry.aiInsights : (entry.content || '').slice(0, 180);

    return (
      <button
        type="button"
        key={entry.id}
        className="activity-card"
        onClick={() => handleDreamNavigation(entry.ownerProfile?.username || '', entry.userId, entry.id)}
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
      </button>
    );
  };

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
            <h2>Inbox</h2>
            <p className="activity-subtitle">{inboxSummary}</p>
          </div>
        </div>
        {inboxLoading ? (
          <div className="loading-inline">
            <LoadingIndicator label="Checking activity…" size="sm" align="start" />
          </div>
        ) : inboxError ? (
          <p className="detail-hint">{inboxError}</p>
        ) : inboxEntries.length ? (
          <div className="activity-list">
            {inboxEntries.map((entry) => renderInboxCard(entry))}
          </div>
        ) : (
          <p className="detail-hint">No one has mentioned or replied to you yet.</p>
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
