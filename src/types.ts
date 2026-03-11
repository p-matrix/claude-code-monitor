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

/** Union of all hook inputs */
export type ClaudeHookInput =
  | PreToolUseInput
  | PermissionRequestInput
  | SessionStartInput
  | SessionEndInput
  | PostToolUseFailureInput
  | SubagentStartInput
  | SubagentStopInput
  | UserPromptSubmitInput
  | InstructionsLoadedInput;

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

/** Union of all hook outputs */
export type ClaudeHookOutput = PreToolUseOutput | PermissionRequestOutput;

// ─── 5-Mode and Grade ─────────────────────────────────────────────────────────

/** P-MATRIX 5-Mode (Server constants.py 경계값 기준) */
export type SafetyMode = 'A+1' | 'A+0' | 'A-1' | 'A-2' | 'A-0';

/** Trust Grade */
export type TrustGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/** Tool risk tier */
export type ToolRiskTier = 'HIGH' | 'MEDIUM' | 'LOW';

/** Safety Gate action */
export type GateAction = 'ALLOW' | 'BLOCK';

// ─── 4-axis state ─────────────────────────────────────────────────────────────

export interface AxesState {
  baseline: number;
  norm: number;
  stability: number;
  meta_control: number;
}

// ─── Signal Payload (POST /v1/inspect/stream) ─────────────────────────────────

/**
 * POST /v1/inspect/stream payload — claude_code_hook variant
 * signal_source: 'claude_code_hook', framework: 'claude_code'
 */
export interface SignalPayload {
  agent_id: string;
  baseline: number;
  norm: number;
  stability: number;
  meta_control: number;
  timestamp: string;
  signal_source: 'claude_code_hook';
  framework: 'claude_code';
  framework_tag: 'beta' | 'stable';
  schema_version: '0.3';
  metadata: SignalMetadata;
  state_vector: null;
}

export interface SignalMetadata {
  session_id?: string;
  event_type?: string;
  tool_name?: string;
  priority?: 'critical' | 'normal';
  meta_control_delta?: number;
  baseline_delta?: number;
  danger_events?: number;
  credential_blocks?: number;
  safety_gate_blocks?: number;
  total_turns?: number;
  end_reason?: string;
  is_halted?: boolean;
  [key: string]: unknown;
}

// ─── API Response types ───────────────────────────────────────────────────────

/**
 * POST /v1/inspect/stream response
 * Server returns latest R(t)/Grade after receiving signals
 */
export interface BatchSendResponse {
  received: number;
  risk?: number;
  grade?: TrustGrade;
  mode?: SafetyMode;
  axes?: {
    baseline: number;
    norm: number;
    stability: number;
    meta_control: number;
  };
}

/**
 * GET /v1/agents/{agent_id}/public response
 */
export interface GradeResponse {
  agent_id: string;
  grade: TrustGrade;
  p_score: number;
  risk: number;
  mode: SafetyMode;
  axes: {
    baseline: number;
    norm: number;
    stability: number;
    meta_control: number;
  };
  last_updated: string;
}

/**
 * GET /v1/agents/{agent_id}/grade — grade history item
 */
export interface AgentGradeHistoryItem {
  grade: TrustGrade;
  p_score: number;
  completed_at: string;
}

/**
 * GET /v1/agents/{agent_id}/grade response — current grade + history
 * Phase 0 ③ confirmed: endpoint exists with history list
 */
export interface AgentGradeDetail {
  current_grade: TrustGrade | null;
  p_score: number | null;
  issued_at: string | null;
  expires_at: string | null;
  prev_grade: TrustGrade | null;
  prev_p_score: number | null;
  history: AgentGradeHistoryItem[];
}

// ─── Config types ─────────────────────────────────────────────────────────────

export interface SafetyGateConfig {
  enabled: boolean;
  /** Server call timeout (ms). fail-open: >2500ms → PERMIT */
  serverTimeoutMs: number;
  /** Custom tool risk overrides */
  customToolRisk?: Record<string, ToolRiskTier>;
}

export interface CredentialProtectionConfig {
  enabled: boolean;
  customPatterns: string[];
}

export interface KillSwitchConfig {
  /** R(t) ≥ this value → auto Halt (default 0.75) */
  autoHaltOnRt: number;
}

export interface BatchConfig {
  maxSize: number;
  flushIntervalMs: number;
  retryMax: number;
}

export interface PMatrixConfig {
  serverUrl: string;
  agentId: string;
  apiKey: string;
  safetyGate: SafetyGateConfig;
  credentialProtection: CredentialProtectionConfig;
  killSwitch: KillSwitchConfig;
  dataSharing: boolean;
  agreedAt?: string;
  batch: BatchConfig;
  frameworkTag?: 'beta' | 'stable';
  debug: boolean;
}
