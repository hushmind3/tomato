import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase 서버 환경변수가 필요합니다.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || typeof body.summary !== 'string' || !body.title.trim() || !body.summary.trim()) {
    return NextResponse.json({ error: '등록할 제목과 요약이 필요합니다.' }, { status: 400 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: membership } = await admin.from('actor_members').select('actor_id').eq('user_id', user.id).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: '관리할 actor가 없습니다.' }, { status: 400 });

  const profilePatch = body.profilePatch && typeof body.profilePatch === 'object' ? body.profilePatch : null;
  if (profilePatch) {
    const { data: existingProfile } = await admin.from('actor_profiles').select('summary, skills, industries, countries, languages').eq('actor_id', membership.actor_id).maybeSingle();
    const merge = (current: unknown, incoming: unknown) => [...new Set([...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
    const { error: profileError } = await admin.from('actor_profiles').upsert({
      actor_id: membership.actor_id,
      summary: typeof profilePatch.summary === 'string' && profilePatch.summary.trim() ? profilePatch.summary.trim() : existingProfile?.summary ?? null,
      skills: merge(existingProfile?.skills, profilePatch.skills),
      industries: merge(existingProfile?.industries, profilePatch.industries),
      countries: merge(existingProfile?.countries, profilePatch.countries),
      languages: merge(existingProfile?.languages, profilePatch.languages),
      updated_at: new Date().toISOString(),
    });
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const { data, error } = await admin.from('listings').insert({
    actor_id: membership.actor_id,
    intent: body.intent === 'offering' ? 'offering' : 'seeking',
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'other',
    title: body.title.trim(),
    summary: body.summary.trim(),
    requirements: body.requirements && typeof body.requirements === 'object' ? body.requirements : {},
    source_conversation_id: body.sourceConversationId ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ listing: data }, { status: 201 });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: listings, error } = await supabase.from('listings').select('id, actor_id, intent, category, title, summary, requirements, status, created_at').eq('status', 'active').limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ listings });
}
