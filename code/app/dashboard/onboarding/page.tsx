'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiPost, apiPut, APIError } from '@/app/lib/api';
import { ValidateKeysResponse } from '@/app/lib/types';
import { getByokKeys, setByokKeys } from '@/app/lib/byok';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toasts, addToast, removeToast } = useToast();

  // Step 1: Profile Info
  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    location: '',
    bio: '',
  });

  // Step 2: API Keys
  const [apiKeys, setApiKeys] = useState({
    gemini_api_key: '',
    cohere_api_key: '',
  });

  // Step 3: Resume Text
  const [resumeText, setResumeText] = useState('');

  useEffect(() => {
    const stored = getByokKeys();
    setApiKeys({
      gemini_api_key: stored.gemini_api_key,
      cohere_api_key: stored.cohere_api_key,
    });
  }, []);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiKeys((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData.name) {
      addToast('Name is required', 'error');
      return;
    }
    setStep(2);
  };

  const handleApiKeysSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeys.gemini_api_key || !apiKeys.cohere_api_key) {
      addToast('Both API keys are required', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // Validate keys
      const response = await apiPost<ValidateKeysResponse>('/settings/validate-keys', {
        gemini_api_key: apiKeys.gemini_api_key,
        cohere_api_key: apiKeys.cohere_api_key,
      });

      if (response.gemini_valid && response.cohere_valid) {
        setByokKeys({
          gemini_api_key: apiKeys.gemini_api_key,
          cohere_api_key: apiKeys.cohere_api_key,
        });
        addToast('API keys validated successfully', 'success');
        setStep(3);
      } else {
        addToast(response.detail || 'API keys are invalid', 'error');
      }
    } catch (error) {
      if (error instanceof APIError) {
        addToast(error.message, 'error');
      } else {
        addToast('Failed to validate API keys', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResumeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeText.trim()) {
      addToast('Please paste your resume text', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const storedKeys = getByokKeys();
      const geminiApiKey = apiKeys.gemini_api_key || storedKeys.gemini_api_key;
      const cohereApiKey = apiKeys.cohere_api_key || storedKeys.cohere_api_key;

      if (!geminiApiKey || !cohereApiKey) {
        addToast('Please validate your API keys before ingesting.', 'error');
        setStep(2);
        return;
      }

      await apiPut('/profile', {
        data: {
          ...profileData,
          resume_text: resumeText,
        },
      });

      await apiPost(
        '/ingest',
        {
          source: 'Resume',
          force_reingest: true,
        },
        {
          byokHeaders: {
            'X-Gemini-API-Key': geminiApiKey,
            'X-Cohere-API-Key': cohereApiKey,
          },
        }
      );

      addToast('Resume text ingested successfully!', 'success');
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof APIError) {
        addToast(error.message, 'error');
      } else {
        addToast('Failed to ingest resume text', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="onboard">
      <div className="page-header">
        <h1>Get Started with ApplyAI</h1>
      </div>

      {/* Progress Bar */}
      <div className="onboard__step-label">
        <span className={step === 1 ? 'current' : ''}>Profile Info</span>
        <span className={step === 2 ? 'current' : ''}>API Keys</span>
        <span className={step === 3 ? 'current' : ''}>Resume Text</span>
      </div>
      <div className="onboard__progress">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`onboard__bar ${s <= step ? 'active' : ''}`}
          />
        ))}
      </div>

      {/* Step 1: Profile */}
      {step === 1 && (
        <form onSubmit={handleProfileSubmit} className="onboard__card">
          <h2>Step 1: Your Profile</h2>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="name" className="form-label">
              Full Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={profileData.name}
              onChange={handleProfileChange}
              required
              className="form-input"
              placeholder="John Doe"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="phone" className="form-label">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={profileData.phone}
              onChange={handleProfileChange}
              className="form-input"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="location" className="form-label">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={profileData.location}
              onChange={handleProfileChange}
              className="form-input"
              placeholder="San Francisco, CA"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="bio" className="form-label">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={profileData.bio}
              onChange={handleProfileChange}
              rows={4}
              className="form-textarea"
              placeholder="Tell us about yourself..."
            />
          </div>

          <div className="onboard__actions">
            <button
              type="submit"
              className="btn btn--primary"
            >
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleApiKeysSubmit} className="onboard__card">
          <h2>Step 2: API Keys</h2>
          <p>
            Add your API keys to enable AI-powered insights. Keys are stored only in this browser.
          </p>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="gemini_api_key" className="form-label">
              Gemini API Key *
            </label>
            <input
              id="gemini_api_key"
              name="gemini_api_key"
              type="password"
              value={apiKeys.gemini_api_key}
              onChange={handleApiKeyChange}
              required
              className="form-input"
              placeholder="Enter your Gemini API key"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="cohere_api_key" className="form-label">
              Cohere API Key *
            </label>
            <input
              id="cohere_api_key"
              name="cohere_api_key"
              type="password"
              value={apiKeys.cohere_api_key}
              onChange={handleApiKeyChange}
              required
              className="form-input"
              placeholder="Enter your Cohere API key"
            />
          </div>

          <div className="onboard__actions">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn btn--secondary"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn--primary"
            >
              {isLoading ? 'Validating...' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Resume */}
      {step === 3 && (
        <form onSubmit={handleResumeSubmit} className="onboard__card">
          <h2>Step 3: Paste Resume Text</h2>
          <p>
            Paste your resume content so we can index it for personalized AI insights.
          </p>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="resume_text" className="form-label">
              Resume Text *
            </label>
            <textarea
              id="resume_text"
              name="resume_text"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={10}
              required
              className="form-textarea"
              placeholder="Paste your full resume text here..."
            />
          </div>

          <div className="onboard__actions">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn btn--secondary"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading || !resumeText.trim()}
              className="btn btn--primary"
            >
              {isLoading ? 'Ingesting...' : 'Complete Setup'}
            </button>
          </div>
        </form>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
