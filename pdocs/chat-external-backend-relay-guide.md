# 채팅 외부 Backend Relay 적용 가이드 (Frontend 무변경)

## 1) 목표와 전제
- 목표: 프론트엔드 UI/코드 동작은 유지하고, 채팅 생성 로직만 현재 app 내부 로직 대신 외부 backend로 위임.
- 전제: 프론트가 호출하는 API 경로/응답 포맷은 그대로 유지.
- 핵심: thinking/reasoning UI를 유지하려면 SSE 이벤트 스키마를 현재 프론트 파서와 호환되게 맞춰야 함.

## 2) 현재 계약(변경 금지 포인트)
아래는 프론트가 이미 기대하는 계약이다. 이 계약을 유지하면 프론트 수정 없이 동작한다.

- 스트림 호출/요청 바디 구성 참고: `frontend/src/api/chat/streame.ts:31`, `frontend/src/api/chat/streame.ts:73`, `frontend/src/api/chat/streame.ts:80`, `frontend/src/api/chat/streame.ts:113`
- 프론트가 소비하는 SSE 이벤트 파서 참고: `frontend/src/views/chat/index.vue:375`, `frontend/src/views/chat/index.vue:431`, `frontend/src/views/chat/index.vue:495`, `frontend/src/views/chat/index.vue:546`
- 라우트 경로 참고: `internal/router/router.go:265`, `internal/router/router.go:281`
  - `POST /api/v1/knowledge-chat/:session_id`
  - `POST /api/v1/agent-chat/:session_id`
  - `GET /api/v1/sessions/continue-stream/:session_id?message_id=...`
  - `POST /api/v1/sessions/:session_id/stop`

## 3) 권장 아키텍처
권장안은 **App을 Chat Relay(BFF)로 사용**하는 방식이다.

- 프론트는 기존대로 WeKnora app에만 요청.
- app이 외부 backend로 채팅 요청/스트림을 프록시.
- app이 외부 SSE를 현재 내부 `StreamEvent`로 변환하여 `streamManager`에 적재.
- app이 기존 방식대로 SSE를 프론트에 전달.

이 방식의 장점:
- 프론트 무수정.
- `continue-stream`(재연결 복원) 기능 유지 가능.
- 인증/JWT/tenant 헤더 처리와 감사 로깅을 app에서 통제 가능.

## 4) 수정해야 할 파일(핵심)

### A. 설정/환경
1. `internal/config/config.go:18`
- `Config`에 외부 채팅 백엔드 설정 섹션 추가.
- 예: `ExternalChat`(enabled/base_url/timeout/paths/api_key 등).

2. `config/config.yaml`
- 외부 채팅 relay 설정 섹션 추가.
- 예: `external_chat.enabled`, `external_chat.base_url`, endpoint path, timeout.

3. `.env.example:36`
- 외부 채팅 관련 env 샘플 추가.
- 예: `EXTERNAL_CHAT_ENABLED`, `EXTERNAL_CHAT_BASE_URL`, `EXTERNAL_CHAT_API_KEY`, `EXTERNAL_CHAT_TIMEOUT_SEC`.

4. `docker-compose.yml:50`
- `app` 서비스 environment에 위 env 전달.

### B. 외부 backend 클라이언트 추가
5. 신규 파일 추가(권장)
- `internal/types/interfaces/external_chat_client.go`
- `internal/integration/external_chat/client.go`
- 역할: 외부 backend로 POST/SSE 연결, stop API 호출, 에러/timeout 처리.

6. `internal/container/container.go:90`
- 외부 채팅 클라이언트 DI 등록(`Provide`) 추가.

### C. Session Handler에 Relay 주입
7. `internal/handler/session/handler.go:16`
- `Handler` struct에 외부 채팅 클라이언트 의존성 필드 추가.
- `NewHandler(...)` 시그니처와 할당 로직 수정.

### D. 채팅 실행 경로 변경(가장 중요)
8. `internal/handler/session/qa.go:375`
- `executeNormalModeQA`에서 내부 `sessionService.KnowledgeQA(...)` 호출 전/대신 외부 relay 분기 추가.
- 권장 처리:
  - 기존처럼 `createUserMessage`, `createAssistantMessage`, `setupSSEStream`은 유지.
  - 외부 SSE 수신 이벤트를 `streamManager.AppendEvent(...)`로 적재.
  - 답변 누적하여 `assistantMessage.Content`/`KnowledgeReferences` 업데이트.
  - 완료 시 `completeAssistantMessage(...)` + `complete` 이벤트 보장.

9. `internal/handler/session/qa.go:474`
- `executeAgentModeQA`도 동일하게 외부 relay 분기 추가.
- agent 전용 이벤트(thinking/tool_call/tool_result/answer/references/complete) 매핑 필요.

10. `internal/handler/session/helpers.go:40`
- 필요 시 외부 이벤트 -> 내부 `StreamEvent` 변환 헬퍼 추가.
- `buildStreamResponse` 계약(`id`, `response_type`, `data`, `knowledge_references`)은 유지.

### E. 재연결/중단 동작 유지
11. `internal/handler/session/stream.go:31`
- `ContinueStream`은 현재 구조 유지 가능.
- 전제: 외부에서 받은 이벤트를 반드시 `streamManager`에 적재해야 함.

12. `internal/handler/session/stream.go:191`
- `StopSession`에서 외부 backend cancel API 호출 추가.
- 성공/실패와 무관하게 로컬 `stop` 이벤트 적재는 유지(프론트 즉시 반영 목적).

## 5) thinking/reasoning UI를 위한 SSE 통신 스펙

`frontend/src/views/chat/index.vue` 기준으로 다음 필드를 맞춰야 UI가 정상 동작한다.

### 공통 envelope
```json
{
  "id": "<request_id>",
  "response_type": "agent_query|thinking|tool_call|tool_result|answer|references|session_title|complete|error|stop",
  "content": "...",
  "done": false,
  "data": {},
  "session_id": "...",
  "assistant_message_id": "...",
  "knowledge_references": []
}
```

### 이벤트별 필수 필드
1. `agent_query`
- 필요: `assistant_message_id` (top-level), 또는 `data.assistant_message_id`.
- 용도: 프론트 stop 요청 시 message_id로 사용.

2. `thinking` (Agent 모드 reasoning UI)
- 필요: `data.event_id` (같은 thinking 스트림의 chunk를 묶는 key).
- 권장 완료 chunk: `done=true`, `data.duration_ms`, `data.completed_at`.

3. `tool_call`
- 필요: `data.tool_call_id`, `data.tool_name`, `data.arguments`.

4. `tool_result` / `error`
- 필요: `data.tool_call_id`, `data.tool_name`, `data.success`, `data.output`/`data.error`.
- 권장: `data.duration_ms`, `data.display_type`, `data` 내 툴 렌더링 payload.

5. `references`
- 둘 중 하나 제공:
  - `data.references`
  - `knowledge_references`

6. `answer`
- 스트리밍 chunk 형태로 전송 가능.
- 완료 시 `done=true`를 반드시 한번 보장.

7. `complete`
- 최종 종료 신호. 프론트가 로딩 종료에 사용.

8. `session_title`
- 필요: `data.session_id`, `data.title` (또는 `content=title`).

9. `stop`
- 권장: `data.reason` (`user_requested`).

## 6) Non-Agent와 Agent의 reasoning 표현 차이(중요)

- Non-Agent 모드: 프론트는 `<think>...</think>` 태그를 `answer` 본문에서 파싱한다.
  - 참고: `frontend/src/views/chat/index.vue:515`
  - 따라서 외부 backend가 non-agent reasoning을 별도 `thinking` 이벤트로만 보내면 현재 UI에서 안 보일 수 있음.
  - 해결: non-agent에서는 `answer` content에 `<think>` 태그 포함 포맷으로 맞춰 송신.

- Agent 모드: 프론트는 `response_type==='thinking'` 이벤트를 별도로 타임라인 렌더링.
  - 참고: `frontend/src/views/chat/index.vue:581`

## 7) 이벤트/ID 매핑 규칙 권장
- 프론트의 메시지 매칭 키는 `data.id`(`request_id`) 중심.
- app은 외부 이벤트의 id와 무관하게, 프론트로 보낼 때 로컬 `request_id`를 유지하는 것이 안전.
- 로컬 `assistant_message_id`는 app DB의 메시지 ID를 기준으로 유지하고, 필요 시 외부 요청에 전달해 상호 매핑.

## 8) 구현 순서 권장
1. 설정/환경 추가 (`config`, `.env.example`, `docker-compose.yml`).
2. 외부 채팅 클라이언트 및 DI 등록.
3. `qa.go`에 relay 분기 추가(knowledge/agent 모두).
4. 이벤트 매핑/적재(`streamManager.AppendEvent`) 구현.
5. `stop` 외부 연동 추가.
6. `continue-stream` 재연결 검증.

## 9) 검증 체크리스트
- agent on/off 각각에서 첫 질문이 정상 응답되는가.
- thinking UI가 non-agent(`<think>`) / agent(`thinking` 이벤트) 모두 정상인가.
- tool call/result 카드가 깨지지 않는가.
- references 표시가 되는가.
- 새로고침 후 `continue-stream`으로 이어받기가 되는가.
- stop 누르면 생성이 즉시 멈추고 UI가 정리되는가.
- session title 이벤트가 늦게 와도 메뉴 제목이 반영되는가.
