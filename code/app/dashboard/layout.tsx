'use client';

import { useAuth } from '@/app/hooks/useAuth';
import { ProtectedRoute } from '@/app/components/ProtectedRoute';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <ProtectedRoute>
      <div className="dash-container">
        {/* Navigation */}
        <nav className="dash-nav">
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="navbar__logo">
              Apply<span>AI</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)' }}>
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="btn btn--secondary btn--sm"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        {/* Sidebar + Content */}
        <div className="dash-body">
          {/* Sidebar */}
          <aside className="dash-sidebar">
            <div className="dash-menu">
              <h2 className="dash-menu__title">Menu</h2>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <Link
                  href="/dashboard"
                  className={`dash-menu__link ${pathname === '/dashboard' ? 'dash-menu__link--active' : ''}`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/profile"
                  className={`dash-menu__link ${pathname === '/dashboard/profile' ? 'dash-menu__link--active' : ''}`}
                >
                  Profile
                </Link>
                <Link
                  href="/dashboard/keys"
                  className={`dash-menu__link ${pathname === '/dashboard/keys' ? 'dash-menu__link--active' : ''}`}
                >
                  API Keys
                </Link>
                <Link
                  href="/dashboard/ingest"
                  className={`dash-menu__link ${pathname === '/dashboard/ingest' ? 'dash-menu__link--active' : ''}`}
                >
                  Ingest
                </Link>
                <Link
                  href="/dashboard/generate"
                  className={`dash-menu__link ${pathname === '/dashboard/generate' ? 'dash-menu__link--active' : ''}`}
                >
                  Generate
                </Link>
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="dash-content">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
