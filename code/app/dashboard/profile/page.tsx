'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiGet, apiPut, APIError } from '@/app/lib/api';
import { ProfileData, ProfileResponse } from '@/app/lib/types';

const emptyProfile: ProfileData = {
  name: '',
  phone: '',
  location: '',
  bio: '',
  resume_text: '',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await apiGet<ProfileResponse>('/profile');
        setProfile(data);
        setProfileData({
          ...emptyProfile,
          ...(data.data || {}),
        });
      } catch (error) {
        if (error instanceof APIError) {
          addToast(error.message, 'error');
        } else {
          addToast('Failed to load profile', 'error');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [addToast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);
    try {
      const updated = await apiPut<ProfileResponse>('/profile', {
        data: profileData,
      });
      setProfile(updated);
      setProfileData({
        ...emptyProfile,
        ...(updated.data || {}),
      });
      addToast('Profile updated successfully', 'success');
    } catch (error) {
      if (error instanceof APIError) {
        addToast(error.message, 'error');
      } else {
        addToast('Failed to update profile', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner--lg"></div>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center text-gray-600">Failed to load profile</div>;
  }

  const hasCompletedOnboarding = Boolean(profile.ingested_at);
  const lastIngested = profile.ingested_at
    ? new Date(profile.ingested_at).toLocaleString()
    : null;

  return (
    <div>
      <div className="page-header">
        <h1>Your Profile</h1>
        <p>Review the profile data that powers onboarding and resume ingestion.</p>
      </div>

      {hasCompletedOnboarding && (
        <div className="banner banner--success" style={{ marginBottom: 'var(--space-6)' }}>
          <div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Onboarding complete</h3>
            <p style={{ fontSize: 'var(--text-sm)', opacity: 0.85 }}>
              Your resume was last ingested {lastIngested}. Updating this profile will clear the
              completion state until you ingest again.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={profileData.name || ''}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone" className="form-label">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={profileData.phone || ''}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="location" className="form-label">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={profileData.location || ''}
              onChange={handleChange}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 'var(--space-6)' }}>
          <label htmlFor="bio" className="form-label">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            value={profileData.bio || ''}
            onChange={handleChange}
            rows={4}
            className="form-textarea"
          />
        </div>

        <div className="form-group" style={{ marginTop: 'var(--space-6)' }}>
          <label htmlFor="resume_text" className="form-label">
            Resume Text
          </label>
          <textarea
            id="resume_text"
            name="resume_text"
            value={profileData.resume_text || ''}
            onChange={handleChange}
            rows={10}
            className="form-textarea"
            placeholder="Paste the resume text that should be used for ingest and search..."
          />
        </div>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <button
            type="submit"
            disabled={isSaving}
            className="btn btn--primary"
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
