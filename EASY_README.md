# EASY README (2026-02-19)

이 문서는 이번 장애 원인/수정 사항과, **완전히 처음부터 WeKnora를 다시 올리는 표준 명령 순서**를 정리한 빠른 가이드입니다.

---

## 1) 이번 장애의 핵심 원인

### A. `APK_MIRROR_ARG`로 인한 빌드 실패
- 증상: `apt-get update` 시 TLS 인증서 오류, 패키지 설치 실패.
- 원인: `APK_MIRROR_ARG=mirrors.tencent.com` 환경에서 인증 체인이 맞지 않아 실패.
- 조치: `.env`에서 `APK_MIRROR_ARG=`(빈 값)으로 변경.

### B. MinIO 미기동으로 `app` 컨테이너 panic
- 증상: `failed to check bucket ... lookup minio ... server misbehaving`
- 원인: `STORAGE_TYPE=minio`인데 `start_all.sh` 기본 경로는 `minio` 프로필 컨테이너를 자동으로 올리지 않음.
- 조치: `docker compose --profile minio up -d minio`를 선행 실행.

### C. Neo4j 연결 방식 불일치
- 증상: `lookup neo4j ... server misbehaving`
- 원인: `.env`에 `NEO4J_URI`가 있어도 compose가 `bolt://neo4j:7687` 하드코딩으로 덮어씀.
- 조치: `docker-compose.yml`의 app 환경변수를 다음처럼 수정:
  - `NEO4J_URI=${NEO4J_URI:-bolt://neo4j:7687}`

### D. Redis 인증 실패 (`WRONGPASS`)
- 증상: `WRONGPASS invalid username-password pair or user is disabled`
- 원인: Redis 컨테이너는 `requirepass` 방식인데 `.env`에 `REDIS_USERNAME`이 채워져 ACL 인증으로 붙으려다 실패.
- 조치: `.env`에서 `REDIS_USERNAME=`(빈 값)으로 변경.

---

## 2) neo4j / minio / redis 관련 실제 수정 사항

### Neo4j
1. `docker-compose.yml`에서 app의 Neo4j URI를 `.env` 우선으로 변경
   - `NEO4J_URI=${NEO4J_URI:-bolt://neo4j:7687}`
2. `docker-compose.yml`에서 neo4j 포트를 환경변수 기반으로 변경
   - `${NEO4J_HTTP_PORT:-7474}:7474`
   - `${NEO4J_BOLT_PORT:-7687}:7687`
3. `.env`에 포트 변수 추가
   - `NEO4J_HTTP_PORT=17474`
   - `NEO4J_BOLT_PORT=17687`

### MinIO
1. `.env`에서 `STORAGE_TYPE=minio` 사용 중이므로
2. 실행 순서에서 `minio` 프로필 컨테이너를 반드시 먼저 기동하도록 정리
   - `docker compose --profile minio up -d minio`

### Redis
1. `.env`에서 `REDIS_USERNAME=`(빈 값)으로 변경
2. `REDIS_PASSWORD` 기반 `requirepass` 인증만 사용하도록 맞춤

---

## 3) 완전 재시작 표준 절차 (처음부터 다시 실행)

> 아래는 **현재 실행 중인 모든 Docker 컨테이너를 종료**한 뒤 WeKnora를 올리는 순서입니다.

### Step 0. 프로젝트 폴더 이동
```bash
cd /home/saponin/WeKnora
```

### Step 1. 현재 실행 중인 모든 Docker 컨테이너 중지
```bash
docker ps -q | xargs -r docker stop
```

### Step 2. WeKnora 리소스 정리(컨테이너/네트워크)
```bash
docker compose --profile minio --profile neo4j down --remove-orphans
```

### Step 3. 저장소 타입이 MinIO이므로 MinIO 먼저 기동
```bash
docker compose --profile minio up -d minio
```

### Step 4. WeKnora 핵심 서비스 기동
```bash
docker compose up -d postgres redis docreader app frontend

# frontend(web ui) port 변경
FRONTEND_PORT=[PORT] docker compose up -d --no-deps --force-recreate frontend
```

### Step 5. 상태 확인
```bash
docker compose ps
```

### Step 6. 문제 발생 시 로그 확인
```bash
docker compose logs -f app docreader postgres minio redis
```

### Step 7. 특정 서비스만 재시작
- 설정을 바꾸고 특정 서비스를 재시작해야 할 때, docker-compose.yml 파일에서 해당 서비스를 다시 시작
- 서비스들이 named volume을 사용하기 때문에 volume 이름을 바꾸거나 docker compose down만 하지 않으면, 컨테이터 volume data는 보존된다.
```bash
[env] docker compose up -d --build [service-name]
```

---

## 4) 현재 .env 기준 접속 주소
- Web UI: `http://localhost:8319`
- API: `http://localhost:8218`
- Docreader(gRPC): `localhost:50051`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

---

## 5) 참고
- `start_all.sh --docker`는 현재 구성(`STORAGE_TYPE=minio`)에서 `minio` 프로필을 자동으로 띄우지 않아 재장애 가능성이 있습니다.
- 따라서 현재 환경에서는 위의 `docker compose ...` 순서를 권장합니다.
