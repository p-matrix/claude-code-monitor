// =============================================================================
// @pmatrix/claude-code-monitor — hooks/instructions-loaded.ts
// InstructionsLoaded hook handler — 관찰 전용 (observation only)
//
// P4 scope: CLAUDE.md 로드 사실 관찰 (내용 접근 불가)
//
// Claude Code 특성:
//   - 비동기 전용: 차단 불가, Claude Code 실행과 독립적으로 발화
//   - 매처 없음: 모든 instructions 로드 이벤트를 수신
//   - 내용 접근 불가: 로드 경로(source)만 메타데이터로 수집
//
// 역할:
//   - BASELINE 보정 참고 신호 (instructions 존재 = 에이전트 기준선 확립됨)
//   - 세션 중 instructions 변경/재로드 감지 (source + 발화 빈도)
//   - 원문 미수집 (§5.4 privacy-first)
// =============================================================================

import {
  PMatrixConfig,
  InstructionsLoadedInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
} from '../state-store';

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleInstructionsLoaded(
  event: InstructionsLoadedInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id, source } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] InstructionsLoaded: source=${source ?? 'unknown'} session=${session_id}\n`
    );
  }

  // Observation signal: load fact only — content NOT included
  if (config.dataSharing) {
    const signal = buildInstructionsSignal(state, session_id, source, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  // No state mutation — observation only, no saveState() needed
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildInstructionsSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  source: string | undefined,
  frameworkTag: 'beta' | 'stable',
): SignalPayload {
  return {
    agent_id: state.agentId,
    // BASELINE: instructions presence = foundational alignment reference
    // Small positive baseline signal (낮은 위험도 방향) — must be ≥ 0 (server schema constraint)
    baseline: 0.01,
    // Neutral signal for non-measured axes — avoids all-zero → R(t)=0.75 HALT
    norm: 0.5,
    stability: 0.5,
    meta_control: 0.5,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      event_type: 'instructions_loaded',
      session_id: sessionId,
      // source path only — never content (§5.4)
      instructions_source: source ?? null,
      priority: 'normal',
    },
    state_vector: null,
  };
}
