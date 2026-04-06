'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiGet, apiPost, APIError } from '@/app/lib/api';
import { ProfileSchema } from '@/app/lib/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await apiGet<ProfileSchema>('/profile');
        setProfile(data);
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
    if (!profile) return;
    const { name, value } = e.target;
    setProfile((prev) => prev ? { ...prev, [name]: value } : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    try {
      const updated = await apiPost<ProfileSchema>('/profile', {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        bio: profile.bio,
        resume_text: profile.resume_text,
      });
      setProfile(updated);
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

  return (
    <div>
      <div className="page-header">
        <h1>Your Profile</h1>
      </div>

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
              value={profile.name || ''}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={profile.email || ''}
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
              value={profile.phone || ''}
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
              value={profile.location || ''}
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
            value={profile.bio || ''}
            onChange={handleChange}
            rows={4}
            className="form-textarea"
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
