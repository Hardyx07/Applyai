'use client';

import { useState } from 'react';
import { useToast } from '@/app/hooks/useToast';
import { ToastContainer } from '@/app/components/ToastContainer';
import { getAccessToken } from '@/app/lib/auth';

export default function IngestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toasts, addToast, removeToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setUploadProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      addToast('Please select a file', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = getAccessToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const result = await response.json();
      addToast(`Resume ingested successfully! ${result.chunks_created || ''} chunks created.`, 'success');
      setFile(null);
      setUploadProgress(0);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to upload file', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Upload Resume</h1>
        <p>Upload your resume or career documents for AI-powered analysis and personalized insights.</p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '640px' }}>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="ingest-trigger"
          style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'border-color var(--transition-base)' }}
        >
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            onChange={handleFileChange}
            className="sr-only"
          />
          <label htmlFor="file" style={{ cursor: 'pointer', display: 'block' }}>
            {file ? (
              <div>
                <div className="ingest-trigger__icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>✓</div>
                <h3 className="ingest-trigger__title">{file.name}</h3>
                <p className="ingest-trigger__desc" style={{ marginBottom: 0 }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB<br/>
                  Click to change file
                </p>
              </div>
            ) : (
              <div>
                <div className="ingest-trigger__icon">📄</div>
                <h3 className="ingest-trigger__title">Click to upload or drag and drop</h3>
                <p className="ingest-trigger__desc" style={{ marginBottom: 0 }}>
                  PDF, TXT, DOC, or DOCX files<br/>
                  Maximum 10 MB
                </p>
              </div>
            )}
          </label>
        </div>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="ingest-progress">
            <div className="ingest-progress__label">Uploading... {uploadProgress}%</div>
            <div className="ingest-progress__bar">
              <div
                className="ingest-progress__fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div style={{ marginTop: 'var(--space-8)' }}>
          <button
            type="submit"
            disabled={isLoading || !file}
            className="btn btn--primary btn--full"
          >
            {isLoading ? 'Uploading...' : 'Upload Resume'}
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
