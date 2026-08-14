# tomato 실제 서비스 준비

## 필요한 외부 계정

1. Supabase: Auth와 PostgreSQL 데이터베이스
2. OpenAI API: AI 인터뷰 요약과 listing 구조화
3. Google Cloud: Google 로그인 OAuth 설정
4. GitHub: 소스 저장소와 버전 백업

초기 개발은 Supabase와 OpenAI만 있으면 시작할 수 있습니다. 결제, 번역, 신원인증은 첫 listing 매칭 사이클 이후 추가합니다.

## 환경변수

`.env.example`을 `.env.local`로 복사하고 실제 값을 입력합니다.

```bash
cp .env.example .env.local
```

비밀키는 채팅이나 GitHub에 올리지 않습니다. 특히 `OPENAI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용합니다.

## 데이터베이스 적용

Supabase SQL Editor에서 `supabase/migrations/0001_maeum_core.sql`을 실행합니다. 이 migration은 actor, actor_members, actor_profiles, listings, conversations, messages, matches와 RLS 정책을 만듭니다.

## 소스 백업

작업 단위가 끝날 때마다 아래 명령으로 소스 ZIP을 만듭니다.

```bash
bash scripts/backup-source.sh
```

ZIP에는 소스와 SQL만 들어가며 `node_modules`, `.next`, `.env.local`, 비밀키는 제외됩니다.
