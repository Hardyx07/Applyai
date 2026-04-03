'use client';

import { useState } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { apiPost, APIError } from '@/app/lib/api';

export default function KeysPage() {
  const [geminiKey, setGeminiKey] = useState('');
  const [cohereKey, setCohereKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!geminiKey || !cohereKey) {
      addToast('Both API keys are required', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiPost('/validate-keys', {
        gemini_api_key: geminiKey,
        cohere_api_key: cohereKey,
      });

      if (response === true || (response && typeof response === 'object' && 'valid' in response && response.valid)) {
        addToast('API keys validated and saved successfully!', 'success');
        setGeminiKey('');
        setCohereKey('');
      } else {
        addToast('API keys are invalid. Please check and try again.', 'error');
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
        <p>
          Manage your API keys for Gemini and Cohere. Your keys are stored securely and never exposed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '640px', marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div className="form-group">
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
              <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)' }}>
                Google AI Studio
              </a>
            </p>
          </div>

          <div className="form-group">
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
              <a href="https://dashboard.cohere.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)' }}>
                Cohere Dashboard
              </a>
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn--primary"
            style={{ width: 'fit-content' }}
          >
            {isLoading ? 'Validating...' : 'Validate & Save Keys'}
          </button>
        </div>
      </form>

      <div className="banner banner--info">
        <div style={{ width: '100%' }}>
           <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>🔒 Security</h3>
           <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--text-xs)' }}>
             <li>• Your API keys are encrypted and stored securely</li>
             <li>• Keys are never shared or logged</li>
             <li>• You can update your keys at any time</li>
             <li>• Bring Your Own Key (BYOK) - full control over your data</li>
           </ul>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
