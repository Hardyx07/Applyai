'use client';

import { useAuth } from '@/app/hooks/useAuth';
import { ProtectedRoute } from '@/app/components/ProtectedRoute';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, user } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <ProtectedRoute>
      <div className="dash">
        {/* Topbar */}
        <nav className="dash__topbar">
          <div className="dash__topbar-inner">
            <div className="dash__topbar-left">
              <button className="dash__hamburger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="navbar__logo">Apply<span>AI</span></div>
            </div>

            <div className="dash__topbar-right">
              <span className="dash__user-email">{user?.email}</span>
              <button onClick={handleLogout} className="btn btn--secondary btn--sm">
                Logout
              </button>
            </div>
          </div>
        </nav>

        {/* Body and Sidebar */}
        <div className="dash__body">
          {/* Sidebar */}
          <aside className="dash__sidebar">
            <nav className="dash__nav">
              <Link href="/dashboard" className="dash__nav-item text-brand"> {/* simplified logic since layout doesn't easily know current path */}
                Dashboard
              </Link>
              <Link href="/dashboard/profile" className="dash__nav-item">
                Profile
              </Link>
              <Link href="/dashboard/keys" className="dash__nav-item">
                API Keys
              </Link>
              <Link href="/dashboard/ingest" className="dash__nav-item">
                Ingest
              </Link>
              <Link href="/dashboard/generate" className="dash__nav-item">
                Generate
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="dash__content">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
