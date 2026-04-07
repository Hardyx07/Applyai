'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiGet, apiPost, apiPut, APIError } from '@/app/lib/api';
import { IngestResponse, ProfileData, ProfileResponse } from '@/app/lib/types';
import { getByokKeys, setByokKeys } from '@/app/lib/byok';

const emptyProfile: ProfileData = {
  name: '',
  phone: '',
  location: '',
  bio: '',
  resume_text: '',
};

export default function IngestPage() {
  const [resumeText, setResumeText] = useState('');
  const [profileData, setProfileData] = useState<ProfileData>(emptyProfile);
  const [geminiKey, setGeminiKey] = useState('');
  const [cohereKey, setCohereKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const storedKeys = getByokKeys();
        setGeminiKey(storedKeys.gemini_api_key);
        setCohereKey(storedKeys.cohere_api_key);

        const profile = await apiGet<ProfileResponse>('/profile');
        setProfileData({
          ...emptyProfile,
          ...(profile.data || {}),
        });
        setResumeText(String(profile.data?.resume_text || ''));
      } catch (error) {
        if (error instanceof APIError) {
          addToast(error.message, 'error');
        } else {
          addToast('Failed to load profile data', 'error');
        }
      }
    };

    loadProfile();
  }, [addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resumeText.trim()) {
      addToast('Please paste your resume text', 'error');
      return;
    }

    if (!geminiKey || !cohereKey) {
      addToast('Please provide both Gemini and Cohere API keys', 'error');
      return;
    }

    setIsLoading(true);
    try {
      setByokKeys({ gemini_api_key: geminiKey, cohere_api_key: cohereKey });

      await apiPut('/profile', {
        data: {
          ...profileData,
          resume_text: resumeText,
        },
      });

      const result = await apiPost<IngestResponse>(
        '/ingest',
        {
          source: 'Resume',
          force_reingest: true,
        },
        {
          byokHeaders: {
            'X-Gemini-API-Key': geminiKey,
            'X-Cohere-API-Key': cohereKey,
          },
        }
      );

      const chunkCount = result.child_chunks ?? result.chunks_created ?? 0;
      addToast(`Resume ingested successfully! ${chunkCount} chunks created.`, 'success');
    } catch (error) {
      if (error instanceof APIError) {
        addToast(error.message, 'error');
      } else {
        addToast('Failed to ingest profile data', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Ingest Resume Data</h1>
        <p>Paste your resume text and ingest it for AI-powered analysis and personalized insights.</p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '640px' }}>
        <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
          <label htmlFor="resume_text" className="form-label">
            Resume Text
          </label>
          <textarea
            id="resume_text"
            name="resume_text"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={10}
            className="form-textarea"
            placeholder="Paste your full resume text here..."
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
          <label htmlFor="gemini_key" className="form-label">
            Gemini API Key
          </label>
          <input
            id="gemini_key"
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            className="form-input"
            placeholder="Enter your Gemini API key"
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
          <label htmlFor="cohere_key" className="form-label">
            Cohere API Key
          </label>
          <input
            id="cohere_key"
            type="password"
            value={cohereKey}
            onChange={(e) => setCohereKey(e.target.value)}
            className="form-input"
            placeholder="Enter your Cohere API key"
            required
          />
        </div>

        <div style={{ marginTop: 'var(--space-8)' }}>
          <button
            type="submit"
            disabled={isLoading || !resumeText.trim() || !geminiKey || !cohereKey}
            className="btn btn--primary btn--full"
          >
            {isLoading ? 'Ingesting...' : 'Ingest Resume Text'}
          </button>
        </div>
      </form>

      <div className="banner banner--success" style={{ marginTop: 'var(--space-8)', maxWidth: '640px' }}>
        <div>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>✨ What happens next?</h3>
          <ul style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>
            <li>• Your resume is analyzed and broken into searchable chunks</li>
            <li>• Content is embedded using advanced AI models</li>
            <li>• Ready for real-time Q&A about your career</li>
            <li>• All processing is secure and private</li>
          </ul>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
