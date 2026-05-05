// =============================================================================
// @pmatrix/claude-code-monitor — hooks/file-changed.ts
// FileChanged hook handler — observation only (no blocking) [CC v2.1.89]
//
// Filesystem change observer. fileChangeCount 증가 + telemetry signal.
// Privacy-first: file path 만 전송, content 접근 없음.
// =============================================================================

import {
  PMatrixConfig,
  FileChangedInput,
  SignalPayload,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

export async function handleFileChanged(
  event: FileChangedInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.fileChangeCount += 1;

  if (config.dataSharing) {
    const signal = buildFileChangedSignal(state, session_id, event, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] FileChanged: count=${state.fileChangeCount} session=${session_id} kind=${event.change_kind ?? 'N/A'}\n`
    );
  }

  saveState(state);
}

function buildFileChangedSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  event: FileChangedInput,
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
      event_type: 'file_changed',
      session_id: sessionId,
      file_path: event.file_path,
      change_kind: event.change_kind,
      file_change_count: state.fileChangeCount,
      priority: 'normal',
    },
    state_vector: null,
  };
}
