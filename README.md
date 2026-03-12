# @pmatrix/claude-code-monitor

Runtime safety governance for Claude Code — **active intervention, not just logging.**

Blocks dangerous tool calls before execution, detects credential leaks in user prompts, and continuously measures agent risk with live Trust Grade (A–E).

> Requires a P-MATRIX account and API key.

---

## What it does

### Core Protection

- **Safety Gate** — Intercepts high-risk tool calls before execution.
  Blocks based on current risk level R(t). No confirmation step — Claude Code hooks support allow/deny only.
- **Credential Protection** — Detects and blocks 11 types of API keys
  and secrets before they reach the agent.
- **Kill Switch** — Automatically halts the agent when R(t) ≥ 0.75.
  Manually via `/pmatrix-halt`. Creates `~/.pmatrix/HALT` to block all sessions.

### Behavioral Intelligence

- **Tool Failure Tracking** — Records each tool failure and applies
  a stability nudge (+0.05 per failure) to reflect degrading behavior.
- **Subagent Spawn Tracking** — Tracks subagent lifecycle and applies
  a stability nudge (+0.03 per spawn) for complexity risk.
- **Live Grade** — Streams 4-axis safety signals and displays Trust
  Grade (A–E) in real time.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 18 |
| Claude Code CLI | latest |
| P-MATRIX server | v1.0.0+ |

---

## Installation

```bash
npm install -g @pmatrix/claude-code-monitor
pmatrix-cc setup --api-key <YOUR_API_KEY>
```

That's it. Every Claude Code session in this environment is now monitored.

---

### Privacy

**Content-Agnostic:** P-MATRIX never collects, parses, or stores
your LLM prompts or responses.

When data sharing is enabled, we only transmit numerical metadata —
tool names, timing, axis deltas, and safety events. Your agent's
prompt and response content stays local.

- **PreToolUse** — sends `tool_name` only (never `tool_input`)
- **UserPromptSubmit** — credential scanning runs locally; only detection counts are sent (never prompt content)
- **PostToolUseFailure** — sends `tool_name` and failure metadata only (never tool output)
- **Subagent hooks** — sends spawn counts and timing only (never subagent content)

Pattern-based instant blocks (sudo, rm -rf, curl|sh) and credential
scanning run entirely on-device with no network dependency.

---

### Advanced Configuration

For full control, edit `~/.pmatrix/config.json` (created by the setup command):

```json
{
  "serverUrl": "https://api.pmatrix.io",
  "agentId": "cc_YOUR_AGENT_ID",
  "apiKey": "pm_live_xxxxxxxxxxxx",

  "safetyGate": {
    "enabled": true,
    "serverTimeoutMs": 2500,
    "customToolRisk": {}
  },

  "credentialProtection": {
    "enabled": true,
    "customPatterns": []
  },

  "killSwitch": {
    "autoHaltOnRt": 0.75
  },

  "dataSharing": false,

  "batch": {
    "maxSize": 10,
    "flushIntervalMs": 2000,
    "retryMax": 3
  },

  "debug": false
}
```

Or set your API key as an environment variable:

```bash
export PMATRIX_API_KEY=pm_live_xxxxxxxxxxxx
```

---

## MCP Tools

| Command | Description |
|---------|-------------|
| `/pmatrix-status` | Show current Grade, R(t), and mode |
| `/pmatrix-grade` | Show behavioral grade and recent history |
| `/pmatrix-halt` | Manually trigger Kill Switch (creates `~/.pmatrix/HALT`) |

> To resume from halt: `rm ~/.pmatrix/HALT`

---

## Safety Gate

The Safety Gate intercepts tool calls before execution and evaluates them against the current risk level R(t):

| Risk Level | Mode | HIGH-risk tool | MEDIUM-risk tool | LOW-risk tool |
|-----------|------|---------------|-----------------|--------------|
| < 0.15 | Normal | Allow | Allow | Allow |
| 0.15–0.30 | Caution | **Block** | Allow | Allow |
| 0.30–0.50 | Alert | **Block** | Allow | Allow |
| 0.50–0.75 | Critical | **Block** | **Block** | Allow |
| >= 0.75 | Halt | **Block** | **Block** | **Block** |

> Claude Code hooks support allow/deny only — no confirmation step (unlike OpenClaw's CONFIRM action).

**HIGH-risk tools** (auto-classified): `Bash`, `Write`, `Edit`, `MultiEdit`, `apply_patch`, `computer`, `terminal`, `code_interpreter`

**MEDIUM-risk tools**: `WebFetch`, `WebSearch`, `Task` (subagent), network tools

**LOW-risk tools** (prefix match): `Read`, `Glob`, `Grep`, `TodoRead`, `TodoWrite`, `pmatrix_*`

> Unknown tools default to **MEDIUM** risk as a conservative baseline.
> Use `safetyGate.customToolRisk` to override.

**Instant block rules** (regardless of R(t)):
- `sudo` / `chmod 777` — privilege escalation (META_CONTROL -0.25)
- `rm -rf /` — destructive deletion (META_CONTROL -0.30)
- `curl ... | sh` — remote code execution (META_CONTROL -0.20)

> **Note:** Instant block rules (sudo, rm -rf, curl|sh) are enforced
> independently of the Safety Gate setting. Even with
> `safetyGate.enabled: false`, these rules remain active.

---

## Credential Protection

Detects and blocks 11 credential types before they are sent:

- OpenAI API keys (`sk-proj-...`)
- Anthropic API keys (`sk-ant-...`)
- AWS Access Keys (`AKIA...`)
- GitHub tokens (`ghp_...`, `github_pat_...`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- Database URLs (`postgresql://user:pass@...`)
- Passwords (`password: "..."`)
- Bearer tokens
- Google AI keys (`AIza...`)
- Stripe keys (`sk_live_...`, `sk_test_...`)

Code blocks in messages are excluded from scanning to prevent false positives.

When a credential is detected, the `UserPromptSubmit` hook exits with code 2 (fail-closed) and the prompt is blocked before submission.

---

## Tool Failure Tracking

`PostToolUseFailure` hook records each tool failure and sends a stability nudge (+0.05 per failure) to the server.

Repeated failures shift the agent toward higher risk — this reflects degrading behavior without blocking (observation-only hook).

---

## Subagent Spawn Tracking

`SubagentStart` / `SubagentStop` hooks track subagent lifecycle:

- Each spawn sends a stability nudge (+0.03) to the server
- Spawn count is recorded in session state
- Excessive spawning increases complexity risk via the STABILITY axis

---

## R(t) Formula

```
R(t) = 1 - (BASELINE + NORM + STABILITY + META_CONTROL) / 4
```

| Axis | Field | Meaning |
|------|-------|---------|
| BASELINE | `baseline` | Initial config integrity — higher = safer |
| NORM | `norm` | Behavioral normalcy — higher = safer |
| STABILITY | `stability` | Trajectory stability — lower = more drift |
| META_CONTROL | `meta_control` | Self-control capacity — higher = safer |

P-Score = `round(100 * (1 - R(t)), 2)`
Trust Grade: A (>=80) · B (>=60) · C (>=40) · D (>=20) · E (<20)

---

## Server-side Setup

The monitor sends signals to `POST /v1/inspect/stream` on your P-MATRIX server.

Production server: `https://api.pmatrix.io`

Dashboard: `https://app.pmatrix.io`

- **Story tab** — R(t) trajectory timeline, mode transitions, tool block events
- **Analytics tab** — Grade history, stability trends, cost signals
- **Logs tab** — Live session events, audit trail, META_CONTROL incidents

---

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `serverUrl` | string | — | P-MATRIX server URL |
| `agentId` | string | — | Agent ID from P-MATRIX dashboard |
| `apiKey` | string | — | API key (`pm_live_...`). Use env var. |
| `safetyGate.enabled` | boolean | `true` | Enable Safety Gate |
| `safetyGate.serverTimeoutMs` | number | `2500` | Server query timeout (fail-open) |
| `safetyGate.customToolRisk` | object | `{}` | Override tool risk tier |
| `credentialProtection.enabled` | boolean | `true` | Enable credential scanning |
| `credentialProtection.customPatterns` | string[] | `[]` | Additional regex patterns |
| `killSwitch.autoHaltOnRt` | number | `0.75` | Auto-halt R(t) threshold |
| `dataSharing` | boolean | `false` | Send safety signals to P-MATRIX server (opt-in). When false, instant block rules and credential scanning still work fully locally. R(t)-based Safety Gate decisions use the last known server value (or 0.0 if never connected). Prompts and responses are never transmitted regardless of this setting. |
| `batch.maxSize` | number | `10` | Buffer flush threshold |
| `batch.flushIntervalMs` | number | `2000` | Periodic flush interval (ms) |
| `batch.retryMax` | number | `3` | Send retry count |
| `debug` | boolean | `false` | Verbose logging |

---

## Offline / Server-Down Behavior

- **No cache (initial)**: R(t) = 0.0 (fail-open, no blocking before first connection)
- **Cache exists + server down**: Last known R(t) is kept — Safety Gate continues using it
- **Server timeout (> 2,500 ms)**: Fail-open — tool call is allowed
- **`~/.pmatrix/HALT` exists**: All tools blocked regardless of server state

Credential scanning and instant block rules always work offline — they have no server dependency.

---

## License

Apache-2.0 © 2026 P-MATRIX
