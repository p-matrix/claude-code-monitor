// =============================================================================
// @pmatrix/claude-code-monitor — hooks/cwd-changed.ts
// CwdChanged hook handler — observation only (no blocking) [CC v2.1.83]
//
// Working directory 변경 발화 시 호출. state-store 의 lastCwd 갱신 +
// cwdChangeCount 카운터 증가. R(t) breach 판정 없음 (telemetry 전용).
//
// Privacy-first: cwd path forwarded to server, no file content access.
// =============================================================================

import {
  PMatrixConfig,
  CwdChangedInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

export async function handleCwdChanged(
  event: CwdChangedInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.cwdChangeCount += 1;
  if (event.cwd) state.lastCwd = event.cwd;

  if (config.dataSharing) {
    const signal = buildCwdChangedSignal(state, session_id, event, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] CwdChanged: count=${state.cwdChangeCount} session=${session_id} cwd=${event.cwd ?? 'N/A'}\n`
    );
  }

  saveState(state);
}

function buildCwdChangedSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  event: CwdChangedInput,
  frameworkTag: 'beta' | 'stable',
): SignalPayload {
  return {
    agent_id: state.agentId,
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
      event_type: 'cwd_changed',
      session_id: sessionId,
      old_cwd: event.old_cwd,
      new_cwd: event.cwd,
      cwd_change_count: state.cwdChangeCount,
      priority: 'normal',
    },
    state_vector: null,
  };
}
