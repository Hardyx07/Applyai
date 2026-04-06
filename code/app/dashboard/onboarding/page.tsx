'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiPost, APIError } from '@/app/lib/api';
import { useAuth } from '@/app/hooks/useAuth';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toasts, addToast, removeToast } = useToast();
  const { user } = useAuth();

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

  // Step 3: Resume Upload
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiKeys((prev) => ({ ...prev, [name]: value }));
  };

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.type.includes('text')) {
        addToast('Please upload a PDF or text file', 'error');
        return;
      }
      setResumeFile(file);
    }
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
      const response = await apiPost('/validate-keys', {
        gemini_api_key: apiKeys.gemini_api_key,
        cohere_api_key: apiKeys.cohere_api_key,
      });

      if (response === true || (response && typeof response === 'object' && 'valid' in response && response.valid)) {
        addToast('API keys validated successfully', 'success');
        setStep(3);
      } else {
        addToast('API keys are invalid', 'error');
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
    if (!resumeFile) {
      addToast('Please select a resume file', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload resume');
      }

      addToast('Resume uploaded successfully!', 'success');
      router.push('/dashboard');
    } catch (error) {
      addToast('Failed to upload resume', 'error');
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
        <span className={step === 3 ? 'current' : ''}>Upload Resume</span>
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
            Add your API keys to enable AI-powered insights. Your keys are stored securely and never shared.
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
          <h2>Step 3: Upload Resume</h2>
          <p>
            Upload your resume to enable personalized AI insights about your career.
          </p>

          <div className="ingest-trigger" style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleResumeChange}
              className="sr-only"
            />
            <label htmlFor="resume" style={{ cursor: 'pointer', display: 'block' }}>
              {resumeFile ? (
                <div>
                  <div className="ingest-trigger__icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)', margin: '0 auto 12px' }}>✓</div>
                  <h3 className="ingest-trigger__title">{resumeFile.name}</h3>
                  <p className="ingest-trigger__desc" style={{ marginBottom: 0 }}>Click to change file</p>
                </div>
              ) : (
                <div>
                  <div className="ingest-trigger__icon" style={{ margin: '0 auto 12px' }}>📄</div>
                  <h3 className="ingest-trigger__title">Click to upload resume</h3>
                  <p className="ingest-trigger__desc" style={{ marginBottom: 0 }}>or drag and drop<br/><span style={{ fontSize: '12px' }}>PDF, TXT, DOC, or DOCX</span></p>
                </div>
              )}
            </label>
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
              disabled={isLoading || !resumeFile}
              className="btn btn--primary"
            >
              {isLoading ? 'Uploading...' : 'Complete Setup'}
            </button>
          </div>
        </form>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
