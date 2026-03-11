// =============================================================================
// @pmatrix/claude-code-monitor — hooks/post-tool-use-failure.ts
// PostToolUseFailure hook handler — observation only (no blocking)
//
// P2 scope: 도구 실패 패턴 관찰 + DRIFT 축 신호 전송
//
// PostToolUseFailure fires AFTER a tool has already failed.
// No gate decision is possible — this is observation-only.
// Signals are sent to the server to update the DRIFT axis.
//
// Privacy-first: only tool_name and failure metadata (no tool output content)
// =============================================================================

import {
  PMatrixConfig,
  PostToolUseFailureInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handlePostToolUseFailure(
  event: PostToolUseFailureInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<void> {
  const { session_id, tool_name } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  state.dangerEvents += 1;

  // Build DRIFT observation signal
  // Note: tool failure nudges STABILITY upward (more failures = less stable)
  const signal = buildFailureSignal(state, session_id, tool_name, config.frameworkTag ?? 'stable');

  // Fire-and-forget — observation only, no response needed
  if (config.dataSharing) {
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] PostToolUseFailure: tool=${tool_name} session=${session_id}\n`
    );
  }

  saveState(state);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildFailureSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  toolName: string,
  frameworkTag: 'beta' | 'stable'
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0,
    norm: 0,
    // Small STABILITY nudge per failure — server accumulates over session
    stability: 0.05,
    meta_control: 0,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      event_type: 'tool_failure',
      session_id: sessionId,
      tool_name: toolName,
      priority: 'normal',
    },
    state_vector: null,
  };
}
