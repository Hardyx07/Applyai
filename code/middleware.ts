import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedPaths = ['/dashboard'];

// Routes that should redirect to dashboard if already authenticated
const authPaths = ['/login', '/register'];

function sanitizeNextPath(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return null;
  }

  return path;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check for the presence of an access token cookie to protect routes quickly at the edge.
  // The actual cryptographic validity check logic resides in the 'ProtectedRoute' client component.
  const hasToken = request.cookies.has('access_token');
  
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  const isAuthPath = authPaths.some(path => pathname.startsWith(path));

  if (isProtectedPath && !hasToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  
  if (isAuthPath && hasToken) {
    const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(nextPath || '/dashboard', request.url));
  }

  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
