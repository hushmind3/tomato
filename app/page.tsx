'use client';

import { useEffect, useRef, useState } from 'react';
import type { TomatoInterviewResult } from '@/lib/ai/tomato-connection-persona';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Screen = 'home' | 'signup' | 'intro' | 'interview' | 'review' | 'match' | 'connection' | 'partnerChat' | 'contract' | 'escrow';
type InterviewTurn = { role: 'user' | 'assistant'; content: string };
type MatchingSession = { id: string; conversationId: string | null; title: string; turns: InterviewTurn[]; result: TomatoInterviewResult | null };

const labels: Record<Screen, string> = { home: 'tomato', signup: '가입', intro: 'tomato 시작', interview: 'AI 인터뷰', review: '등록 내용 확인', match: '추천 결과', connection: '연결된 상대', partnerChat: '상대방과 채팅', contract: '계약 조건 확인', escrow: 'tomato 안전거래' };
const supabase = createSupabaseBrowserClient();

export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [interviewResult, setInterviewResult] = useState<TomatoInterviewResult | null>(null);
  const [sessions, setSessions] = useState<MatchingSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showMatchApproval, setShowMatchApproval] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [listingRegistered, setListingRegistered] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState<TomatoInterviewResult | null>(null);
  const [registeredListingId, setRegisteredListingId] = useState<string | null>(null);
  const [interviewError, setInterviewError] = useState('');
  const [authError, setAuthError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [conversationsReady, setConversationsReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const go = (next: Screen) => setScreen(next);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    setSidebarOpen(!media.matches);
  }, []);

  useEffect(() => {
    if (screen !== 'interview' && screen !== 'review') return;
    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentSessionId, isInterviewing, screen, showConnection, showMatch, showMatchApproval, turns]);

  useEffect(() => {
    let cancelled = false;
    const restoreConversations = async () => {
      try {
        const response = await fetch('/api/conversations', { cache: 'no-store' }).catch(() => null);
        if (!response || !response.ok || cancelled) return;
        const data = await response.json().catch(() => null);
        if (!data?.conversations || cancelled) return;
        const restored: MatchingSession[] = data.conversations.map((conversation: { id: string; title: string | null; messages?: { role: string; content: string }[] }) => ({
          id: `matching-${conversation.id}`,
          conversationId: conversation.id,
          title: conversation.title || '새 매칭',
          turns: (conversation.messages ?? [])
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
          result: null,
        }));
        setSessions(restored);
        if (restored[0]) {
          setCurrentSessionId((current) => current ?? restored[0].id);
          setTurns(restored[0].turns);
          setInterviewResult(restored[0].result);
          setScreen('interview');
        }
      } finally {
        if (!cancelled) setConversationsReady(true);
      }
    };
    void restoreConversations();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!currentSessionId) return;
    const firstUserMessage = turns.find((turn) => turn.role === 'user')?.content.trim();
    setSessions((previous) => previous.map((session) => session.id === currentSessionId ? {
      ...session,
      title: firstUserMessage ? firstUserMessage.slice(0, 30) : session.title,
      turns,
      result: interviewResult,
    } : session));
  }, [currentSessionId, interviewResult, turns]);

  useEffect(() => {
    if (screen !== 'intro' || sessions.length === 0) return;
    const latest = sessions[0];
    setCurrentSessionId(latest.id);
    setTurns(latest.turns);
    setInterviewResult(latest.result);
    setScreen('interview');
  }, [screen, sessions]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      setScreen('intro');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('authError')) {
      setAuthError('로그인에 실패했습니다. Supabase의 Google·Apple Provider 설정을 확인해주세요.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user && !params.get('auth') && !params.get('authError')) setScreen('intro');
      if (params.get('code')) window.history.replaceState({}, '', window.location.pathname);
    }).finally(() => setAuthReady(true));
  }, []);

  const signInWithProvider = async (provider: 'google' | 'apple') => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(`로그아웃하지 못했습니다: ${error.message}`);
      return;
    }
    // Logging out must not delete or discard saved matching sessions.
    // They remain in Supabase and are restored after the next login.
    setCurrentSessionId(null);
    setTurns([]);
    setInterviewResult(null);
    setShowMatch(false);
    setShowMatchApproval(false);
    setShowConnection(false);
    setListingRegistered(false);
    setRegistrationDraft(null);
    setRegisteredListingId(null);
    setMessage('');
    setInterviewError('');
    window.history.replaceState({}, '', window.location.pathname);
    go('home');
  };

  const createConversation = async (title: string) => {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (!response) {
      setInterviewError('인터뷰를 저장할 서버에 연결하지 못했습니다.');
      return null;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setInterviewError(data?.error ?? '인터뷰 세션을 저장하지 못했습니다.');
      return null;
    }
    return data?.conversation as { id: string } | null;
  };

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    }).catch(() => null);
    if (!response) {
      setInterviewError('인터뷰 내용을 저장할 서버에 연결하지 못했습니다.');
      return false;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setInterviewError(data?.error ?? '인터뷰 내용을 저장하지 못했습니다.');
      return false;
    }
    return true;
  };

  const ensureConversation = async (sessionId: string | null, title: string) => {
    if (!sessionId) return null;
    const existing = sessions.find((session) => session.id === sessionId)?.conversationId;
    if (existing) return existing;
    const conversation = await createConversation(title);
    if (!conversation) return null;
    setSessions((previous) => previous.map((session) => session.id === sessionId ? { ...session, conversationId: conversation.id } : session));
    return conversation.id;
  };

  const startNewMatching = () => {
    const id = `matching-${Date.now()}`;
    setSessions((previous) => [{ id, conversationId: null, title: '새 매칭', turns: [], result: null }, ...previous]);
    setCurrentSessionId(id);
    setMessage('');
    setTurns([]);
    setInterviewResult(null);
    setListingRegistered(false);
    setRegistrationDraft(null);
    setRegisteredListingId(null);
    setInterviewError('');
    setSidebarOpen(!window.matchMedia('(max-width: 700px)').matches);
    go('interview');
  };

  const openSession = (session: MatchingSession) => {
    setCurrentSessionId(session.id);
    setTurns(session.turns);
    setInterviewResult(session.result);
    setShowMatch(false);
    setShowMatchApproval(false);
    setShowConnection(false);
    setListingRegistered(false);
    setRegistrationDraft(null);
    setRegisteredListingId(null);
    setMessage('');
    setInterviewError('');
    if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false);
    go(session.result?.next_action === 'offer_registration' ? 'review' : 'interview');
  };

  const deleteSession = async (session: MatchingSession) => {
    if (!window.confirm('이 매칭 세션을 삭제할까요?')) return;
    if (session.conversationId) {
      const response = await fetch(`/api/conversations/${session.conversationId}`, { method: 'DELETE' }).catch(() => null);
      if (!response?.ok) {
        setInterviewError('세션을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
    }
    setSessions((previous) => previous.filter((item) => item.id !== session.id));
    if (currentSessionId === session.id) {
      setCurrentSessionId(null);
      setTurns([]);
      setInterviewResult(null);
      setMessage('');
      setInterviewError('');
      go('intro');
    }
  };

  const registerListing = async (result = registrationDraft ?? interviewResult) => {
    if (!result || isRegistering || listingRegistered) return;
    setIsRegistering(true);
    setInterviewError('');
    try {
      const response = await fetch(registeredListingId ? `/api/listings/${registeredListingId}` : '/api/listings', {
        method: registeredListingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result.listing_draft, profilePatch: result.profile_patch, sourceConversationId: sessions.find((session) => session.id === currentSessionId)?.conversationId ?? null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '등록하지 못했습니다.');
      if (!registeredListingId && data.listing?.id) setRegisteredListingId(data.listing.id);
      setListingRegistered(true);
      setShowMatchApproval(true);
      go('interview');
    } catch (error) {
      setInterviewError(error instanceof Error ? error.message : '등록하지 못했습니다.');
      go('review');
    } finally {
      setIsRegistering(false);
    }
  };

  const send = async () => {
    const content = message.trim();
    if (!content || isInterviewing || isRegistering) return;

    const nextTurns: InterviewTurn[] = [...turns, { role: 'user', content }];
    const sessionId = currentSessionId;
    setTurns(nextTurns);
    setMessage('');
    setInterviewError('');
    setShowMatchApproval(false);
    setIsInterviewing(true);

    try {
      // Start the AI request immediately while the first conversation row is created.
      // This keeps Supabase persistence from adding a full extra wait to every turn.
      const aiResponsePromise = fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextTurns }),
      });
      const conversationId = await ensureConversation(sessionId, content.slice(0, 80));
      const userSavePromise = conversationId ? saveMessage(conversationId, 'user', content) : Promise.resolve(false);
      const response = await aiResponsePromise;
      const data = await response.json();
      if (!response.ok || !data.result) throw new Error(data.error ?? 'AI 인터뷰를 계속하지 못했습니다.');

      const result = data.result as TomatoInterviewResult;
      setTurns([...nextTurns, { role: 'assistant', content: result.assistant_message }]);
      setInterviewResult(result);
      if (result.next_action === 'offer_registration') {
        setRegistrationDraft(result);
        setListingRegistered(false);
        setShowMatchApproval(false);
      }
      await userSavePromise;
      if (conversationId) {
        await saveMessage(conversationId, 'assistant', result.assistant_message);
        await fetch(`/api/conversations/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 80) }),
        }).catch(() => null);
      }

      if (result.next_action === 'ask') {
        go('interview');
      } else {
        go('interview');
        if (result.next_action === 'register_and_match') await registerListing(result);
      }
    } catch (error) {
      setInterviewError(error instanceof Error ? error.message : 'AI 인터뷰를 계속하지 못했습니다.');
    } finally {
      setIsInterviewing(false);
    }
  };

  if (!authReady || !conversationsReady) {
    return <main className="shell prechat"><section className="workspace"><div className="content"><div className="boot-screen" aria-label="tomato 불러오는 중">tomato</div></div></section></main>;
  }

  return <main className={`shell ${screen === 'home' || screen === 'signup' || screen === 'intro' ? 'prechat' : ''} ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-collapsed'}`}>
    {screen !== 'home' && <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}><div className="side-head"><button className="sidebar-toggle" aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'} onClick={() => setSidebarOpen((open) => !open)}>☰</button>{sidebarOpen && <div className="side-logo">tomato <em>global</em></div>}</div>{sidebarOpen && <><button onClick={startNewMatching} className="new">＋ 새 매칭 시작</button><div className="session-list">{sessions.length === 0 ? <div className="empty-session">새 매칭을 시작하면<br/>여기에 남습니다.</div> : sessions.map((session) => <div key={session.id} className={`session-row ${session.id === currentSessionId ? 'active' : ''}`}><button onClick={() => openSession(session)} className="session"><span>◌</span><span className="session-title">{session.title}</span></button><button className="session-delete" aria-label={`${session.title} 삭제`} onClick={() => void deleteSession(session)}>×</button></div>)}</div><div className="side-spacer"/><button className="side-link">◎ 마이페이지</button><button className="side-link">⚙ 설정</button><button className="side-link" onClick={() => void signOut()}>↪ 로그아웃</button></>}</aside>}
    {screen !== 'home' && sidebarOpen && <button className="sidebar-backdrop" aria-label="사이드바 닫기" onClick={() => setSidebarOpen(false)}/>}
    <section className="workspace"><header className="topbar">{screen !== 'home' && <button className="topbar-toggle" aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'} onClick={() => setSidebarOpen((open) => !open)}>☰</button>}<span>{labels[screen]}</span></header><div className="content">
      {screen === 'home' && <div className="landing"><div className="eyebrow">TOMATO</div><h1>tomato 안에서<br/>필요한 기회를 찾아보세요</h1><p>사람, 팀, 일, 기업, 협업 등을 연결합니다.</p><button className="start-card" onClick={() => go('signup')}><strong>시작하기</strong><span>가입 후 바로 AI 인터뷰를 시작합니다.</span></button></div>}
      {screen === 'signup' && <div className="simple-form"><h2>tomato 시작하기</h2><p>가입 후 바로 AI 인터뷰를 시작합니다.</p><button className="social" onClick={() => void signInWithProvider('google')}>G&nbsp;&nbsp; Google로 계속하기</button><button className="social" onClick={() => void signInWithProvider('apple')}>&nbsp;&nbsp; Apple로 계속하기</button>{authError && <div className="inline-error" role="alert">{authError}</div>}<small>계속하면 tomato의 이용약관과 개인정보처리방침에 동의하게 됩니다.</small></div>}
      {screen === 'intro' && <div className="landing"><h1>원하는 기회와<br/>맞는 상대를 연결합니다</h1><p>AI가 필요한 조건을 파악해<br/>tomato에 등록된 사람·팀·기업과 연결합니다.</p><button className="primary start-button" onClick={startNewMatching}>AI 인터뷰 시작</button></div>}
      {(screen === 'interview' || screen === 'review') && <div className="chat-screen"><div className="messages" aria-live="polite">{turns.map((turn, index) => turn.role === 'user' ? <div className="user-bubble" key={`${turn.role}-${index}`}>{turn.content}</div> : <div className="assistant" key={`${turn.role}-${index}`}>{turn.content}</div>)}{isInterviewing && <div className="assistant pending">조건 파악 중…</div>}{registrationDraft && <ListingDraftCard result={registrationDraft} registering={isRegistering} registered={listingRegistered} hasExisting={Boolean(registeredListingId)} onRegister={() => registerListing()}/>} {showMatchApproval && <MatchApprovalCard onApprove={() => { setShowMatchApproval(false); setShowMatch(true); }}/>} {showMatch && <InlineMatchCard onInterest={() => { setShowMatch(false); setShowConnection(true); }} onReject={() => { setShowMatch(false); setInterviewError('다른 후보를 찾을 수 있도록 조건을 반영했습니다.'); }}/>} {showConnection && <InlineConnectionCard onChat={() => go('partnerChat')} onReject={() => { setShowConnection(false); setInterviewError('다른 후보를 찾을 수 있도록 조건을 반영했습니다.'); }}/>} {interviewError && <div className="inline-error" role="alert">{interviewError}</div>}<div ref={messagesEndRef} className="messages-end"/></div>{screen === 'interview' && turns.length === 0 && <ComposerHints onPick={setMessage}/>}<Composer value={message} onChange={setMessage} onSend={send} placeholder="무엇을 찾고 계세요?" disabled={isInterviewing || isRegistering} focusKey={currentSessionId}/></div>}
      {screen === 'match' && <div className="result-screen"><button className="back" onClick={() => go('review')}>← 인터뷰로 돌아가기</button><div className="status">● tomato 안에서 찾는 중</div><h2>가장 잘 맞는 기회</h2><div className="card"><h3>일본 · 원격 고객지원팀</h3><p>한국어 고객 문의를 돕는 일본 기업입니다. 상대방과 자동 번역 채팅이 가능합니다.</p><Tags/><div className="actions"><button className="primary" onClick={() => go('connection')}>관심 있어요</button><button onClick={() => go('interview')}>별로예요</button></div></div><Composer value={message} onChange={setMessage} onSend={send} placeholder="조건을 바꾸거나 다시 찾아보세요" disabled={isInterviewing || isRegistering}/></div>}
      {screen === 'connection' && <Detail title="연결된 상대" back={() => go('match')}><p>상대방도 관심을 표시했습니다. 지금 접속 중입니다.</p><div className="card"><h3>일본 · 원격 고객지원팀 <span className="tag">접속 중</span></h3><Row a="업무" b="고객 문의 응대"/><Row a="보수" b="월 ¥220,000~280,000"/><div className="actions"><button className="primary" onClick={() => go('partnerChat')}>상대방과 채팅하기</button><button onClick={() => go('contract')}>계약 조건 보기</button></div></div></Detail>}
      {screen === 'partnerChat' && <div className="chat-screen"><div className="conversation-header"><button className="conversation-back" aria-label="AI 인터뷰로 돌아가기" onClick={() => go('interview')}>←</button><div><strong>일본 · 원격 고객지원팀</strong><span>● 접속 중 · 자동 번역 켜짐</span></div><button className="contract-link" onClick={() => go('contract')}>계약 조건</button></div><div className="messages"><div className="assistant"><b>Yuki Tanaka · 일본</b><br/>안녕하세요. 고객지원 업무에 관심이 있으신가요?<small>상대방에게 일본어로 표시됨</small></div><div className="user-bubble">네, 근무 조건을 더 알고 싶어요.</div></div><Composer value={message} onChange={setMessage} onSend={() => setMessage('')} placeholder="상대방에게 메시지 보내기" focusKey="partner-chat"/></div>}
      {screen === 'contract' && <Detail title="계약 조건 확인" back={() => go('partnerChat')}><p>대화 내용을 바탕으로 AI가 초안을 정리했습니다.</p><div className="card"><Row a="업무 범위" b="고객 문의 응대 및 보고"/><Row a="기간" b="2026. 09. 01 ~ 11. 30"/><Row a="보수" b="월 ¥250,000"/><div className="actions"><button className="primary" onClick={() => go('escrow')}>조건 확인하고 서명하기</button><button onClick={() => go('partnerChat')}>대화로 수정하기</button></div></div></Detail>}
      {screen === 'escrow' && <Detail title="tomato 안전거래" back={() => go('contract')}><p>계약금은 먼저 tomato가 보관하고, 작업 완료와 양쪽 확인 후 상대방에게 지급합니다.</p><div className="card"><Row a="보관할 계약금" b="¥250,000"/><Row a="현재 상태" b="결제 전"/><Row a="지급 조건" b="작업 완료 후 확인"/><button className="primary wide" onClick={(e) => { e.currentTarget.textContent = '결제 단계로 이동합니다'; e.currentTarget.disabled = true; }}>계약금 보관하기</button></div></Detail>}
    </div></section></main>;
}

function InlineMatchCard({ onInterest, onReject }: { onInterest: () => void; onReject: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="card inline-match-card"><div className="status">tomato 안에서 찾았어요</div><h3>일본 · 원격 고객지원팀</h3><p>한국어 고객 문의를 돕는 일본 기업입니다. 상대방과 자동 번역 채팅이 가능합니다.</p><Tags/><div className="row"><span>추천 이유</span><b>원격 근무 · 고객응대 경험 · 언어 조건 일치</b></div>{expanded && <div className="match-details"><Row a="업무" b="한국어 고객 문의 응대"/><Row a="보수" b="월 ¥220,000~280,000"/><Row a="연결 방식" b="상호 관심 후 자동 번역 채팅"/><Row a="주체" b="일본 기업"/></div>}<div className="actions"><button className="primary" onClick={onInterest}>관심 있어요</button><button onClick={onReject}>별로예요</button><button onClick={() => setExpanded((value) => !value)}>{expanded ? '간단히 보기' : '자세히 보기'}</button></div></div>;
}

function InlineConnectionCard({ onChat, onReject }: { onChat: () => void; onReject: () => void }) {
  return <div className="card inline-match-card"><div className="status">● 서로 관심이 있어요 · 연결됨</div><h3>일본 · 원격 고객지원팀</h3><p>상대방도 관심을 표시했습니다. 필요한 내용을 대화로 확인해보세요.</p><Tags/><div className="row"><span>대화 언어</span><b>각자 자기 언어로 입력 · 자동 번역</b></div><div className="actions"><button className="primary" onClick={onChat}>상대방과 채팅하기</button><button onClick={onReject}>연결 취소</button></div></div>;
}

function MatchApprovalCard({ onApprove }: { onApprove: () => void }) {
  return <div className="assistant match-approval-message"><p>등록한 조건을 확인했어요. 이 조건으로 매칭해드릴까요?</p><div className="actions"><button className="primary" onClick={onApprove}>이 조건으로 매칭하기</button><span className="correction-hint">아래 입력창에서 먼저 수정할 수도 있어요.</span></div></div>;
}

function ComposerHints({ onPick }: { onPick: (value: string) => void }) {
  const examples = ['자유롭게 일하고 싶어요', '앱 만들어줄 팀을 찾고 있어요', '베트남 유통 파트너가 필요해요'];
  const choose = (example: string) => {
    onPick(example);
    window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder="무엇을 찾고 계세요?"]')?.focus());
  };
  return <div className="composer-hints" aria-label="대화 예시">{examples.map((example) => <button key={example} onClick={() => choose(example)}>{example}</button>)}</div>;
}

function ListingDraftCard({ result, registering, registered, hasExisting, onRegister }: { result: TomatoInterviewResult; registering: boolean; registered: boolean; hasExisting: boolean; onRegister: () => void }) {
  const positiveTags = Object.entries(result.listing_draft.requirements).filter(([key]) => key !== 'exclusions').flatMap(([, value]) => Array.isArray(value) ? value : value ? [value] : []).slice(0, 3);
  const exclusions = Array.isArray(result.listing_draft.requirements.exclusions) ? result.listing_draft.requirements.exclusions.slice(0, 2) : [];
  return <div className="card registration-card"><div className="status">{registered ? '등록됨 · 매칭 대기' : hasExisting ? '수정안' : '이렇게 이해했어요'}</div><h3>{result.listing_draft.title || '새 연결 요청'}</h3><p>{result.listing_draft.summary}</p>{(positiveTags.length > 0 || exclusions.length > 0) && <div className="interpretation-tags">{positiveTags.map((tag, index) => <span className="tag" key={`${tag}-${index}`}>{tag}</span>)}{exclusions.map((tag, index) => <span className="tag negative" key={`exclude-${tag}-${index}`}>피하고 싶어요 · {tag}</span>)}</div>}<div className="actions"><button className={`primary ${registered ? 'registered' : ''}`} disabled={registering || registered} onClick={onRegister}>{registered ? '등록됨 · 매칭 대기' : registering ? '저장하는 중…' : hasExisting ? '수정 저장하기' : '이대로 등록하기'}</button>{!registered && <span className="correction-hint">수정한 뒤 저장하면 매칭 전에 다시 확인합니다.</span>}{registered && <span className="correction-hint">아래 대화로 조건을 계속 수정할 수 있습니다.</span>}</div></div>;
}
function Composer({ value, onChange, onSend, placeholder, disabled = false, focusKey }: { value: string; onChange: (v: string) => void; onSend: () => void | Promise<void>; placeholder: string; disabled?: boolean; focusKey?: string | null }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, focusKey]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [value]);
  return <div className="composer-dock"><div className="composer"><textarea ref={inputRef} autoFocus={!disabled} rows={1} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void onSend(); } }} placeholder={placeholder}/><button aria-label="보내기" disabled={disabled || !value.trim()} onClick={() => void onSend()}>↑</button></div></div>;
}
function Tags() { return <div><span className="tag">기업</span><span className="tag">원격</span><span className="tag">자동 번역</span></div>; }
function Row({ a, b }: { a: string; b: string }) { return <div className="row"><span>{a}</span><b>{b}</b></div>; }
function Detail({ title, back, children }: { title: string; back: () => void; children: React.ReactNode }) { return <div className="detail"><button className="back" onClick={back}>← 돌아가기</button><h2>{title}</h2>{children}</div>; }
