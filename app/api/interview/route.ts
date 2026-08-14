import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { TOMATO_CONNECTION_PERSONA, TOMATO_INTERVIEW_SCHEMA, type TomatoInterviewResult } from '@/lib/ai/tomato-connection-persona';

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter((message: unknown): message is { role: 'user' | 'assistant'; content: string } => {
          if (!message || typeof message !== 'object') return false;
          const candidate = message as { role?: unknown; content?: unknown };
          return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string' && candidate.content.trim().length > 0;
        })
        .slice(-24)
        .map((message: { role: 'user' | 'assistant'; content: string }) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }))
    : [];

  if (messages.length === 0 || messages.at(-1)?.role !== 'user') {
    return NextResponse.json({ error: '마지막 사용자 대화가 필요합니다.' }, { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: 'gpt-5.6-luna',
      instructions: TOMATO_CONNECTION_PERSONA,
      input: messages,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low', format: { type: 'json_schema', name: 'tomato_connection_interview', strict: true, schema: TOMATO_INTERVIEW_SCHEMA } },
      max_output_tokens: 1800,
      store: false,
    });

    if (!response.output_text) throw new Error('모델 응답이 비어 있습니다.');
    const result = JSON.parse(response.output_text) as TomatoInterviewResult;
    return NextResponse.json({ result, model: 'gpt-5.6-luna' });
  } catch (error) {
    console.error('tomato interview error', error);
    return NextResponse.json({ error: 'AI 인터뷰 응답을 만들지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
