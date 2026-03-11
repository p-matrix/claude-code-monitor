// =============================================================================
// @pmatrix/claude-code-monitor — mcp/tools/status.ts
// pmatrix_status MCP tool
//
// Shows current P-MATRIX safety status for the active session:
//   Grade / R(t) / Mode / 4-axis values / session counters
//
// Data sources:
//   1. Local state file (~/.pmatrix/sessions/{session_id}.json)  — counters
//   2. Server GET /v1/agents/{id}/public                          — live grade
//   3. ~/.pmatrix/HALT file                                       — halt status
// =============================================================================

import { PMatrixConfig } from '../../types';
import { PMatrixHttpClient } from '../../client';
import {
  findActiveSession,
  loadState,
  isHaltActive,
  PersistedSessionState,
} from '../../state-store';
import { rtToMode } from '../../safety-gate';

interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export async function handleStatusTool(
  args: Record<string, unknown>,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<McpToolResult> {
  // Validate prerequisites
  if (!config.agentId) {
    return err('P-MATRIX not configured. Run: pmatrix-cc setup --agent-id <id>');
  }

  // Resolve session: use provided session_id or find most recent active session
  const sessionId =
    typeof args['session_id'] === 'string' ? args['session_id'] : null;

  const state: PersistedSessionState | null = sessionId
    ? loadState(sessionId)
    : findActiveSession();

  // HALT file check
  const haltActive = isHaltActive();

  // Fetch live grade from server (best-effort — fail gracefully)
  let serverGrade: string | null = null;
  let serverRt: number | null = null;
  let serverMode: string | null = null;
  let serverAxes: { baseline: number; norm: number; stability: number; meta_control: number } | null = null;

  try {
    const gradeRes = await client.getAgentGrade(config.agentId);
    serverGrade = gradeRes.grade;
    serverRt = gradeRes.risk;
    serverMode = gradeRes.mode;
    serverAxes = gradeRes.axes;
  } catch {
    // server unavailable — use local state values
  }

  // Build output
  const lines: string[] = [];

  lines.push('─── P-MATRIX Status ──────────────────────');

  if (haltActive) {
    lines.push('⛔ HALT ACTIVE — all tool calls blocked');
    lines.push('   Resume: rm ~/.pmatrix/HALT');
    lines.push('');
  }

  // Grade / R(t) / Mode (server takes precedence over local cache)
  const displayGrade = serverGrade ?? state?.grade ?? '?';
  const displayRt = serverRt ?? state?.currentRt ?? 0;
  const displayMode = serverMode ?? state?.currentMode ?? rtToMode(displayRt);
  const modeLabel = modeDescription(displayMode as string);

  lines.push(`Grade  : ${displayGrade}`);
  lines.push(`R(t)   : ${displayRt.toFixed(3)}`);
  lines.push(`Mode   : ${displayMode}  ${modeLabel}`);

  if (serverAxes) {
    lines.push('');
    lines.push('4-Axis :');
    lines.push(`  BASELINE     ${serverAxes.baseline.toFixed(3)}`);
    lines.push(`  NORM         ${serverAxes.norm.toFixed(3)}`);
    lines.push(`  STABILITY    ${serverAxes.stability.toFixed(3)}`);
    lines.push(`  META_CONTROL ${serverAxes.meta_control.toFixed(3)}`);
  }

  if (state) {
    lines.push('');
    lines.push('Session :');
    lines.push(`  Prompt turns      ${state.totalTurns}`);
    lines.push(`  Safety gate blks  ${state.safetyGateBlocks}`);
    lines.push(`  Credential blks   ${state.credentialBlocks}`);
    lines.push(`  Danger events     ${state.dangerEvents}`);
    lines.push(`  Permission reqs   ${state.permissionRequestCount}`);
    lines.push(`  Subagent spawns   ${state.subagentSpawnCount}`);
    lines.push(`  Session ID        ${state.sessionId}`);
    lines.push(`  Started           ${state.startedAt}`);
  } else {
    lines.push('');
    lines.push('No active session found.');
    lines.push('Run Claude Code with pmatrix-cc hooks installed to start monitoring.');
  }

  lines.push('');
  lines.push(`Dashboard : https://app.pmatrix.io`);
  if (config.agentId) {
    lines.push(`Agent     : ${config.agentId}`);
  }
  lines.push('─────────────────────────────────────────');

  return ok(lines.join('\n'));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeDescription(mode: string): string {
  const map: Record<string, string> = {
    'A+1': '(Normal)',
    'A+0': '(Caution)',
    'A-1': '(Alert)',
    'A-2': '(Critical)',
    'A-0': '(Halt)',
  };
  return map[mode] ?? '';
}

function ok(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): McpToolResult {
  return { content: [{ type: 'text', text: `⚠️ ${text}` }], isError: true };
}
