'use client';

import Link from 'next/link';
import { useAuth } from '@/app/hooks/useAuth';

export default function DashboardHome() {
  const { user } = useAuth();

  return (
    <div>
      <div className="dash-home__welcome">
        <h1>Welcome back, {user?.email}!</h1>
        <p>Let's get started with ApplyAI</p>
      </div>

      <div className="dash-home__grid">
        {/* Onboarding Card */}
        <Link href="/dashboard/onboarding" className="dash-home__card">
          <div className="dash-home__card-icon" style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}>ℹ️</div>
          <h2 className="dash-home__card-title">Get Started</h2>
          <p className="dash-home__card-desc">
            Complete your profile, add API keys, and upload your resume to start getting AI-powered insights.
          </p>
          <div className="dash-home__card-status" style={{ color: 'var(--color-brand)' }}>
            Start Onboarding &rarr;
          </div>
        </Link>

        {/* Generate Card */}
        <Link href="/dashboard/generate" className="dash-home__card">
          <div className="dash-home__card-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>💡</div>
          <h2 className="dash-home__card-title">Generate Insights</h2>
          <p className="dash-home__card-desc">
            Ask questions about your career path and get personalized AI-powered guidance.
          </p>
          <div className="dash-home__card-status" style={{ color: 'var(--color-success)' }}>
            Start Generating &rarr;
          </div>
        </Link>

        {/* Profile Card */}
        <Link href="/dashboard/profile" className="dash-home__card">
          <div className="dash-home__card-icon" style={{ background: '#F3EEFB', color: '#8854D0' }}>👤</div>
          <h2 className="dash-home__card-title">Profile</h2>
          <p className="dash-home__card-desc">
            View and update your professional profile information.
          </p>
          <div className="dash-home__card-status" style={{ color: '#8854D0' }}>
            Manage Profile &rarr;
          </div>
        </Link>

        {/* API Keys Card */}
        <Link href="/dashboard/keys" className="dash-home__card">
          <div className="dash-home__card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>🔑</div>
          <h2 className="dash-home__card-title">API Keys</h2>
          <p className="dash-home__card-desc">
            Manage your Gemini and Cohere API keys for secure data processing.
          </p>
          <div className="dash-home__card-status" style={{ color: 'var(--color-warning)' }}>
            Manage Keys &rarr;
          </div>
        </Link>
      </div>
    </div>
  );
}
