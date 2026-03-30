// =============================================================================
// @pmatrix/claude-code-monitor — hooks/stop-failure.ts
// StopFailure hook handler — stability signal
//
// CC v2.1.85 신규: Claude Code 정상 종료 실패 시 발화.
// 정상 종료 실패 = 불안정 지표 → STABILITY axis nudge (+0.05)
// PostToolUseFailure와 동일한 패턴 (관측 + stability 시그널)
//
// Hook: StopFailure (CC v2.1.85)
// Observation + stability signal — no blocking capability
// =============================================================================

import {
  PMatrixConfig,
  SignalPayload,
  StopFailureInput,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

// Re-export for index.ts convenience
export type { StopFailureInput } from '../types';

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handleStopFailure(
  event: StopFailureInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  state.stopFailureCount += 1;
  state.dangerEvents += 1;

  if (config.dataSharing) {
    const signal = buildStopFailureSignal(
      state, session_id, config.frameworkTag ?? 'stable',
    );
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] StopFailure: count=${state.stopFailureCount} session=${session_id}\n`
    );
  }

  saveState(state);
}

// ─── Internal ───────────────────────────────────────────────────────────────

function buildStopFailureSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  frameworkTag: 'beta' | 'stable',
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0.5,
    norm: 0.5,
    // STABILITY nudge: stop failure = instability indicator
    stability: 0.05,
    meta_control: 0.5,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      event_type: 'stop_failure',
      session_id: sessionId,
      stop_failure_count: state.stopFailureCount,
      priority: 'normal',
    },
    state_vector: null,
  };
}
