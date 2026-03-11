// =============================================================================
// @pmatrix/claude-code-monitor — hooks/permission-request.ts
// PermissionRequest hook handler — Kill Switch 2차 경로 (보조) + META_CONTROL 측정
//
// PermissionRequest is a secondary Kill Switch path.
// It fires when Claude presents a permission dialog.
// R(t) ≥ 0.75: deny + interrupt (session abort)
// R(t) < 0.75:  allow
//
// P3 추가: permissionRequestCount 카운터 증가 + META_CONTROL 빈도 신호 전송
// — 권한 요청 빈도는 에이전트 행동의 메타 패턴 지표 (META_CONTROL 축)
//
// ⚠️ NOT a reliable Kill Switch path:
//    - Only fires if Claude Code shows a permission dialog
//    - Claude may respond with text and bypass this hook
//    - PreToolUse deny is the primary (guaranteed) path
// =============================================================================

import {
  PMatrixConfig,
  PermissionRequestInput,
  PermissionRequestOutput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import { loadOrCreateState, saveState, isHaltActive } from '../state-store';

export async function handlePermissionRequest(
  event: PermissionRequestInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<PermissionRequestOutput> {
  const { session_id } = event;

  // ① HALT file check — global Kill Switch, checked before ANY state load
  // ~/.pmatrix/HALT presence → deny + interrupt immediately, no state I/O
  if (isHaltActive()) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'deny',
          message:
            'P-MATRIX Kill Switch HALT active. All tool calls blocked. Remove ~/.pmatrix/HALT to resume.',
          interrupt: true,
        },
      },
    };
  }

  // Safety Gate disabled — allow (META_CONTROL tracking skipped when gate is off)
  if (!config.safetyGate.enabled) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow' },
      },
    };
  }

  const state = loadOrCreateState(session_id, config.agentId);

  // ─── P3: META_CONTROL 빈도 측정 ────────────────────────────────────────────
  state.permissionRequestCount += 1;

  // Fire-and-forget META_CONTROL signal (빈도 관찰 — 차단 경로 지연 최소화)
  if (config.dataSharing) {
    const signal = buildMetaControlSignal(state, session_id, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] PermissionRequest: count=${state.permissionRequestCount} session=${session_id}\n`
    );
  }

  // ─── Kill Switch ───────────────────────────────────────────────────────────
  const shouldHalt =
    state.isHalted || state.currentRt >= config.killSwitch.autoHaltOnRt;

  if (shouldHalt) {
    if (!state.isHalted) {
      state.isHalted = true;
      state.haltReason = `R(t) ${state.currentRt.toFixed(2)} ≥ ${config.killSwitch.autoHaltOnRt}`;
      state.dangerEvents += 1;
    }

    saveState(state);

    if (config.debug) {
      process.stderr.write(
        `[P-MATRIX] PermissionRequest DENIED + interrupt: R(t)=${state.currentRt.toFixed(3)}\n`
      );
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'deny',
          message: `P-MATRIX Kill Switch: R(t) ≥ ${config.killSwitch.autoHaltOnRt} — session halted`,
          interrupt: true,
        },
      },
    };
  }

  // Allow
  saveState(state);

  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'allow',
      },
    },
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildMetaControlSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  frameworkTag: 'beta' | 'stable',
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0,
    norm: 0,
    stability: 0,
    // Small META_CONTROL nudge per permission request — 권한 경계 도달 빈도
    meta_control: 0.02,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      event_type: 'permission_request',
      session_id: sessionId,
      permission_request_count: state.permissionRequestCount,
      priority: 'normal',
    },
    state_vector: null,
  };
}
