# Changelog

All notable changes to `@pmatrix/claude-code-monitor` will be documented in this file.

---

## [0.7.0] — 2026-04-27

### Added (Claude Code v2.1.83/89/119 신규 훅 + cross-cutting client 보강)

- **CwdChanged 훅** — 작업 디렉토리 변경 시 발화 (state-store cwd + cwdChangeCount). Reactive env 관리 (direnv 등) 지원.
- **FileChanged 훅** — 파일 변경 이벤트 observer (fileChangeCount).
- **PermissionDenied 훅** — auto mode classifier 거부 시 발화 (permissionDeniedCount). 현재 단순 observer (retry 차단 안 함).
- **PostToolUse / PostToolUseFailure duration_ms 필드** — Claude Code v2.1.119 신규 필드. state-store.toolDurations ring buffer (last 100) 기록. R(t) latency axis 활용은 server-side.
- **Cross-cutting A — Error correlation logging**: HTTP 5xx 응답 body 의 error_id 추출 → stderr 안내 메시지 ("Support 문의 시 Error ID 함께 제공"). server Production Polish A error UX 정합.
- **Cross-cutting B — X-Request-ID 헤더**: outgoing request 마다 crypto.randomUUID() 송출 + response echo 수신. server middleware (commit 533781f) 정합.
- **Cross-cutting C — Burst 429 handling**: HTTP 429 응답 시 Retry-After 우선 + escalating backoff (BURST_RETRY_DELAYS [1000, 5000, 30000]). server burst_rate_limit middleware 정합.

### Tests

- 신규 9 test files (`src/__tests__/`): safety-gate, state-store, credential-scanner, breach-support, client (X-Request-ID + 429 + error_id 검증 포함), config, pre-tool-use, post-tool-use, session. (formatter — utility 미존재로 skip, state-store/config 에 통합).

---

## [0.6.0] — 2026-04-27

### Changed (BREAKING — Mode literal rename)

- **Phase R-5 Mode naming Gen1 → Gen2 names** (server-side parity per Spec §❷):
  `'A+1'` → `'normal'` / `'A+0'` → `'caution'` / `'A-1'` → `'alert'` /
  `'A-2'` → `'critical'` / `'A-0'` → `'halt'`
- **Affected APIs**: `SafetyMode` union type (`src/types.ts`), `rtToMode()`
  return values + Safety Gate matrix mode comparisons (`src/safety-gate.ts`),
  state-store mode field defaults, MCP `status` tool output, scenarios
  shell fixture
- **Migration**: consumers must update mode string comparisons
  (`mode === 'A-0'` → `mode === 'halt'` 등). Server protocol output 도
  Gen2 names 로 통합 (Backend Spec v1.53)

### Fixed (Phase R-6 SDK build hygiene)

- **breach-support.ts**: `getApprovalStatus()` 의 `noUncheckedIndexedAccess`
  TypeScript narrowing 부재 → `Object is possibly 'undefined'` 3건 fix
  (explicit local const + null check pattern)
- **field-node-runtime dependency**: `node_modules/@pmatrix/field-node-runtime`
  symlink 정합 (`npm install` 로 npm registry 0.2.0 정상 fetch)

---

## [0.4.1] — 2026-03-23

### Fixed

- **setup.ts** — `pmatrix-cc setup` 시 CC v2.1.76+ 신규 훅 5종이 `~/.claude/settings.json`에 미등록되던 갭 수정
  - `ElicitationResult` — gate hook (timeout 5s, credential scan)
  - `Elicitation` — MCP elicitation 요청 관찰
  - `PostCompact` — context compact 이벤트 관찰
  - `WorktreeCreate` / `WorktreeRemove` — worktree 생명주기 관찰
- 핸들러 코드는 v0.4.0에서 이미 완전 구현됨; 이 패치는 `buildHookConfig()` 등록 누락만 수정
- setup 출력 메시지에 신규 훅 4줄 추가

---

## [0.4.0] — 2026-03-15

### Added

- **4.0 Field Integration** — FieldNode + IPC poller + degraded SV (neutral 0.5 axes)
- `pmatrix_field_status` MCP tool (connected, peerCount, myPosture, fieldId)
- **ElicitationResult hook** — MCP elicitation credential 게이트
- **Observation hooks** — Elicitation, PostCompact, WorktreeCreate, WorktreeRemove
- SessionStart 이중발화 방어 (CC v2.1.76 대응)
- SIGTERM/SIGINT graceful shutdown (FieldNode.stop)

### Changed

- `@pmatrix/field-node-runtime@^0.2.0` 의존성 추가
- state-store: sessionStartFired, elicitationCount, compactCount 필드 추가

## [0.3.1] — 2026-03-13

### Fixed

- Credential scanner 16 patterns sync
- framework_tag config-driven

## [0.3.0] — 2026-03-11

### Added

- **9 hook handlers** (PreToolUse, PermissionRequest, SessionStart/End, PostToolUseFailure, SubagentStart/Stop, UserPromptSubmit, InstructionsLoaded)
- **MCP server** (`pmatrix-cc mcp`) with 3 tools: `pmatrix_status`, `pmatrix_grade`, `pmatrix_halt`
- **Skills** 3 slash commands: `/pmatrix-status`, `/pmatrix-grade`, `/pmatrix-halt`
- **Setup CLI** (`pmatrix-cc setup`) — auto-installs hooks + MCP + skills
- **Kill Switch** — `~/.pmatrix/HALT` file-based global halt
- **Safety Gate** — 3-tier tool risk classification (HIGH/MEDIUM/LOW)
- **Credential Scanner** — 16 pattern types, blocks before submission
- Plugin structure (`.claude-plugin/plugin.json`)

### Security

- Privacy-first: LLM prompts/responses never transmitted
- Credential scanning runs entirely on-device
- Data sharing is opt-in (numerical metadata only)
