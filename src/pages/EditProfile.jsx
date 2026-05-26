import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';
import { mapProfile } from '../utils/mappers';
import { AVATAR_ICONS, AVATAR_BACKGROUNDS, AVATAR_COLORS } from '../constants/avatarOptions';
import LoadingIndicator from '../components/LoadingIndicator';
import Toast from '../components/Toast';
import { triggerMediumHaptic } from '../utils/haptics';
import { appUserPropType } from '../propTypes';
import './Profile.css';
import './Legal.css';

export default function EditProfile({ user }) {
  const navigate = useNavigate();
  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const [userData, setUserData] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarIcon, setAvatarIcon] = useState(AVATAR_ICONS[0].id);
  const [avatarBackground, setAvatarBackground] = useState(AVATAR_BACKGROUNDS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);

  useEffect(() => {
    if (!user?.uid) { navigate('/profile', { replace: true }); return; }
    supabase.from('profiles').select('*').eq('id', user.uid).single()
      .then(({ data }) => {
        if (!data) { navigate('/profile', { replace: true }); return; }
        const p = mapProfile(data);
        setUserData(p);
        setDisplayName(p.displayName || '');
        setUsername(p.username || '');
        setBio(p.settings?.bio || '');
        setAvatarIcon(p.avatarIcon || AVATAR_ICONS[0].id);
        setAvatarBackground(p.avatarBackground || AVATAR_BACKGROUNDS[0]);
        setAvatarColor(p.avatarColor || AVATAR_COLORS[0]);
        setPageLoading(false);
      });
  }, [user?.uid, navigate]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.uid || !userData) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        display_name:        displayName.trim(),
        username:            username.trim() || userData.username,
        normalized_username: (username.trim() || userData.username).toLowerCase(),
        avatar_icon:         avatarIcon,
        avatar_background:   avatarBackground,
        avatar_color:        avatarColor,
        settings:            { ...(userData.settings || {}), bio: bio.trim() || null },
      }).eq('id', user.uid);
      if (error) throw error;
      void triggerMediumHaptic();
      navigate('/profile', { replace: true });
    } catch {
      setToast('Failed to update profile.');
    }
    setSaving(false);
  };

  if (pageLoading) {
    return (
      <div className="page-container">
        <div className="profile-loading loading-slot"><LoadingIndicator label="Loading…" size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {!isNativeIOS && (
        <button type="button" className="legal-back-btn" onClick={() => navigate('/profile')}>
          <FontAwesomeIcon icon={faChevronLeft} style={{ marginRight: '0.4rem' }} />
          Profile
        </button>
      )}

      <h1 style={{ marginBottom: '1.5rem' }}>Edit Profile</h1>

      <form onSubmit={handleSave} className="profile-edit-form">
        <div className="profile-field">
          <label htmlFor="ep-display-name" className="profile-field-label">Display name</label>
          <input
            id="ep-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            required
            className="profile-input"
          />
        </div>
        <div className="profile-field">
          <label htmlFor="ep-username" className="profile-field-label">Username</label>
          <input
            id="ep-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            className="profile-input"
          />
        </div>
        <div className="profile-field">
          <label htmlFor="ep-bio" className="profile-field-label">Bio</label>
          <textarea
            id="ep-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell others a little about yourself…"
            rows={4}
            className="profile-textarea"
          />
        </div>

        <div className="avatar-customizer">
          <p className="customizer-label">Avatar icon</p>
          <div className="avatar-option-grid">
            {AVATAR_ICONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`avatar-option${avatarIcon === option.id ? ' selected' : ''}`}
                onClick={() => setAvatarIcon(option.id)}
              >
                <FontAwesomeIcon icon={option.icon} /><span>{option.label}</span>
              </button>
            ))}
          </div>

          <p className="customizer-label">Background</p>
          <div className="color-swatch-grid">
            {AVATAR_BACKGROUNDS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch${avatarBackground === color ? ' selected' : ''}`}
                style={{ background: color }}
                onClick={() => setAvatarBackground(color)}
                aria-label={`Select background ${color}`}
              />
            ))}
          </div>

          <p className="customizer-label">Icon color</p>
          <div className="color-swatch-grid">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch${avatarColor === color ? ' selected' : ''}`}
                style={{ background: color }}
                onClick={() => setAvatarColor(color)}
                aria-label={`Select icon color ${color}`}
              />
            ))}
          </div>
        </div>

        <div className="profile-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/profile')}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  );
}

EditProfile.propTypes = {
  user: appUserPropType,
};
