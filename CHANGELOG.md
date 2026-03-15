# Changelog

All notable changes to `@pmatrix/claude-code-monitor` will be documented in this file.

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
