import './SkeletonLoader.css';

// ─── Primitives ──────────────────────────────────────────────────────────────
// Use these to compose page-specific skeletons.

function S({ w, h, r, className = '' }) {
  return (
    <div
      className={`skel ${className}`}
      style={{
        width: w || '100%',
        height: h || '1rem',
        borderRadius: r || 6,
      }}
    />
  );
}

function Circle({ size }) {
  return (
    <div
      className="skel"
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }}
    />
  );
}

// ─── Journal ─────────────────────────────────────────────────────────────────
// Matches the `dreams-list` auto-fill grid (minmax(280px, 1fr))
// Shows 6 cards so all columns are populated at any breakpoint.

export function JournalSkeleton() {
  return (
    <div className="sk-journal-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sk-journal-card">
          <div className="sk-journal-top">
            <S w="68px" h="20px" r={999} />
            <S w="36px" h="18px" r={999} />
          </div>
          <S w="80%" h="1rem" />
          <S h="0.82rem" />
          <S w="65%" h="0.82rem" />
          <div className="sk-journal-footer">
            <S w="44px" h="18px" r={999} />
            <S w="32px" h="18px" r={999} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Feed ────────────────────────────────────────────────────────────────────
// Matches feed-card: avatar + author row + title + content + reactions

function FeedCardSkeleton() {
  return (
    <div className="sk-feed-card">
      <div className="sk-feed-head">
        {/* 48×48 rounded-square avatar matching .feed-avatar */}
        <div className="skel sk-feed-avatar" />
        <div className="sk-feed-meta">
          <S w="130px" h="0.88rem" />
          <S w="72px" h="0.75rem" r={999} />
        </div>
        {/* date pill on the right, same height as feed-date (38px) */}
        <div className="skel sk-feed-date" style={{ borderRadius: 8 }} />
      </div>
      {/* title */}
      <S w="65%" h="1.1rem" r={6} />
      {/* content lines */}
      <S h="0.85rem" className="sk-mt-sm" />
      <S w="90%" h="0.85rem" className="sk-mt-sm" />
      <S w="60%" h="0.85rem" className="sk-mt-sm" />
      <div className="sk-feed-footer">
        <S w="60px" h="30px" r={999} />
        <S w="60px" h="30px" r={999} />
        <S w="60px" h="30px" r={999} />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div className="sk-feed-list">
      {Array.from({ length: count }).map((_, i) => (
        <FeedCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────
// Header + stats + dream grid (3-col → 2-col → 1-col)

export function ProfilePageSkeleton() {
  return (
    <div className="sk-profile">
      <div className="sk-profile-header">
        <Circle size={120} />
        <S w="160px" h="1.4rem" r={8} className="sk-mt" />
        <S w="100px" h="0.9rem" className="sk-mt-sm" />
        <S w="240px" h="0.85rem" className="sk-mt-sm" />
        <S w="180px" h="0.85rem" className="sk-mt-sm" />
      </div>
      <div className="sk-profile-stats">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk-stat-item">
            <S w="40px" h="1.4rem" r={6} />
            <S w="60px" h="0.75rem" r={4} className="sk-mt-sm" />
          </div>
        ))}
      </div>
      <S w="140px" h="38px" r={10} className="sk-profile-btn" />
      <div className="sk-profile-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sk-profile-card">
            <S w="60px" h="18px" r={999} />
            <S w="85%" h="0.95rem" className="sk-mt" />
            <S h="0.8rem" className="sk-mt-sm" />
            <S w="65%" h="0.8rem" className="sk-mt-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileDreamsLoadingSkeleton() {
  return (
    <div className="sk-profile-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sk-profile-card">
          <S w="60px" h="18px" r={999} />
          <S w="85%" h="0.95rem" className="sk-mt" />
          <S h="0.8rem" className="sk-mt-sm" />
          <S w="65%" h="0.8rem" className="sk-mt-sm" />
        </div>
      ))}
    </div>
  );
}

// ─── Dream Detail ────────────────────────────────────────────────────────────
// Back btn + title + date/author + content block + AI section

export function DreamDetailSkeleton() {
  return (
    <div className="sk-detail">
      <S w="88px" h="34px" r={10} />
      <div className="sk-detail-title-row">
        <S w="75%" h="1.8rem" r={8} />
        <S w="90px" h="0.85rem" className="sk-mt-sm" />
      </div>
      <div className="sk-detail-author">
        <Circle size={36} />
        <div className="sk-feed-meta">
          <S w="100px" h="0.85rem" />
          <S w="70px" h="0.75rem" />
        </div>
      </div>
      <div className="sk-detail-content">
        {[100, 95, 88, 100, 75, 92, 80, 60].map((w, i) => (
          <S key={i} w={`${w}%`} h="0.9rem" className="sk-mt-sm" />
        ))}
      </div>
      <div className="sk-detail-ai">
        <S w="140px" h="1rem" r={6} />
        <S h="0.85rem" className="sk-mt" />
        <S w="90%" h="0.85rem" className="sk-mt-sm" />
        <S w="70%" h="0.85rem" className="sk-mt-sm" />
      </div>
    </div>
  );
}

// ─── Dream Insights ──────────────────────────────────────────────────────────
// Header + section cards

export function InsightsSkeleton() {
  return (
    <div className="sk-insights">
      <div className="sk-insights-header">
        <S w="200px" h="1.75rem" r={8} />
        <S w="140px" h="0.8rem" className="sk-mt-sm" />
      </div>
      {[4, 3, 3].map((rows, ci) => (
        <div key={ci} className="sk-insights-card">
          <div className="sk-insights-card-head">
            <S w="16px" h="16px" r={999} />
            <S w="160px" h="0.95rem" r={6} />
            <S w="60px" h="22px" r={999} className="sk-insights-count" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <S key={i} w={i % 3 === 2 ? '75%' : '100%'} h="0.85rem" className="sk-mt-sm" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
// Section cards with toggle rows

function ToggleRowSkeleton() {
  return (
    <div className="sk-toggle-row">
      <div className="sk-toggle-label">
        <S w="120px" h="0.9rem" />
        <S w="200px" h="0.78rem" className="sk-mt-sm" />
      </div>
      <S w="48px" h="28px" r={999} className="sk-toggle-switch" />
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="sk-settings">
      {[
        { head: true, rows: 2 },
        { head: true, rows: 3 },
        { head: true, rows: 1 },
        { head: true, rows: 2 },
      ].map((section, si) => (
        <div key={si} className="sk-settings-section">
          <div className="sk-settings-head">
            <S w="140px" h="1.1rem" r={6} />
            <S w="220px" h="0.8rem" className="sk-mt-sm" />
          </div>
          <div className="sk-settings-body">
            {Array.from({ length: section.rows }).map((_, i) => (
              <ToggleRowSkeleton key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────
// Notification cards: avatar + content lines + clear btn

function ActivityCardSkeleton() {
  return (
    <div className="sk-activity-card">
      <Circle size={40} />
      <div className="sk-activity-body">
        <S w="60%" h="0.85rem" />
        <S w="85%" h="0.8rem" className="sk-mt-sm" />
        <S w="45%" h="0.75rem" className="sk-mt-sm" />
      </div>
      <S w="28px" h="28px" r={6} className="sk-activity-action" />
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="sk-activity-list">
      {Array.from({ length: 5 }).map((_, i) => (
        <ActivityCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────
// People grid (auto-fit minmax 220px) and dreams grid (auto-fit minmax 260px)

export function SearchPeopleSkeleton() {
  return (
    <div className="sk-people-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sk-person-card">
          <Circle size={44} />
          <div className="sk-feed-meta">
            <S w="100px" h="0.9rem" />
            <S w="70px" h="0.78rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchDreamsSkeleton() {
  return (
    <div className="sk-dream-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sk-search-dream-card">
          <S w="70px" h="18px" r={999} />
          <S w="80%" h="0.95rem" className="sk-mt" />
          <S h="0.8rem" className="sk-mt-sm" />
          <S w="60%" h="0.8rem" className="sk-mt-sm" />
        </div>
      ))}
    </div>
  );
}

// ─── Legacy aliases ───────────────────────────────────────────────────────────
// Keep these so any untouched imports don't break.

export function DreamCardSkeleton() {
  return <FeedCardSkeleton />;
}

export function ProfileSkeleton() {
  return <ProfilePageSkeleton />;
}

export function ListSkeleton({ count = 3 }) {
  return <FeedSkeleton count={count} />;
}

export default DreamCardSkeleton;
