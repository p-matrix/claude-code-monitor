// =============================================================================
// @pmatrix/claude-code-monitor — hooks/elicitation.ts
// ElicitationResult hook handler — credential protection gate
//
// CC-2: MCP 서버가 elicitation으로 사용자 입력을 요청할 때,
// credential이 포함된 응답이 scanCredentials를 거치지 않고 전송되는 갭 차단.
// UserPromptSubmit과 동일한 credential 스캔 패턴 적용.
//
// Hook: ElicitationResult (CC v2.1.76 신규)
// Gate hook — blocked: true 반환 시 Claude Code가 elicitation 응답 차단
// =============================================================================

import {
  PMatrixConfig,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';
import { scanCredentials } from '../credential-scanner';

// ─── Input type ─────────────────────────────────────────────────────────────

export interface ElicitationResultInput {
  hook_event_name: 'ElicitationResult';
  session_id: string;
  /** User's response text from elicitation — scanned for credentials, NOT stored */
  result?: string;
  /** MCP server that requested elicitation */
  mcp_server_name?: string;
}

// ─── Handler result ─────────────────────────────────────────────────────────

interface ElicitationResultResult {
  /** true = block the elicitation response */
  blocked: boolean;
  /** Error message written to stderr on block */
  reason?: string;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handleElicitationResult(
  event: ElicitationResultInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<ElicitationResultResult> {
  const { session_id, result } = event;

  const state = loadOrCreateState(session_id, config.agentId);

  // ─── Credential Protection ──────────────────────────────────────────────
  if (config.credentialProtection.enabled && result) {
    const hits = scanCredentials(result, config.credentialProtection.customPatterns);

    if (hits.length > 0) {
      state.credentialBlocks += 1;
      state.dangerEvents += 1;

      const credentialTypes = hits.map(h => h.name).join(', ');
      const totalCount = hits.reduce((sum, h) => sum + h.count, 0);

      if (config.debug) {
        process.stderr.write(
          `[P-MATRIX] ElicitationResult: credential detected — ${credentialTypes} (count=${totalCount})\n`
        );
      }

      // Alert signal: type/count only — response content NOT included (§5.4)
      if (config.dataSharing) {
        const signal = buildCredentialAlertSignal(
          state, session_id, totalCount, credentialTypes,
          config.frameworkTag ?? 'stable'
        );
        client.sendCritical(signal).catch(() => {});
      }

      saveState(state);

      return {
        blocked: true,
        reason: `[P-MATRIX] Credential detected in elicitation response (${credentialTypes}).\nPlease remove sensitive data before submitting.\n`,
      };
    }
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] ElicitationResult: passed session=${session_id}\n`
    );
  }

  saveState(state);
  return { blocked: false };
}

// ─── Internal ───────────────────────────────────────────────────────────────

function buildCredentialAlertSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  credentialCount: number,
  credentialTypes: string,
  frameworkTag: 'beta' | 'stable',
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0.5,
    norm: 0.5,
    stability: 0.10,
    meta_control: 0.5,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      event_type: 'elicitation_credential_block',
      session_id: sessionId,
      credential_count: credentialCount,
      credential_types: credentialTypes,
      priority: 'critical',
    },
    state_vector: null,
  };
}
