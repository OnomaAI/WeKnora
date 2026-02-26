# WeKnora 외부 백엔드 API 명세서 (한국어)

[API 문서 목차로 돌아가기](./README.md)

## 1. 문서 목적

이 문서는 WeKnora 프론트엔드(`frontend/src`)의 현재 기능을 **그대로 유지**한 채, 앱 기능을 외부 백엔드 API 서버로 이전하기 위한 계약(Contract) 명세입니다.  
정리 기준은 프론트엔드에서 실제 호출하는 API 경로(`frontend/src/api/*`, `frontend/src/views/chat/index.vue`)입니다.

- 기준일: 2026-02-25
- 기준 버전: 현재 리포지토리 `main` 작업 트리
- 기본 Prefix: `/api/v1`

## 2. 공통 규약

### 2.1 Base URL

- 개발(비도커): `http://localhost:8080/api/v1`
- 운영: `https://{your-api-host}/api/v1`

### 2.2 인증/헤더

- 인증: `Authorization: Bearer <access_token>`
- 권장 추적 헤더: `X-Request-ID: <random-id>`
- 교차 테넌트 조회 시: `X-Tenant-ID: <tenant-id>`
- JSON 요청: `Content-Type: application/json`
- 파일 업로드: `Content-Type: multipart/form-data`

### 2.3 공통 응답 형식

성공:

```json
{
  "success": true,
  "data": {}
}
```

실패:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지",
    "details": "상세 정보"
  }
}
```

참고: 일부 엔드포인트는 `message`, `total`, `items` 등 보조 필드를 추가로 반환합니다.

토큰 갱신 응답은 프런트 호환을 위해 아래 형태를 권장합니다.

```json
{
  "success": true,
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token"
}
```

## 3. 스트리밍(SSE) 규약

### 3.1 SSE 엔드포인트

- `POST /knowledge-chat/:session_id`
- `POST /agent-chat/:session_id`
- `GET /sessions/continue-stream/:session_id?message_id=<assistant_message_id>`

### 3.2 SSE 이벤트 포맷

```text
event: message
data: {"id":"...","response_type":"answer","content":"...","done":false}
```

프론트엔드가 처리하는 주요 `response_type`:

- `agent_query`
- `session_title`
- `thinking`
- `tool_call`
- `tool_result`
- `references`
- `answer`
- `reflection`
- `error`
- `complete`

`agent-chat` 요청 Body(프론트 기준):

```json
{
  "query": "질문 텍스트",
  "knowledge_base_ids": ["kb-id-1"],
  "knowledge_ids": ["knowledge-id-1"],
  "agent_enabled": true,
  "agent_id": "agent-id",
  "web_search_enabled": true,
  "summary_model_id": "model-id",
  "mcp_service_ids": ["mcp-1"],
  "mentioned_items": [
    { "id": "kb-id-1", "name": "KB 이름", "type": "kb", "kb_type": "document" }
  ]
}
```

## 4. API 목록 (기능별)

### 4.1 인증(Auth)

| Method | Path | 설명 |
|---|---|---|
| POST | `/auth/login` | 로그인 |
| POST | `/auth/register` | 회원가입 |
| GET | `/auth/me` | 현재 사용자/테넌트 정보 |
| GET | `/auth/tenant` | 현재 테넌트 정보 |
| POST | `/auth/refresh` | 토큰 갱신 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/validate` | 토큰 유효성 확인 |

### 4.2 테넌트/공통 설정

| Method | Path | 설명 |
|---|---|---|
| GET | `/tenants/all` | 전체 테넌트 목록(관리 권한) |
| GET | `/tenants/search` | 테넌트 검색(`keyword`, `tenant_id`, `page`, `page_size`) |
| GET | `/tenants/kv/agent-config` | 에이전트 기본 설정 조회 |
| PUT | `/tenants/kv/agent-config` | 에이전트 기본 설정 저장 |
| GET | `/tenants/kv/conversation-config` | 대화 기본 설정 조회 |
| PUT | `/tenants/kv/conversation-config` | 대화 기본 설정 저장 |
| GET | `/tenants/kv/prompt-templates` | 프롬프트 템플릿 조회 |
| GET | `/tenants/kv/web-search-config` | 웹검색 설정 조회 |
| PUT | `/tenants/kv/web-search-config` | 웹검색 설정 저장 |

### 4.3 시스템/모델

| Method | Path | 설명 |
|---|---|---|
| GET | `/system/info` | 시스템 정보 |
| GET | `/system/minio/buckets` | MinIO 버킷 목록 |
| POST | `/models` | 모델 생성 |
| GET | `/models` | 모델 목록 |
| GET | `/models/:id` | 모델 상세 |
| PUT | `/models/:id` | 모델 수정 |
| DELETE | `/models/:id` | 모델 삭제 |
| GET | `/models/providers` | 모델 Provider 목록(`model_type` 지원) |

### 4.4 초기화/모델 연결 점검

| Method | Path | 설명 |
|---|---|---|
| PUT | `/initialization/config/:kbId` | KB 모델/분할 설정 저장(현재 주 사용) |
| GET | `/initialization/config/:kbId` | KB 초기화 설정 조회 |
| POST | `/initialization/initialize/:kbId` | KB 초기화(레거시 호환) |
| GET | `/initialization/ollama/status` | Ollama 상태 |
| GET | `/initialization/ollama/models` | Ollama 모델 목록 |
| POST | `/initialization/ollama/models/check` | Ollama 모델 설치 여부 확인 |
| POST | `/initialization/ollama/models/download` | Ollama 모델 다운로드 시작 |
| GET | `/initialization/ollama/download/progress/:taskId` | 다운로드 진행률 |
| GET | `/initialization/ollama/download/tasks` | 다운로드 작업 목록 |
| POST | `/initialization/remote/check` | 원격 LLM 연결 확인 |
| POST | `/initialization/embedding/test` | 임베딩 모델 테스트 |
| POST | `/initialization/rerank/check` | 리랭크 모델 테스트 |
| POST | `/initialization/multimodal/test` | 멀티모달 테스트(파일 업로드) |
| POST | `/initialization/extract/text-relation` | 텍스트 관계 추출 |
| POST | `/initialization/extract/fabri-text` | 샘플 텍스트 생성 |
| POST | `/initialization/extract/fabri-tag` | 태그 생성 |

### 4.5 지식베이스/지식/태그/FAQ/청크

### 4.5.1 지식베이스

| Method | Path | 설명 |
|---|---|---|
| GET | `/knowledge-bases` | KB 목록 (`agent_id` 쿼리 지원) |
| POST | `/knowledge-bases` | KB 생성 |
| GET | `/knowledge-bases/:id` | KB 상세 (`agent_id` 쿼리 지원) |
| PUT | `/knowledge-bases/:id` | KB 수정 |
| DELETE | `/knowledge-bases/:id` | KB 삭제 |
| POST | `/knowledge-bases/copy` | KB 복사 |

### 4.5.2 지식 파일/문서

| Method | Path | 설명 |
|---|---|---|
| POST | `/knowledge-bases/:kbId/knowledge/file` | 파일 업로드 |
| POST | `/knowledge-bases/:kbId/knowledge/url` | URL로 지식 생성 |
| POST | `/knowledge-bases/:kbId/knowledge/manual` | 수동 지식 생성 |
| GET | `/knowledge-bases/:kbId/knowledge` | 지식 목록(`page`,`page_size`,`tag_id`,`keyword`,`file_type`) |
| GET | `/knowledge/:id` | 지식 상세 (`agent_id` 지원) |
| PUT | `/knowledge/manual/:id` | 수동 지식 수정 |
| DELETE | `/knowledge/:id` | 지식 삭제 |
| GET | `/knowledge/:id/download` | 지식 원문 다운로드 |
| GET | `/knowledge/batch` | 다건 지식 조회 (`ids`, `kb_id`, `agent_id`) |
| GET | `/knowledge/search` | 전역 지식 검색 (`keyword`,`offset`,`limit`,`file_types`,`agent_id`) |

### 4.5.3 청크

| Method | Path | 설명 |
|---|---|---|
| GET | `/chunks/:id` | 지식별 청크 목록 (`page`,`page_size`) |
| GET | `/chunks/by-id/:chunkId` | 청크 단건 조회 |
| DELETE | `/chunks/by-id/:chunkId/questions` | 생성 질문 1건 삭제 (`question_id` Body 전달) |

### 4.5.4 태그

| Method | Path | 설명 |
|---|---|---|
| GET | `/knowledge-bases/:kbId/tags` | 태그 목록 |
| POST | `/knowledge-bases/:kbId/tags` | 태그 생성 |
| PUT | `/knowledge-bases/:kbId/tags/:tagId` | 태그 수정 |
| DELETE | `/knowledge-bases/:kbId/tags/:tagSeqId` | 태그 삭제 (`force=true` 지원) |
| PUT | `/knowledge/tags` | 지식-태그 일괄 변경 |
| PUT | `/knowledge-bases/:kbId/faq/entries/tags` | FAQ-태그 일괄 변경 |

### 4.5.5 FAQ

| Method | Path | 설명 |
|---|---|---|
| GET | `/knowledge-bases/:kbId/faq/entries` | FAQ 목록 |
| POST | `/knowledge-bases/:kbId/faq/entries` | FAQ 일괄 업서트(`append`,`replace`) |
| POST | `/knowledge-bases/:kbId/faq/entry` | FAQ 1건 생성 |
| PUT | `/knowledge-bases/:kbId/faq/entries/:entryId` | FAQ 수정 |
| PUT | `/knowledge-bases/:kbId/faq/entries/fields` | FAQ 필드 일괄 수정 |
| DELETE | `/knowledge-bases/:kbId/faq/entries` | FAQ 다건 삭제 (`ids` Body 전달) |
| POST | `/knowledge-bases/:kbId/faq/search` | FAQ 검색 |
| GET | `/knowledge-bases/:kbId/faq/entries/export` | FAQ CSV Export |
| GET | `/faq/import/progress/:taskId` | FAQ Import 진행률 |
| PUT | `/knowledge-bases/:kbId/faq/import/last-result/display` | FAQ Import 결과 표시 상태 저장 |

### 4.6 세션/메시지/채팅

| Method | Path | 설명 |
|---|---|---|
| POST | `/sessions` | 세션 생성 |
| GET | `/sessions` | 세션 목록 (`page`,`page_size`) |
| GET | `/sessions/:session_id` | 세션 상세 |
| DELETE | `/sessions/:session_id` | 세션 삭제 |
| POST | `/sessions/:session_id/generate_title` | 세션 제목 생성 |
| POST | `/sessions/:session_id/stop` | 생성 중지 (`message_id`) |
| GET | `/messages/:session_id/load` | 메시지 페이징 (`limit`,`before_time`) |
| POST | `/knowledge-chat/:session_id` | 일반 지식 질의 (SSE) |
| POST | `/agent-chat/:session_id` | 에이전트 질의 (SSE) |
| GET | `/sessions/continue-stream/:session_id` | 미완료 응답 스트림 재개 (SSE) |

### 4.7 에이전트/스킬/MCP/웹검색

### 4.7.1 에이전트

| Method | Path | 설명 |
|---|---|---|
| GET | `/agents` | 에이전트 목록(내장+커스텀) |
| GET | `/agents/:id` | 에이전트 상세 |
| POST | `/agents` | 에이전트 생성 |
| PUT | `/agents/:id` | 에이전트 수정 |
| DELETE | `/agents/:id` | 에이전트 삭제 |
| POST | `/agents/:id/copy` | 에이전트 복제 |
| GET | `/agents/placeholders` | 프롬프트 플레이스홀더 |

### 4.7.2 스킬/MCP/웹검색

| Method | Path | 설명 |
|---|---|---|
| GET | `/skills` | 스킬 목록 |
| GET | `/web-search/providers` | 웹검색 Provider 목록 |
| GET | `/mcp-services` | MCP 서비스 목록 |
| GET | `/mcp-services/:id` | MCP 서비스 상세 |
| POST | `/mcp-services` | MCP 서비스 생성 |
| PUT | `/mcp-services/:id` | MCP 서비스 수정 |
| DELETE | `/mcp-services/:id` | MCP 서비스 삭제 |
| POST | `/mcp-services/:id/test` | MCP 연결 테스트 |
| GET | `/mcp-services/:id/tools` | MCP Tool 목록 |
| GET | `/mcp-services/:id/resources` | MCP Resource 목록 |

### 4.8 공유 공간(Organizations) 및 공유 리소스

### 4.8.1 조직/멤버/가입

| Method | Path | 설명 |
|---|---|---|
| POST | `/organizations` | 조직 생성 |
| GET | `/organizations` | 내 조직 목록 |
| GET | `/organizations/:id` | 조직 상세 |
| PUT | `/organizations/:id` | 조직 수정 |
| DELETE | `/organizations/:id` | 조직 삭제 |
| POST | `/organizations/join` | 초대코드 가입 |
| POST | `/organizations/join-request` | 가입 요청 제출 |
| GET | `/organizations/preview/:inviteCode` | 초대코드 미리보기 |
| GET | `/organizations/search` | 공개 조직 검색 (`q`,`limit`) |
| POST | `/organizations/join-by-id` | 조직 ID로 가입 |
| POST | `/organizations/:id/leave` | 조직 탈퇴 |
| POST | `/organizations/:id/request-upgrade` | 권한 상향 요청 |
| POST | `/organizations/:id/invite-code` | 초대코드 재발급 |
| GET | `/organizations/:orgId/members` | 멤버 목록 |
| PUT | `/organizations/:orgId/members/:userId` | 멤버 권한 변경 |
| DELETE | `/organizations/:orgId/members/:userId` | 멤버 제거 |
| GET | `/organizations/:orgId/join-requests` | 가입 요청 목록 |
| PUT | `/organizations/:orgId/join-requests/:requestId/review` | 가입 요청 승인/거절 |
| GET | `/organizations/:orgId/search-users` | 초대 대상 사용자 검색 |
| POST | `/organizations/:orgId/invite` | 사용자 직접 초대 |

### 4.8.2 지식베이스 공유

| Method | Path | 설명 |
|---|---|---|
| POST | `/knowledge-bases/:kbId/shares` | KB 공유 생성 |
| GET | `/knowledge-bases/:kbId/shares` | KB 공유 목록 |
| PUT | `/knowledge-bases/:kbId/shares/:shareId` | KB 공유 권한 변경 |
| DELETE | `/knowledge-bases/:kbId/shares/:shareId` | KB 공유 해제 |
| GET | `/shared-knowledge-bases` | 나에게 공유된 KB 목록 |
| GET | `/organizations/:orgId/shared-knowledge-bases` | 조직 기준 공유 KB 목록 |
| GET | `/organizations/:orgId/shares` | 조직의 KB 공유 목록 |

### 4.8.3 에이전트 공유

| Method | Path | 설명 |
|---|---|---|
| POST | `/agents/:agentId/shares` | 에이전트 공유 생성 |
| GET | `/agents/:agentId/shares` | 에이전트 공유 목록 |
| PUT | `/agents/:agentId/shares/:shareId` | 에이전트 공유 권한 변경 |
| DELETE | `/agents/:agentId/shares/:shareId` | 에이전트 공유 해제 |
| GET | `/shared-agents` | 나에게 공유된 에이전트 목록 |
| GET | `/organizations/:orgId/shared-agents` | 조직 기준 공유 에이전트 목록 |
| POST | `/shared-agents/disabled` | 공유 에이전트 개인 숨김 설정 |
| GET | `/organizations/:orgId/agent-shares` | 조직 에이전트 공유 목록 |

### 4.9 프런트 호출 대비 필수 호환 엔드포인트(중요)

아래 항목은 프런트엔드 코드에 이미 호출 로직이 있으므로, 외부 백엔드에서 반드시 지원해야 합니다.

| Method | Path | 필요 이유 |
|---|---|---|
| GET | `/auth/tenant` | 프런트 `getCurrentTenant()` 호환 유지 |
| PUT | `/agents/:agentId/shares/:shareId` | 공유 에이전트 권한 수정 기능 호환 유지 |

## 5. 외부 백엔드 구현 시 필수 호환 포인트

1. `DELETE` 요청 Body 지원  
`axios.delete(url, { data })`를 사용하므로 다음 API는 Body 파싱이 필요합니다.
- `DELETE /chunks/by-id/:chunkId/questions` (`question_id`)
- `DELETE /knowledge-bases/:kbId/faq/entries` (`ids`)

2. SSE 이벤트 순서/부분 토큰 출력 유지  
프론트는 `answer`를 토큰 단위로 이어붙여 렌더링하므로, 순서 역전/버퍼링 지연이 크면 UX가 깨집니다.

3. `continue-stream` 제공  
새로고침 후 미완료 메시지 재개 기능이 이 엔드포인트에 의존합니다.

4. 교차 테넌트 헤더 처리  
`X-Tenant-ID`가 들어오면 권한 검증 후 해당 테넌트 컨텍스트로 조회해야 합니다.

5. 파일 다운로드 형식  
`/knowledge/:id/download`, `/faq/entries/export`는 `blob` 다운로드로 사용됩니다.

6. 응답 Envelope 일관성  
가능하면 `success/data/message/error` 형식을 유지해야 프론트 수정이 최소화됩니다.

7. 업로드/다운로드 콘텐츠 타입 준수  
- 업로드: `multipart/form-data`
- 다운로드: `application/octet-stream` 또는 `text/csv` + `Content-Disposition` 헤더 권장

8. SSE 연결 특성 유지  
- 긴 응답에서도 연결을 끊지 않도록 read timeout 확보
- 프록시/게이트웨이 버퍼링 비활성화(Nginx `proxy_buffering off` 등)

## 6. 권장 운영 항목

- OpenAPI(`swagger.yaml`/`swagger.json`)를 이 문서와 동기화
- SSE/업로드 API는 타임아웃 및 프록시 버퍼링 설정 명시
- 에러 코드 표준화(권한/검증/리소스 없음/서버 오류)
- 요청 단위 추적을 위한 `X-Request-ID` 로그 연계
