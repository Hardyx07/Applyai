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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Get Started with ApplyAI</h1>

      {/* Progress Bar */}
      <div className="mb-8 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded ${
              s <= step ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Profile */}
      {step === 1 && (
        <form onSubmit={handleProfileSubmit} className="bg-white rounded-lg shadow p-8 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">Step 1: Your Profile</h2>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={profileData.name}
              onChange={handleProfileChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={profileData.phone}
              onChange={handleProfileChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              value={profileData.location}
              onChange={handleProfileChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="San Francisco, CA"
            />
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-2">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={profileData.bio}
              onChange={handleProfileChange}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Tell us about yourself..."
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        </form>
      )}

      {/* Step 2: API Keys */}
      {step === 2 && (
        <form onSubmit={handleApiKeysSubmit} className="bg-white rounded-lg shadow p-8 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">Step 2: API Keys</h2>
          <p className="text-gray-600">
            Add your API keys to enable AI-powered insights. Your keys are stored securely and never shared.
          </p>

          <div>
            <label htmlFor="gemini_api_key" className="block text-sm font-medium text-gray-700 mb-2">
              Gemini API Key *
            </label>
            <input
              id="gemini_api_key"
              name="gemini_api_key"
              type="password"
              value={apiKeys.gemini_api_key}
              onChange={handleApiKeyChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Enter your Gemini API key"
            />
          </div>

          <div>
            <label htmlFor="cohere_api_key" className="block text-sm font-medium text-gray-700 mb-2">
              Cohere API Key *
            </label>
            <input
              id="cohere_api_key"
              name="cohere_api_key"
              type="password"
              value={apiKeys.cohere_api_key}
              onChange={handleApiKeyChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Enter your Cohere API key"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {isLoading ? 'Validating...' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Resume */}
      {step === 3 && (
        <form onSubmit={handleResumeSubmit} className="bg-white rounded-lg shadow p-8 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">Step 3: Upload Resume</h2>
          <p className="text-gray-600">
            Upload your resume to enable personalized AI insights about your career.
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleResumeChange}
              className="hidden"
            />
            <label htmlFor="resume" className="cursor-pointer">
              {resumeFile ? (
                <div>
                  <p className="text-lg font-medium text-green-600">✓ {resumeFile.name}</p>
                  <p className="text-sm text-gray-600 mt-1">Click to change file</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-medium text-gray-900">Click to upload resume</p>
                  <p className="text-sm text-gray-600">or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-2">PDF, TXT, DOC, or DOCX</p>
                </div>
              )}
            </label>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading || !resumeFile}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
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
