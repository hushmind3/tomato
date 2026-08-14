import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Supabase 서버 환경변수가 필요합니다.' }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || typeof body.summary !== 'string' || !body.title.trim() || !body.summary.trim()) {
    return NextResponse.json({ error: '수정할 제목과 요약이 필요합니다.' }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await admin.from('actor_members').select('actor_id').eq('user_id', user.id).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: '관리할 actor가 없습니다.' }, { status: 400 });

  const { data, error } = await admin.from('listings').update({
    intent: body.intent === 'offering' ? 'offering' : 'seeking',
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'other',
    title: body.title.trim(),
    summary: body.summary.trim(),
    requirements: body.requirements && typeof body.requirements === 'object' ? body.requirements : {},
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('actor_id', membership.actor_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ listing: data });
}
