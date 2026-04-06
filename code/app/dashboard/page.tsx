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
          <div className="dash-home__card-icon dash-home__card-icon--blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <h2 className="dash-home__card-title">Get Started</h2>
          <p className="dash-home__card-desc">
            Complete your profile, add API keys, and upload your resume to start getting AI-powered insights.
          </p>
        </Link>

        {/* Generate Card */}
        <Link href="/dashboard/generate" className="dash-home__card">
          <div className="dash-home__card-icon dash-home__card-icon--green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
          </div>
          <h2 className="dash-home__card-title">Generate Insights</h2>
          <p className="dash-home__card-desc">
            Ask questions about your career path and get personalized AI-powered guidance.
          </p>
        </Link>

        {/* Profile Card */}
        <Link href="/dashboard/profile" className="dash-home__card">
          <div className="dash-home__card-icon dash-home__card-icon--purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b44a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
          <h2 className="dash-home__card-title">Profile</h2>
          <p className="dash-home__card-desc">
            View and update your professional profile information.
          </p>
        </Link>

        {/* API Keys Card */}
        <Link href="/dashboard/keys" className="dash-home__card">
          <div className="dash-home__card-icon dash-home__card-icon--orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
          </div>
          <h2 className="dash-home__card-title">API Keys</h2>
          <p className="dash-home__card-desc">
            Manage your Gemini and Cohere API keys for secure data processing.
          </p>
        </Link>
      </div>
    </div>
  );
}
