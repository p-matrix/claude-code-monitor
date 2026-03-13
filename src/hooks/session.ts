// =============================================================================
// @pmatrix/claude-code-monitor — hooks/session.ts
// SessionStart / SessionEnd lifecycle handlers
//
// SessionStart:
//   - Create/restore session state
//   - Send session_start signal (fire-and-forget)
//   - Cleanup stale session files
//   - No stdout output required (command hook, no gate decision)
//
// SessionEnd:
//   - Send session_summary signal
//   - Delete session state file
// =============================================================================

import {
  PMatrixConfig,
  SessionStartInput,
  SessionEndInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient, SessionSummaryInput } from '../client';
import {
  loadOrCreateState,
  saveState,
  deleteState,
  cleanupStaleStates,
  PersistedSessionState,
} from '../state-store';

// ─── SessionStart ─────────────────────────────────────────────────────────────

export async function handleSessionStart(
  event: SessionStartInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<void> {
  const { session_id } = event;
  const agentId = config.agentId;

  // Cleanup stale sessions opportunistically (non-blocking)
  cleanupStaleStates();

  // Load or create session state
  const state = loadOrCreateState(session_id, agentId);

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] SessionStart: session=${session_id} agent=${agentId}\n`
    );
  }

  // Send session_start signal (fire-and-forget)
  if (config.dataSharing) {
    const signal = buildSessionSignal(state, session_id, {
      event_type: 'session_start',
      priority: 'normal',
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  // Retry unsent backlog from previous sessions (60s throttle, fail-open)
  client.resubmitUnsent().catch(() => {});

  saveState(state);
}

// ─── SessionEnd ───────────────────────────────────────────────────────────────

export async function handleSessionEnd(
  event: SessionEndInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<void> {
  const { session_id, end_reason } = event;
  const agentId = config.agentId;

  const state = loadOrCreateState(session_id, agentId);

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] SessionEnd: session=${session_id} turns=${state.totalTurns} ` +
      `grade=${state.grade ?? 'N/A'} halted=${state.isHalted}\n`
    );
  }

  // Send session summary (dataSharing required — §11)
  if (config.dataSharing) {
    const summaryInput: SessionSummaryInput = {
      sessionId: session_id,
      agentId,
      totalTurns: state.totalTurns,
      dangerEvents: state.dangerEvents,
      credentialBlocks: state.credentialBlocks,
      safetyGateBlocks: state.safetyGateBlocks,
      endReason: end_reason,
      signal_source: 'claude_code_hook',
      framework: 'claude_code',
      framework_tag: config.frameworkTag ?? 'stable',
    };
    await client.sendSessionSummary(summaryInput).catch(() => {});
  }

  // Clean up session state
  deleteState(session_id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSessionSignal(
  state: PersistedSessionState,
  sessionId: string,
  metadata: Record<string, unknown>,
  frameworkTag: 'beta' | 'stable'
): SignalPayload {
  return {
    agent_id: state.agentId,
    // Neutral signal (0.5) — avoids all-zero → R(t)=0.75 HALT on server
    baseline: 0.5,
    norm: 0.5,
    stability: 0.5,
    meta_control: 0.5,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      session_id: sessionId,
      ...metadata,
    },
    state_vector: null,
  };
}
