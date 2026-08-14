import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const role = body?.role === 'assistant' ? 'assistant' : body?.role === 'user' ? 'user' : null;
  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 8000) : '';
  if (!role || !content) return NextResponse.json({ error: '메시지 역할과 내용이 필요합니다.' }, { status: 400 });

  const { data: conversation } = await supabase.from('conversations').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: '대화 세션을 찾을 수 없습니다.' }, { status: 404 });

  const { data: message, error } = await supabase.from('messages').insert({ conversation_id: id, role, content }).select('id, conversation_id, role, content, created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ message }, { status: 201 });
}
