import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, actor_id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (conversations ?? []).map((conversation) => conversation.id);
  if (ids.length === 0) return NextResponse.json({ conversations: [] });

  const { data: messages, error: messageError } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 400 });

  const messagesByConversation = new Map<string, typeof messages>();
  for (const message of messages ?? []) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  return NextResponse.json({ conversations: (conversations ?? []).map((conversation) => ({ ...conversation, messages: messagesByConversation.get(conversation.id) ?? [] })) });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : '새 매칭';
  const requestedActorId = typeof body?.actorId === 'string' ? body.actorId : null;
  let actorId = requestedActorId;

  if (actorId) {
    const { data: membership } = await supabase
      .from('actor_members')
      .select('actor_id')
      .eq('actor_id', actorId)
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: '이 actor를 관리할 권한이 없습니다.' }, { status: 403 });
  } else {
    const { data: membership } = await supabase
      .from('actor_members')
      .select('actor_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle();
    actorId = membership?.actor_id ?? null;
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, actor_id: actorId, title })
    .select('id, actor_id, title, created_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ conversation: { ...conversation, messages: [] } }, { status: 201 });
}
