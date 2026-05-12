/**
 * Firebase → Supabase one-time data migration
 *
 * What it migrates:
 *   Firebase Auth users  → Supabase Auth users + profiles rows
 *   Firestore `users`    → profiles rows (settings, avatar, follow graph, etc.)
 *   Firestore `dreams`   → dreams rows (with remapped user_id UUIDs)
 *   Firestore comments   → comments rows (subcollections under each dream)
 *   (usernames collection is skipped — replaced by UNIQUE constraint on profiles)
 *
 * Prerequisites:
 *   1. Run supabase/schema.sql in your Supabase SQL editor first.
 *   2. Add these to .env.local:
 *        FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   ← JSON blob
 *        SUPABASE_URL=https://xxxx.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Run:
 *   node scripts/migrate-from-firebase.js
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

// ── Init Firebase Admin ──────────────────────────────────────────────────────
const svcAccount = (() => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT in .env.local');
  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
})();

admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
const fbAuth = admin.auth();
const fbDb   = admin.firestore();

// ── Init Supabase Admin ──────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const safeUsername = (raw = '') => raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20) || 'dreamer';

async function findAvailableUsername(base, takenSet) {
  let name = safeUsername(base);
  let i = 1;
  while (takenSet.has(name.toLowerCase())) {
    name = `${safeUsername(base)}${i}`;
    i++;
    if (i > 9999) throw new Error(`Cannot find username for base "${base}"`);
  }
  takenSet.add(name.toLowerCase());
  return name;
}

// ── Step 1: Collect Firebase Auth users ─────────────────────────────────────
async function listAllFirebaseUsers() {
  const users = [];
  let pageToken;
  do {
    const result = await fbAuth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  console.log(`  Found ${users.length} Firebase Auth users`);
  return users;
}

// ── Step 2: Collect Firestore users docs ────────────────────────────────────
async function listFirestoreUsers() {
  const snap = await fbDb.collection('users').get();
  const map = {};
  snap.forEach((doc) => { map[doc.id] = { id: doc.id, ...doc.data() }; });
  console.log(`  Found ${Object.keys(map).length} Firestore user docs`);
  return map;
}

// ── Step 3: Create Supabase auth users + profiles ───────────────────────────
async function migrateUsers(fbUsers, firestoreUsers) {
  console.log('\n[Step 3] Migrating users...');
  const uidMap = {}; // Firebase UID → Supabase UID
  const takenUsernames = new Set();

  // Seed takenUsernames from any profiles already in Supabase
  const { data: existingProfiles } = await supabase.from('profiles').select('normalized_username');
  (existingProfiles || []).forEach((p) => takenUsernames.add(p.normalized_username));

  for (const fbUser of fbUsers) {
    const fsUser = firestoreUsers[fbUser.uid] || {};
    const email = fbUser.email;
    if (!email) { console.warn(`  Skipping ${fbUser.uid} — no email`); continue; }

    // Check if Supabase auth user already exists by email
    const { data: { users: existing } } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.find((u) => u.email === email);

    let sbUid;
    if (alreadyExists) {
      sbUid = alreadyExists.id;
      console.log(`  ↩  ${email} already exists in Supabase (${sbUid})`);
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          display_name: fsUser.displayName || fsUser.username || email.split('@')[0],
        }
      });
      if (error) {
        console.error(`  ✗ Failed to create auth user ${email}:`, error.message);
        continue;
      }
      sbUid = created.user.id;
      console.log(`  ✓ Created auth user ${email} → ${sbUid}`);
    }

    uidMap[fbUser.uid] = sbUid;

    // Check if profile row already exists
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', sbUid).single();
    if (existingProfile) {
      console.log(`  ↩  Profile already exists for ${email}`);
      continue;
    }

    // Derive username
    const baseUsername = fsUser.username || safeUsername(email.split('@')[0]);
    const username = await findAvailableUsername(baseUsername, takenUsernames);

    const { error: profileErr } = await supabase.from('profiles').insert({
      id:                  sbUid,
      email,
      display_name:        fsUser.displayName || username,
      username,
      normalized_username: username.toLowerCase(),
      photo_url:           fsUser.photoURL || null,
      avatar_icon:         fsUser.avatarIcon || null,
      avatar_background:   fsUser.avatarBackground || null,
      avatar_color:        fsUser.avatarColor || null,
      is_anonymous:        false,
      settings:            fsUser.settings || {},
      subscription:        fsUser.subscription || { tier: 'free' },
      ai_usage:            fsUser.aiUsage || {},
      following_ids:       [], // remapped in step 4
      follower_ids:        [], // remapped in step 4
    });

    if (profileErr) {
      console.error(`  ✗ Failed to insert profile for ${email}:`, profileErr.message);
    } else {
      console.log(`  ✓ Profile created for ${email} (@${username})`);
    }

    await sleep(50); // avoid rate limits
  }

  return uidMap;
}

// ── Step 4: Remap follow graphs ──────────────────────────────────────────────
async function remapFollowGraphs(firestoreUsers, uidMap) {
  console.log('\n[Step 4] Remapping follow graphs...');
  for (const [fbUid, fsUser] of Object.entries(firestoreUsers)) {
    const sbUid = uidMap[fbUid];
    if (!sbUid) continue;

    const followingIds = (fsUser.followingIds || []).map((id) => uidMap[id]).filter(Boolean);
    const followerIds  = (fsUser.followerIds  || []).map((id) => uidMap[id]).filter(Boolean);

    if (followingIds.length || followerIds.length) {
      await supabase.from('profiles').update({ following_ids: followingIds, follower_ids: followerIds }).eq('id', sbUid);
      console.log(`  ✓ Follow graph for ${fbUid} → ${sbUid} (following: ${followingIds.length}, followers: ${followerIds.length})`);
    }
  }
}

// ── Step 5: Migrate dreams ───────────────────────────────────────────────────
async function migrateDreams(uidMap) {
  console.log('\n[Step 5] Migrating dreams...');
  const snap = await fbDb.collection('dreams').get();
  const fbDreamIdToSbId = {}; // needed for comments

  for (const doc of snap.docs) {
    const d = doc.data();
    const sbUserId = uidMap[d.userId];
    if (!sbUserId) {
      console.warn(`  Skipping dream ${doc.id} — owner ${d.userId} not in uidMap`);
      continue;
    }

    // Check if dream already migrated (idempotent re-runs)
    const { data: existing } = await supabase.from('dreams').select('id').eq('id', doc.id).single();
    if (existing) {
      fbDreamIdToSbId[doc.id] = doc.id;
      console.log(`  ↩  Dream ${doc.id} already migrated`);
      continue;
    }

    const createdAt = d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();
    const updatedAt = d.updatedAt?.toDate?.()?.toISOString() || createdAt;

    const excludedViewerIds = (d.excludedViewerIds || []).map((id) => uidMap[id] || id);
    const taggedUserIds     = (d.taggedUserIds || []).map((id) => uidMap[id] || id);
    const taggedUsers       = (d.taggedUsers || []).map((t) => ({
      ...t, userId: uidMap[t.userId] || t.userId
    }));

    const { data: inserted, error } = await supabase.from('dreams').insert({
      id:                  doc.id, // preserve dream ID so existing share links work
      user_id:             sbUserId,
      title:               d.title || '',
      content:             d.content || '',
      visibility:          d.visibility || 'private',
      ai_generated:        d.aiGenerated || false,
      ai_title:            d.aiTitle || null,
      ai_insights:         d.aiInsights || null,
      tags:                d.tags || [],
      reaction_counts:     d.reactionCounts || {},
      viewer_reactions:    remapViewerReactions(d.viewerReactions || {}, uidMap),
      excluded_viewer_ids: excludedViewerIds,
      tagged_user_ids:     taggedUserIds,
      tagged_users:        taggedUsers,
      author_username:     d.authorUsername || null,
      created_at:          createdAt,
      updated_at:          updatedAt,
    }).select('id').single();

    if (error) {
      console.error(`  ✗ Dream ${doc.id}:`, error.message);
    } else {
      fbDreamIdToSbId[doc.id] = inserted.id;
      console.log(`  ✓ Dream ${doc.id}`);
    }
  }

  return fbDreamIdToSbId;
}

function remapViewerReactions(viewerReactions, uidMap) {
  const remapped = {};
  for (const [fbUid, emoji] of Object.entries(viewerReactions)) {
    const sbUid = uidMap[fbUid] || fbUid;
    remapped[sbUid] = emoji;
  }
  return remapped;
}

// ── Step 6: Migrate comments (subcollections under dreams) ───────────────────
async function migrateComments(fbDreamIdToSbId, uidMap) {
  console.log('\n[Step 6] Migrating comments...');
  let total = 0;

  for (const fbDreamId of Object.keys(fbDreamIdToSbId)) {
    const commentsSnap = await fbDb.collection('dreams').doc(fbDreamId).collection('comments').get();
    if (commentsSnap.empty) continue;

    for (const cDoc of commentsSnap.docs) {
      const c = cDoc.data();
      const sbUserId = uidMap[c.userId] || c.userId;
      const createdAt = c.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();

      // heartUserIds in Firebase is a map {uid: true}; convert to array
      const heartUserIds = Object.keys(c.heartUserIds || {}).map((id) => uidMap[id] || id);

      const { error } = await supabase.from('comments').insert({
        id:                     cDoc.id,
        dream_id:               fbDreamIdToSbId[fbDreamId],
        dream_owner_id:         uidMap[c.dreamOwnerId] || c.dreamOwnerId || null,
        user_id:                sbUserId,
        author_display_name:    c.authorDisplayName || null,
        author_username:        c.authorUsername || null,
        dream_owner_username:   c.dreamOwnerUsername || null,
        dream_title_snapshot:   c.dreamTitleSnapshot || null,
        content:                c.content || '',
        parent_comment_id:      c.parentCommentId || null,
        parent_comment_user_id: uidMap[c.parentCommentUserId] || c.parentCommentUserId || null,
        mentions:               (c.mentions || []).map((id) => uidMap[id] || id),
        mention_handles:        c.mentionHandles || [],
        activity_target_ids:    (c.activityTargetIds || []).map((id) => uidMap[id] || id),
        heart_count:            c.heartCount || 0,
        heart_user_ids:         heartUserIds,
        created_at:             createdAt,
        updated_at:             c.updatedAt?.toDate?.()?.toISOString() || createdAt,
      });

      if (error && !error.message.includes('duplicate')) {
        console.error(`  ✗ Comment ${cDoc.id}:`, error.message);
      } else {
        total++;
      }
    }
  }

  console.log(`  ✓ ${total} comments migrated`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Firebase → Supabase Migration ===\n');

  console.log('[Step 1] Listing Firebase Auth users...');
  const fbUsers = await listAllFirebaseUsers();

  console.log('[Step 2] Loading Firestore user docs...');
  const firestoreUsers = await listFirestoreUsers();

  const uidMap = await migrateUsers(fbUsers, firestoreUsers);

  await remapFollowGraphs(firestoreUsers, uidMap);

  const fbDreamIdToSbId = await migrateDreams(uidMap);

  await migrateComments(fbDreamIdToSbId, uidMap);

  console.log('\n=== Migration complete ===');
  console.log(`Migrated ${Object.keys(uidMap).length} users.`);
  console.log('\nIMPORTANT: Existing users will need to use "Forgot password" to set');
  console.log('a new password, since Firebase password hashes cannot be transferred.');
  console.log('Google OAuth users can sign in immediately with no action needed.');
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
