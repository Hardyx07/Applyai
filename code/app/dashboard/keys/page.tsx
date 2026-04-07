'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiPost, APIError } from '@/app/lib/api';
import { ValidateKeysResponse } from '@/app/lib/types';
import { getByokKeys, setByokKeys } from '@/app/lib/byok';

export default function KeysPage() {
  const [geminiKey, setGeminiKey] = useState('');
  const [cohereKey, setCohereKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const stored = getByokKeys();
    setGeminiKey(stored.gemini_api_key);
    setCohereKey(stored.cohere_api_key);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!geminiKey || !cohereKey) {
      addToast('Both API keys are required', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiPost<ValidateKeysResponse>('/settings/validate-keys', {
        gemini_api_key: geminiKey,
        cohere_api_key: cohereKey,
      });

      if (response.gemini_valid && response.cohere_valid) {
        setByokKeys({
          gemini_api_key: geminiKey,
          cohere_api_key: cohereKey,
        });
        addToast('API keys validated and saved in this browser.', 'success');
      } else {
        addToast(response.detail || 'API keys are invalid. Please check and try again.', 'error');
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

  return (
    <div>
      <div className="page-header">
        <h1>API Keys</h1>
        <p>Manage your API keys for Gemini and Cohere. Keys are stored only in this browser on this device.</p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '640px' }}>
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
          />
          <p className="form-hint">
            Get your key from{' '}
            <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand">
              Google AI Studio
            </a>
          </p>
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
          />
          <p className="form-hint">
            Get your key from{' '}
            <a href="https://dashboard.cohere.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-brand">
              Cohere Dashboard
            </a>
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn--primary btn--full"
        >
          {isLoading ? 'Validating...' : 'Validate & Save in Browser'}
        </button>
      </form>

      <div className="banner banner--info" style={{ marginTop: 'var(--space-8)', maxWidth: '640px' }}>
        <div>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>🔒 Security</h3>
          <ul style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>
            <li>• Keys are stored in your browser storage on this device</li>
            <li>• Keys are never shared or logged</li>
            <li>• Keys are cleared when you logout</li>
            <li>• Bring Your Own Key (BYOK) - full control over your data</li>
          </ul>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
