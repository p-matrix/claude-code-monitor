// =============================================================================
// @pmatrix/claude-code-monitor — hooks/permission-denied.ts
// PermissionDenied hook handler — observation only (no blocking) [CC v2.1.119]
//
// Auto-mode classifier 가 도구 호출을 거부했을 때 발화.
// 단순 observer — model retry 차단 안함 ({retry: false} 응답 X).
// permissionDeniedCount 카운터 + telemetry signal.
// =============================================================================

import {
  PMatrixConfig,
  PermissionDeniedInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

export async function handlePermissionDenied(
  event: PermissionDeniedInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.permissionDeniedCount += 1;

  if (config.dataSharing) {
    const signal = buildPermissionDeniedSignal(state, session_id, event, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] PermissionDenied: count=${state.permissionDeniedCount} session=${session_id} tool=${event.tool_name ?? 'N/A'}\n`
    );
  }

  saveState(state);
}

function buildPermissionDeniedSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  event: PermissionDeniedInput,
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
      event_type: 'permission_denied',
      session_id: sessionId,
      tool_name: event.tool_name,
      reason: event.reason,
      permission_denied_count: state.permissionDeniedCount,
      priority: 'normal',
    },
    state_vector: null,
  };
}
