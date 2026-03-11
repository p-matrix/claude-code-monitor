// =============================================================================
// @pmatrix/claude-code-monitor — hooks/subagent.ts
// SubagentStart / SubagentStop hook handlers
//
// P2 scope: 서브에이전트 트리 관찰 (차단 불가, command-only 훅)
//
// SubagentStart:
//   - Record subagent spawn in session state
//   - Send DRIFT observation signal (subagent spawning increases complexity)
//
// SubagentStop:
//   - Record completion
//   - Send DRIFT signal with duration metadata
//
// These are command-only hooks (no blocking capability).
// Privacy-first: no subagent content, only structure/timing metadata.
// =============================================================================

import {
  PMatrixConfig,
  SubagentStartInput,
  SubagentStopInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSubagentStart(
  event: SubagentStartInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<void> {
  const { session_id, subagent_session_id } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  // Track subagent spawn count (DRIFT/STABILITY axis)
  state.subagentSpawnCount += 1;

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] SubagentStart: parent=${session_id} child=${subagent_session_id ?? 'unknown'} ` +
      `spawn=${state.subagentSpawnCount}\n`
    );
  }

  if (config.dataSharing) {
    // stability: 0.03 per spawn — subagent complexity nudge (server accumulates)
    // Phase 0 confirmed: server uses signal.stability directly, not event_type calc
    const signal = buildSubagentSignal(state, session_id, 0.03, {
      event_type: 'subagent_start',
      subagent_session_id,
      subagent_spawn_count: state.subagentSpawnCount,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  saveState(state);
}

export async function handleSubagentStop(
  event: SubagentStopInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<void> {
  const { session_id, subagent_session_id, duration_ms, stop_reason } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] SubagentStop: parent=${session_id} child=${subagent_session_id ?? 'unknown'} ` +
      `duration=${duration_ms ?? '?'}ms\n`
    );
  }

  if (config.dataSharing) {
    const signal = buildSubagentSignal(state, session_id, 0, {
      event_type: 'subagent_stop',
      subagent_session_id,
      subagent_spawn_count: state.subagentSpawnCount,
      duration_ms,
      stop_reason,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  saveState(state);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildSubagentSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  stability: number,
  metadata: Record<string, unknown>,
  frameworkTag: 'beta' | 'stable'
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0,
    norm: 0,
    stability,
    meta_control: 0,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      session_id: sessionId,
      priority: 'normal',
      ...metadata,
    },
    state_vector: null,
  };
}
