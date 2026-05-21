// =============================================================================
// @pmatrix/claude-code-monitor — types.ts
// Claude Code hook input/output types + P-MATRIX shared types
//
// Sources:
//   - Claude Code official hooks reference (docs.claude.com)
//   - PMATRIX_Anthropic_Claude_Code_Research_v2_3.md §5
//   - PMATRIX_Claude_Code_Mapping_v1_1.md §2
// =============================================================================

// ─── Claude Code Hook Input (stdin JSON) ─────────────────────────────────────

/**
 * PreToolUse hook input — received via stdin
 * Privacy-first: tool_input content is intentionally NOT used (§5.4)
 */
export interface PreToolUseInput {
  hook_event_name: 'PreToolUse';
  session_id: string;
  tool_name: string;
  tool_use_id?: string;
  cwd?: string;
  /** tool_input exists but P-MATRIX does NOT read content — privacy policy */
  tool_input?: Record<string, unknown>;
}

/**
 * PermissionRequest hook input — received via stdin
 * Used for Kill Switch 2차 경로 (보조)
 */
export interface PermissionRequestInput {
  hook_event_name: 'PermissionRequest';
  session_id: string;
  tool_name?: string;
  permission?: Record<string, unknown>;
  cwd?: string;
}

/**
 * SessionStart hook input — received via stdin
 * command-only hook (not HTTP)
 */
export interface SessionStartInput {
  hook_event_name: 'SessionStart';
  session_id: string;
  source?: string;
  model?: string;
  agent_type?: string;
  cwd?: string;
}

/**
 * SessionEnd hook input — received via stdin
 * command-only hook (not HTTP)
 */
export interface SessionEndInput {
  hook_event_name: 'SessionEnd';
  session_id: string;
  end_reason?: string;
  duration_ms?: number;
}

/**
 * PostToolUse hook input — received via stdin
 * Observation only — fired on every successful tool completion (CC v2.1.119+)
 * duration_ms: tool execution latency. Forwarded to server for R(t) latency axis.
 */
export interface PostToolUseInput {
  hook_event_name: 'PostToolUse';
  session_id: string;
  tool_name: string;
  tool_use_id?: string;
  /** Tool execution latency in ms (CC v2.1.119+) — telemetry only on monitor side */
  duration_ms?: number;
  cwd?: string;
}

/**
 * PostToolUseFailure hook input — received via stdin
 * command-only hook (no blocking capability)
 */
export interface PostToolUseFailureInput {
  hook_event_name: 'PostToolUseFailure';
  session_id: string;
  tool_name: string;
  tool_use_id?: string;
  /** Error type — collected for DRIFT analysis, NOT content */
  error?: string;
  /** Tool execution latency before failure in ms (CC v2.1.119+) */
  duration_ms?: number;
  cwd?: string;
}

/**
 * SubagentStart hook input — received via stdin
 * command-only hook (no blocking capability)
 */
export interface SubagentStartInput {
  hook_event_name: 'SubagentStart';
  session_id: string;
  /** Subagent session ID (child) */
  subagent_session_id?: string;
  /** Subagent type (e.g., "agent", "subagent") */
  agent_type?: string;
  cwd?: string;
}

/**
 * SubagentStop hook input — received via stdin
 * command-only hook (no blocking capability)
 */
export interface SubagentStopInput {
  hook_event_name: 'SubagentStop';
  session_id: string;
  subagent_session_id?: string;
  /** Duration in ms (if available) */
  duration_ms?: number;
  /** Completion status */
  stop_reason?: string;
}

/**
 * UserPromptSubmit hook input — received via stdin
 * Can block (exit 2) on credential detection
 * Privacy-first: prompt content is scanned but NOT stored or forwarded (§5.4)
 */
export interface UserPromptSubmitInput {
  hook_event_name: 'UserPromptSubmit';
  session_id: string;
  /** User's prompt text — scanned for credentials, NOT stored or forwarded (§5.4) */
  prompt?: string;
  cwd?: string;
}

/**
 * InstructionsLoaded hook input — received via stdin
 * command-only hook (observation only, no blocking)
 */
export interface InstructionsLoadedInput {
  hook_event_name: 'InstructionsLoaded';
  session_id: string;
  /** Path of the loaded instructions file — path only, content NOT accessed (§5.4) */
  source?: string;
  cwd?: string;
}

/**
 * ElicitationResult hook input — CC v2.1.76 신규
 * Gate hook — credential 감지 시 차단 가능 (exit 2)
 */
export interface ElicitationResultInput {
  hook_event_name: 'ElicitationResult';
  session_id: string;
  /** User's response text from elicitation — scanned for credentials, NOT stored */
  result?: string;
  mcp_server_name?: string;
}

/**
 * Elicitation hook input — CC v2.1.76 신규
 * Observation only (no blocking)
 */
export interface ElicitationInput {
  hook_event_name: 'Elicitation';
  session_id: string;
  mcp_server_name?: string;
}

/**
 * PostCompact hook input — CC v2.1.76 신규
 * Observation only (no blocking)
 */
export interface PostCompactInput {
  hook_event_name: 'PostCompact';
  session_id: string;
  messages_before?: number;
  messages_after?: number;
}

/**
 * WorktreeCreate hook input — CC v2.1.76 신규
 * Observation only (no blocking)
 */
export interface WorktreeCreateInput {
  hook_event_name: 'WorktreeCreate';
  session_id: string;
  worktree_path?: string;
}

/**
 * WorktreeRemove hook input — CC v2.1.76 신규
 * Observation only (no blocking)
 */
export interface WorktreeRemoveInput {
  hook_event_name: 'WorktreeRemove';
  session_id: string;
  worktree_path?: string;
}

/**
 * TaskCreated hook input — CC v2.1.85 신규
 * Observation only (no blocking) — fires when a task is created via TaskCreate
 */
export interface TaskCreatedInput {
  hook_event_name: 'TaskCreated';
  session_id: string;
  /** Task ID (if available) */
  task_id?: string;
  cwd?: string;
}

/**
 * StopFailure hook input — CC v2.1.85 신규
 * Observation + stability signal — fires when Claude Code fails to stop properly
 */
export interface StopFailureInput {
  hook_event_name: 'StopFailure';
  session_id: string;
  /** Reason for stop failure */
  error?: string;
}

/**
 * CwdChanged hook input — CC v2.1.83 신규
 * Observation only (no blocking) — fires when working directory changes (e.g. via cd, direnv)
 */
export interface CwdChangedInput {
  hook_event_name: 'CwdChanged';
  session_id: string;
  /** Previous cwd (if available) */
  old_cwd?: string;
  /** New cwd */
  cwd?: string;
}

/**
 * FileChanged hook input — CC v2.1.89 신규
 * Observation only (no blocking) — fires on filesystem change events
 * Privacy-first: file paths only — no content
 */
export interface FileChangedInput {
  hook_event_name: 'FileChanged';
  session_id: string;
  /** Path of changed file — privacy-first, content NOT accessed */
  file_path?: string;
  /** Change kind (created/modified/deleted) — if known */
  change_kind?: string;
  cwd?: string;
}

/**
 * PermissionDenied hook input — CC v2.1.119 신규
 * Observation only — fires when the auto-mode classifier denies a tool call.
 * Single observer (retry NOT blocked) — model retry decision is upstream.
 */
export interface PermissionDeniedInput {
  hook_event_name: 'PermissionDenied';
  session_id: string;
  tool_name?: string;
  /** Reason from classifier (e.g., "high-risk tool, manual approval required") */
  reason?: string;
  cwd?: string;
}

/** Union of all hook inputs */
export type ClaudeHookInput =
  | PreToolUseInput
  | PermissionRequestInput
  | SessionStartInput
  | SessionEndInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | SubagentStartInput
  | SubagentStopInput
  | UserPromptSubmitInput
  | InstructionsLoadedInput
  | ElicitationResultInput
  | ElicitationInput
  | PostCompactInput
  | WorktreeCreateInput
  | WorktreeRemoveInput
  | TaskCreatedInput
  | StopFailureInput
  | CwdChangedInput
  | FileChangedInput
  | PermissionDeniedInput;

// ─── Claude Code Hook Output (stdout JSON) ───────────────────────────────────

/**
 * PreToolUse hook output — written to stdout
 * §5.3.1: hookSpecificOutput.permissionDecision
 */
export interface PreToolUseOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

/**
 * PermissionRequest hook output — written to stdout
 * §5.3.2: hookSpecificOutput.decision.behavior
 */
export interface PermissionRequestOutput {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'allow' | 'deny';
      message?: string;
      /** true = Kill Switch: forces session abort */
      interrupt?: boolean;
    };
  };
}

// ─── Re-export shared types from @pmatrix/core-sdk (R-X.3 migration) ──────

export type {
  SafetyMode,
  TrustGrade,
  ToolRiskTier,
  GateAction,
  AxesState,
  BatchSendResponse,
  GradeResponse,
  AgentGradeDetail,
  AgentGradeHistoryItem,
  SafetyGateConfig,
  CredentialProtectionConfig,
  KillSwitchConfig,
  BatchConfig,
  PMatrixConfig,
} from '@pmatrix/core-sdk';

import type { SignalPayload as CoreSignalPayload, SignalMetadata as CoreSignalMetadata } from '@pmatrix/core-sdk';

// Claude Code-narrowed SignalPayload (literal vendor branding preserved)
export interface SignalPayload extends Omit<CoreSignalPayload, 'signal_source' | 'framework'> {
  signal_source: 'claude_code_hook';
  framework: 'claude_code';
}

// Claude Code reuses core's SignalMetadata directly
export type SignalMetadata = CoreSignalMetadata;
