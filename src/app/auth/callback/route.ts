import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';
  if (!code) return NextResponse.redirect(new URL('/auth?error=missing_code', request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/auth?error=auth_callback_failed', request.url));

  const safeTarget = next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : '/dashboard';
  return NextResponse.redirect(new URL(safeTarget, request.url));
}