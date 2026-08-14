import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: memberships, error: membershipError } = await supabase
    .from('actor_members')
    .select('actor_id, role')
    .eq('user_id', user.id);
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 });

  const actorIds = (memberships ?? []).map((membership) => membership.actor_id);
  if (actorIds.length === 0) return NextResponse.json({ user: { id: user.id, email: user.email }, actors: [] });

  const [{ data: actors, error: actorError }, { data: profiles, error: profileError }, { data: listings, error: listingError }] = await Promise.all([
    supabase.from('actors').select('id, kind, display_name, created_at, updated_at').in('id', actorIds),
    supabase.from('actor_profiles').select('actor_id, summary, skills, industries, countries, languages, updated_at').in('actor_id', actorIds),
    supabase.from('listings').select('id, actor_id, intent, category, title, summary, requirements, status, source_conversation_id, created_at, updated_at').in('actor_id', actorIds).order('created_at', { ascending: false }),
  ]);
  const error = actorError ?? profileError ?? listingError;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    actors: (actors ?? []).map((actor) => ({
      ...actor,
      role: memberships?.find((membership) => membership.actor_id === actor.id)?.role ?? 'member',
      profile: profiles?.find((profile) => profile.actor_id === actor.id) ?? null,
      listings: (listings ?? []).filter((listing) => listing.actor_id === actor.id),
    })),
  });
}
