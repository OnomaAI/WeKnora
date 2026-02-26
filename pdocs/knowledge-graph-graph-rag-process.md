# WeKnora Knowledge Graph / Graph RAG 로직 분석

## 0. 범위와 결론

이 문서는 현재 코드 기준으로 다음을 추적해 정리한 결과다.

1. 그래프 생성/적재(인덱싱) 경로
2. 채팅 RAG에서 그래프 검색이 수행되는 경로
3. Agent 툴 `query_knowledge_graph`의 실제 동작
4. 삭제/재처리 시 그래프 데이터 수명주기

핵심 결론:

- 채팅 `rag_stream`의 Graph RAG는 `질의 엔티티 추출 -> Neo4j 1-hop 매칭 -> 연결 chunk 확장` 방식이다.
- Agent 툴 `query_knowledge_graph`는 이름과 달리 현재 Neo4j `SearchNode`를 쓰지 않고 `HybridSearch(벡터+키워드)`를 사용한다.
- `internal/application/service/graph.go`의 `GraphBuilder`는 구현은 있으나 현재 런타임 메인 경로에 연결되어 있지 않다.

---

## 1. 주요 컴포넌트

- 그래프 저장소 인터페이스: `internal/types/interfaces/retriever_graph.go:10`
  - `AddGraph`, `DelGraph`, `SearchNode`
- Neo4j 구현체: `internal/application/repository/retriever/neo4j/repository.go:20`
- 그래프 설정 스키마: `internal/types/knowledgebase.go:257`
  - `ExtractConfig{Enabled, Text, Tags, Nodes, Relations}`
- 그래프 설정 검증: `internal/handler/knowledgebase.go:680`
  - `Enabled=true`일 때 text/tags/nodes/relations 유효성 강제
- Neo4j 클라이언트 초기화/게이트: `internal/container/container.go:609`
  - `NEO4J_ENABLE != true`면 드라이버를 만들지 않음

---

## 2. 그래프 생성/적재(인덱싱) 프로세스

### 2.1 문서 처리 중 그래프 추출 작업 enqueue

- 문서 chunk 처리 완료 후, KB의 `ExtractConfig.Enabled=true`이면 chunk별 그래프 추출 작업 생성:
  - `internal/application/service/knowledge.go:1390`
  - `NewChunkExtractTask(...)`
- enqueue 자체도 `NEO4J_ENABLE=true`일 때만 수행:
  - `internal/application/service/extract.go:80`

### 2.2 비동기 작업 라우팅

- Asynq task 라우팅:
  - `internal/router/task.go:74`
  - `chunk:extract` -> `ChunkExtractService.Handle`

### 2.3 ChunkExtractService에서 LLM 추출 -> Neo4j 적재

- 핸들러 진입: `internal/application/service/extract.go:169`
- 동작 순서:
  1. chunk, knowledge base 로드
  2. KB의 `ExtractConfig(Text/Tags/Nodes/Relations)`로 prompt template 구성
  3. `extractor.Extract(chunk.Content)`로 그래프(JSON) 추출
  4. 추출 node마다 `Chunks=[chunk.ID]` 부여
  5. `AddGraph(namespace={KnowledgeBase, Knowledge}, graph)` 호출
- 적재 호출 지점:
  - `internal/application/service/extract.go:226`

### 2.4 Neo4j 적재 방식

- 노드 upsert + chunk union:
  - `internal/application/repository/retriever/neo4j/repository.go:60`
- 관계 upsert:
  - `internal/application/repository/retriever/neo4j/repository.go:89`
- 레이블 스코프:
  - `NameSpace.Labels()`가 KB/Knowledge ID를 레이블로 사용 (`internal/types/extract_graph.go:165`)
  - 실제 레이블은 `ENTITY` prefix + `-`를 `_`로 치환

---

## 3. 채팅 Graph RAG 검색 프로세스 (`rag_stream`)

### 3.1 파이프라인 진입

- 세션에서 KB/Knowledge가 선택된 경우 `rag_stream` 사용:
  - `internal/application/service/session.go:663`
- `rag_stream` 이벤트 순서:
  - `REWRITE_QUERY -> CHUNK_SEARCH_PARALLEL -> CHUNK_RERANK ...`
  - `internal/types/chat_manage.go:173`

### 3.2 REWRITE_QUERY 단계: 질의 엔티티 추출

- 플러그인: `PluginExtractEntity.OnEvent`
  - `internal/application/service/chat_pipline/extract_entity.go:58`
- 동작:
  1. `NEO4J_ENABLE`이 false면 즉시 skip (`:61`)
  2. 현재 요청의 KB/Knowledge 범위를 수집
  3. 그중 `ExtractConfig.Enabled=true`인 KB만 선별 (`:111`)
  4. `chatManage.EntityKBIDs`, `chatManage.EntityKnowledge` 저장
  5. LLM으로 질의에서 엔티티 추출 후 `chatManage.Entity`에 저장

### 3.3 CHUNK_SEARCH_PARALLEL 단계: 일반 검색 + 그래프 검색 병렬 실행

- 플러그인: `PluginSearchParallel.OnEvent`
  - `internal/application/service/chat_pipline/search_parallel.go:89`
- 동작:
  1. 일반 청크 검색(`PluginSearch`)과 엔티티 그래프 검색(`PluginSearchEntity`)을 goroutine으로 병렬 실행
  2. 결과를 합쳐 dedup

### 3.4 ENTITY_SEARCH 단계: Neo4j 검색

- 플러그인: `PluginSearchEntity.OnEvent`
  - `internal/application/service/chat_pipline/search_entity.go:41`
- 검색 스코프:
  - 특정 문서 지정 시: `NameSpace{KnowledgeBase, Knowledge}`로 문서 단위 검색 (`:74`)
  - 아니면: `NameSpace{KnowledgeBase}`로 KB 전체 검색 (`:105`)
- Neo4j 조회:
  - `graphRepo.SearchNode(ctx, namespace, entityTerms)`
- 결과 처리:
  1. 여러 KB/문서 결과 노드/관계를 합침
  2. 그래프 노드에 연결된 chunk ID를 추출
  3. 일반 검색 결과에서 이미 본 chunk는 제외 (`filterSeenChunk`, `:184`)
  4. 새 chunk를 DB에서 조회 후 `SearchResult`로 변환
  5. 이때 `Score=1.0`, `MatchType=MatchTypeGraph` 부여 (`chunk2SearchResult`, `:217`)

### 3.5 Neo4j 실제 매칭 쿼리

- 구현: `internal/application/repository/retriever/neo4j/repository.go:164`
- 핵심 쿼리:
  - `MATCH (n:Label)-[r]-(m:Label)`
  - `WHERE ANY(nodeText IN $nodes WHERE n.name CONTAINS nodeText)`
  - `RETURN n, r, m`
- 의미:
  - 질의 엔티티 문자열이 `n.name`에 포함되면, 해당 노드와 1-hop 이웃(`m`) 및 관계(`r`)를 함께 가져온다.

---

## 4. Graph 결과가 최종 응답으로 가는 경로

- `CHUNK_SEARCH_PARALLEL` 이후에는 일반 검색 결과와 동일하게 후속 단계 처리:
  - `CHUNK_RERANK` (`internal/application/service/chat_pipline/rerank.go:31`)
  - `CHUNK_MERGE`, `FILTER_TOP_K`, `INTO_CHAT_MESSAGE` ...
- 즉 Graph RAG 결과도 최종적으로는 "추가된 chunk 근거"로 사용된다.

---

## 5. Agent 툴 `query_knowledge_graph`의 실제 동작

- 엔트리: `internal/agent/tools/query_knowledge_graph.go:78`
- 처리 흐름:
  1. KB별로 `ExtractConfig` 존재 여부 확인 (`:144`)
  2. 실제 조회는 `knowledgeService.HybridSearch(...)` 호출 (`:152`)
  3. 결과를 chunk 기준 dedup/정렬 후 포맷팅
- 중요 포인트:
  - Neo4j `SearchNode`를 호출하지 않는다.
  - 반환 `graph_data`도 chunk 노드만 만들고 edge는 비어 있다 (`:366` 이후).
  - 코드에 `"完整的图查询语言（Cypher）支持开发中"` 문구가 있어, Cypher 기반 정식 그래프 질의는 아직 미구현 상태임을 명시한다 (`:338`).

---

## 6. 그래프 데이터 수명주기(삭제/재처리)

### 6.1 재처리 시 기존 그래프 정리

- `processChunks` 시작 시 기존 그래프 먼저 삭제:
  - `internal/application/service/knowledge.go:1098`

### 6.2 문서/KB 삭제 시 그래프 정리

- 단건 문서 삭제: `internal/application/service/knowledge.go:815`
- 문서 일괄 삭제: `internal/application/service/knowledge.go:927`
- 수동 문서 정리 경로: `internal/application/service/knowledge.go:6449`
- KB 삭제 비동기 작업에서도 문서 namespace 모아 `DelGraph` 호출:
  - `internal/application/service/knowledgebase.go:476`

---

## 7. 현재 구현 상태 요약

1. 채팅 Graph RAG는 동작 경로가 명확히 존재하며, Neo4j 기반 엔티티-관계 확장 검색을 수행한다.
2. Agent `query_knowledge_graph`는 "그래프 친화적 UI/설명"을 제공하지만 실제 retrieval 엔진은 현재 HybridSearch다.
3. `internal/application/service/graph.go`의 `GraphBuilder` 계열 로직은 구현돼 있으나 현재 주요 경로에서 호출되지 않는다.
4. 기능 활성화의 실제 관문은 `NEO4J_ENABLE` + KB의 `ExtractConfig.Enabled`이다.

