import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const successUrl = new URL('/?auth=success', url.origin);
  const errorUrl = new URL('/?authError=oauth_callback', url.origin);

  if (!code) return NextResponse.redirect(errorUrl);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(error ? errorUrl : successUrl);
}
