# Changelog

All notable changes to `@pmatrix/claude-code-monitor` will be documented in this file.

---

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
