import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');

  // Fast-path: Check if any Supabase auth cookies exist.
  // Cookies are formatted like `sb-<ref>-auth-token` or `sb-<ref>-auth-token.0`
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
  );

  // If no auth cookie exists and user accesses /dashboard, redirect immediately with 0ms network latency
  if (!hasAuthCookie && isDashboard) {
    const authUrl = request.nextUrl.clone();
    authUrl.pathname = '/auth';
    return NextResponse.redirect(authUrl);
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Enforce a strict 2000ms timeout to guarantee Vercel Edge 504 timeout is never triggered
    const authTimeoutPromise = new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 2000)
    );

    const {
      data: { user },
    } = await Promise.race([supabase.auth.getUser(), authTimeoutPromise]);

    if (!user && isDashboard) {
      const authUrl = request.nextUrl.clone();
      authUrl.pathname = '/auth';
      return NextResponse.redirect(authUrl);
    }
  } catch (error) {
    // If Supabase is paused, unreachable, or times out, safely redirect to /auth
    // instead of crashing Vercel with 504 MIDDLEWARE_INVOCATION_TIMEOUT
    console.error('Middleware auth check failed or timed out:', error);
    if (isDashboard) {
      const authUrl = request.nextUrl.clone();
      authUrl.pathname = '/auth';
      return NextResponse.redirect(authUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
