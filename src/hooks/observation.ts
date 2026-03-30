// =============================================================================
// @pmatrix/claude-code-monitor — hooks/observation.ts
// CC-3/CC-4: Observation-only handlers for CC v2.1.76+ 신규 훅 5종
//
// 게이트 아님 — 관측 전용 (fire-and-forget 시그널 + 카운터)
//   - TaskCreated: 태스크 생성 텔레메트리 (taskCount++) [CC v2.1.85]
//   - Elicitation: elicitation 요청 발생 텔레메트리 (elicitationCount++)
//   - PostCompact: context compact 발생 텔레메트리 (compactCount++)
//   - WorktreeCreate: worktree 생성 시그널 (카운터 불필요)
//   - WorktreeRemove: worktree 삭제 시그널 (카운터 불필요)
// =============================================================================

import {
  PMatrixConfig,
  SignalPayload,
  TaskCreatedInput,
} from '../types';
import { PMatrixHttpClient } from '../client';
import {
  loadOrCreateState,
  saveState,
} from '../state-store';

// Re-export for index.ts convenience
export type { TaskCreatedInput } from '../types';

// ─── Input types ────────────────────────────────────────────────────────────

export interface ElicitationInput {
  hook_event_name: 'Elicitation';
  session_id: string;
  mcp_server_name?: string;
}

export interface PostCompactInput {
  hook_event_name: 'PostCompact';
  session_id: string;
  /** Number of messages before compact */
  messages_before?: number;
  /** Number of messages after compact */
  messages_after?: number;
}

export interface WorktreeCreateInput {
  hook_event_name: 'WorktreeCreate';
  session_id: string;
  worktree_path?: string;
}

export interface WorktreeRemoveInput {
  hook_event_name: 'WorktreeRemove';
  session_id: string;
  worktree_path?: string;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function handleTaskCreated(
  event: TaskCreatedInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.taskCount += 1;

  if (config.dataSharing) {
    const signal = buildObservationSignal(state, session_id, {
      event_type: 'task_created',
      task_id: event.task_id,
      task_count: state.taskCount,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] TaskCreated: count=${state.taskCount} session=${session_id}\n`
    );
  }

  saveState(state);
}

export async function handleElicitation(
  event: ElicitationInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.elicitationCount += 1;

  if (config.dataSharing) {
    const signal = buildObservationSignal(state, session_id, {
      event_type: 'elicitation_request',
      mcp_server_name: event.mcp_server_name,
      elicitation_count: state.elicitationCount,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] Elicitation: count=${state.elicitationCount} session=${session_id}\n`
    );
  }

  saveState(state);
}

export async function handlePostCompact(
  event: PostCompactInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;
  const state = loadOrCreateState(session_id, config.agentId);

  state.compactCount += 1;

  if (config.dataSharing) {
    const signal = buildObservationSignal(state, session_id, {
      event_type: 'post_compact',
      compact_count: state.compactCount,
      messages_before: event.messages_before,
      messages_after: event.messages_after,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] PostCompact: count=${state.compactCount} session=${session_id}\n`
    );
  }

  saveState(state);
}

export async function handleWorktreeCreate(
  event: WorktreeCreateInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;

  if (config.dataSharing) {
    const state = loadOrCreateState(session_id, config.agentId);
    const signal = buildObservationSignal(state, session_id, {
      event_type: 'worktree_create',
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] WorktreeCreate: session=${session_id}\n`
    );
  }
}

export async function handleWorktreeRemove(
  event: WorktreeRemoveInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient,
): Promise<void> {
  const { session_id } = event;

  if (config.dataSharing) {
    const state = loadOrCreateState(session_id, config.agentId);
    const signal = buildObservationSignal(state, session_id, {
      event_type: 'worktree_remove',
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(signal).catch(() => {});
  }

  if (config.debug) {
    process.stderr.write(
      `[P-MATRIX] WorktreeRemove: session=${session_id}\n`
    );
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

function buildObservationSignal(
  state: ReturnType<typeof loadOrCreateState>,
  sessionId: string,
  metadata: Record<string, unknown>,
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
      session_id: sessionId,
      priority: 'normal',
      ...metadata,
    },
    state_vector: null,
  };
}
