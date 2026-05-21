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
import { deleteFieldState } from '@pmatrix/field-node-runtime';
import { BreachSupport } from '../breach-support';

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

  // Guard: SessionStart double-fire defense (CC v2.1.76 bugfix 대응)
  if (state.sessionStartFired) {
    if (config.debug) {
      process.stderr.write(
        `[P-MATRIX] SessionStart: duplicate fire ignored session=${session_id}\n`
      );
    }
    return;
  }
  state.sessionStartFired = true;

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
    // R-X.3 migration: signal_source + framework flow via AdapterIdentity
    const summaryInput: SessionSummaryInput = {
      sessionId: session_id,
      agentId,
      totalTurns: state.totalTurns,
      dangerEvents: state.dangerEvents,
      credentialBlocks: state.credentialBlocks,
      safetyGateBlocks: state.safetyGateBlocks,
      endReason: end_reason,
      framework_tag: config.frameworkTag ?? 'stable',
    };
    await client.sendSessionSummary(summaryInput).catch(() => {});

    // Breach Taxonomy: emit session_report observation signal
    // Load persisted breach state for accurate counters
    const breachSupport = BreachSupport.loadOrCreate(agentId, session_id);
    const sessionReport = breachSupport.getSessionReport();
    const reportSignal = buildSessionSignal(state, session_id, {
      event_type: 'session_report',
      subject: 'RPT-001',
      report_type: sessionReport.report_type,
      actions_summary: sessionReport.actions_summary,
      session_duration_ms: sessionReport.session_duration_ms,
      priority: 'normal',
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(reportSignal).catch(() => {});
  }

  // Clean up session state + breach state
  BreachSupport.deleteState(session_id);
  deleteState(session_id);
  deleteFieldState(session_id);
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
