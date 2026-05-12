const { createClient } = require('@supabase/supabase-js');

const getSupabaseAdmin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const setCors = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
};

const verifyCaller = async (req, expectedUid) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('Authentication required.');

  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Invalid session.');
  if (user.id !== expectedUid) throw new Error('You can only delete your own account.');
  return admin;
};

module.exports = async function handler(req, res) {
  setCors(res, req.headers?.origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const { action, uid, confirmText } = body || {};
  if (!action) return res.status(400).json({ error: 'Missing action' });
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  let admin;
  try {
    admin = await verifyCaller(req, uid);
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Unauthorized.' });
  }

  // Handle delete_account action
  if (action !== 'delete_account') return res.status(400).json({ error: 'Unknown action' });
  if (confirmText !== 'DELETE') return res.status(400).json({ error: 'Invalid confirmation phrase.' });

  try {
    const { data: dreamRows, error: dreamError } = await admin
      .from('dreams')
      .select('id')
      .eq('user_id', uid);
    if (dreamError) throw dreamError;

    const { data: commentRows, error: commentError } = await admin
      .from('comments')
      .select('id')
      .eq('user_id', uid);
    if (commentError) throw commentError;

    const dreamIds = (dreamRows || []).map((row) => row.id).filter(Boolean);
    const commentIds = (commentRows || []).map((row) => row.id).filter(Boolean);

    if (commentIds.length) {
      const { error: detachReplyError } = await admin
        .from('comments')
        .update({ parent_comment_id: null, parent_comment_user_id: null })
        .in('parent_comment_id', commentIds);
      if (detachReplyError) throw detachReplyError;
    }

    const { error: detachParentUserError } = await admin
      .from('comments')
      .update({ parent_comment_user_id: null })
      .eq('parent_comment_user_id', uid);
    if (detachParentUserError) throw detachParentUserError;

    if (dreamIds.length) {
      const { error: deleteDreamActivityError } = await admin
        .from('activity')
        .delete()
        .in('dream_id', dreamIds);
      if (deleteDreamActivityError) throw deleteDreamActivityError;
    }

    if (commentIds.length) {
      const { error: deleteCommentActivityError } = await admin
        .from('activity')
        .delete()
        .in('comment_id', commentIds);
      if (deleteCommentActivityError) throw deleteCommentActivityError;
    }

    const { error: deleteOwnedActivityError } = await admin
      .from('activity')
      .delete()
      .or(`target_user_id.eq.${uid},actor_id.eq.${uid},dream_owner_id.eq.${uid}`);
    if (deleteOwnedActivityError) throw deleteOwnedActivityError;

    const { error: deleteCommentsError } = await admin
      .from('comments')
      .delete()
      .eq('user_id', uid);
    if (deleteCommentsError) throw deleteCommentsError;

    const { error: deleteDreamsError } = await admin
      .from('dreams')
      .delete()
      .eq('user_id', uid);
    if (deleteDreamsError) throw deleteDreamsError;

    const { error: deleteProfileError } = await admin
      .from('profiles')
      .delete()
      .eq('id', uid);
    if (deleteProfileError) throw deleteProfileError;

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(uid);
    if (deleteAuthError) throw deleteAuthError;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('delete_account failed', error);
    return res.status(500).json({ error: error.message || 'Failed to delete account.' });
  }
};
