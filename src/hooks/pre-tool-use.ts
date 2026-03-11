// =============================================================================
// @pmatrix/claude-code-monitor — hooks/pre-tool-use.ts
// PreToolUse hook handler — Safety Gate core
//
// Flow:
//   1. Load session state (or fail-open default)
//   2. Check isHalted → BLOCK immediately
//   3. Classify tool risk (tool_name only — no tool_input content)
//   4. Check meta-control rules (tool_name only)
//   5. Send signal to server with serverTimeoutMs fail-open
//   6. Update R(t) cache in state
//   7. Evaluate safety gate → ALLOW or BLOCK
//   8. Return PreToolUseOutput JSON
// =============================================================================

import { PMatrixConfig, PreToolUseInput, PreToolUseOutput, SignalPayload } from '../types';
import { PMatrixHttpClient } from '../client';
import {
  classifyToolRisk,
  evaluateSafetyGate,
  checkMetaControlRules,
  rtToMode,
} from '../safety-gate';
import {
  loadOrCreateState,
  saveState,
  buildRtCacheExpiry,
  isRtCacheValid,
  isHaltActive,
  PersistedSessionState,
} from '../state-store';

export async function handlePreToolUse(
  event: PreToolUseInput,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<PreToolUseOutput> {
  const { session_id, tool_name } = event;
  const agentId = config.agentId;

  // ① HALT file check — global Kill Switch, checked before ANY state load
  // ~/.pmatrix/HALT presence → block immediately, no state I/O
  if (isHaltActive()) {
    return buildDenyOutput(
      'P-MATRIX Kill Switch HALT active. All tool calls blocked. Remove ~/.pmatrix/HALT to resume.'
    );
  }

  // Safety Gate disabled — allow, but still run credential protection + dataSharing
  // (those are controlled by their own flags; safetyGate.enabled is gate-only)
  if (!config.safetyGate.enabled) {
    return buildAllowOutput();
  }

  // 1. Load state (fail-open: createDefault if missing)
  const state = loadOrCreateState(session_id, agentId);

  // 2. Kill Switch: halted sessions block everything
  if (state.isHalted) {
    const output = buildDenyOutput(
      `P-MATRIX Kill Switch active: ${state.haltReason ?? 'R(t) ≥ 0.75'}`
    );
    // persist safetyGateBlocks increment
    state.safetyGateBlocks += 1;
    saveState(state);
    return output;
  }

  // 3. Tool risk classification (tool_name only — privacy-first, no tool_input)
  const toolRisk = classifyToolRisk(
    tool_name,
    config.safetyGate.customToolRisk
  );

  // 4. meta_control special rules (tool_name only)
  // NOTE: params=null intentionally — privacy-first policy (§5.4, no tool_input content).
  // rm-rf/sudo/curl|sh patterns in META_CONTROL_RULES require command text (tool_input.command).
  // These rules become active in P3 when UserPromptSubmit adds partial command metadata.
  // Until then, checkMetaControlRules matches tool_name portion only (limited coverage).
  const mcBlock = checkMetaControlRules(tool_name, null);
  if (mcBlock !== null) {
    // Send critical signal (fire-and-forget, no await needed for response)
    const criticalSignal = buildSignal(state, session_id, tool_name, {
      event_type: 'meta_control_block',
      priority: 'critical',
      meta_control_delta: mcBlock.metaControlDelta,
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(criticalSignal).catch(() => {});

    state.dangerEvents += 1;
    state.safetyGateBlocks += 1;
    saveState(state);

    return buildDenyOutput(`P-MATRIX Safety Gate: ${mcBlock.reason}`);
  }

  // 5. Get R(t) from server (with fail-open timeout)
  const rt = await fetchRtWithFailOpen(state, session_id, tool_name, config, client);

  // 6. Evaluate safety gate
  const gateResult = evaluateSafetyGate(rt, toolRisk);

  if (gateResult.action === 'BLOCK') {
    // Send signal recording the block
    const blockSignal = buildSignal(state, session_id, tool_name, {
      event_type: 'safety_gate_block',
      priority: 'critical',
    }, config.frameworkTag ?? 'stable');
    client.sendCritical(blockSignal).catch(() => {});

    state.safetyGateBlocks += 1;
    state.dangerEvents += 1;  // BUG-3 fix: safety gate block is a danger event
    if (rt >= config.killSwitch.autoHaltOnRt) {
      state.isHalted = true;
      state.haltReason = `R(t) ${rt.toFixed(2)} ≥ ${config.killSwitch.autoHaltOnRt}`;
    }
    saveState(state);

    return buildDenyOutput(`P-MATRIX Safety Gate: ${gateResult.reason}`);
  }

  // ALLOW
  saveState(state);
  return buildAllowOutput();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch R(t) from server with fail-open timeout.
 * If server call exceeds serverTimeoutMs or fails → return cached R(t).
 * This is the core fail-open guarantee: server issues never block Claude Code.
 */
async function fetchRtWithFailOpen(
  state: PersistedSessionState,
  sessionId: string,
  toolName: string,
  config: PMatrixConfig,
  client: PMatrixHttpClient
): Promise<number> {
  // If cache is valid, use it (skip server call)
  if (isRtCacheValid(state)) {
    return state.currentRt;
  }

  const signal = buildSignal(state, sessionId, toolName, {
    event_type: 'pre_tool_use',
    priority: 'normal',
  }, config.frameworkTag ?? 'stable');

  try {
    const response = await withTimeout(
      client.sendSignal(signal),
      config.safetyGate.serverTimeoutMs
    );

    const rtData = PMatrixHttpClient.extractRtFromResponse(response);
    if (rtData) {
      state.currentRt = rtData.rt;
      state.currentMode = rtData.mode;
      state.grade = rtData.grade;
      state.rtCacheExpiry = buildRtCacheExpiry();

      if (config.debug) {
        process.stderr.write(
          `[P-MATRIX] R(t)=${rtData.rt.toFixed(3)} mode=${rtData.mode} grade=${rtData.grade}\n`
        );
      }
    }
  } catch {
    // fail-open: use cached/default R(t), do not block
    if (config.debug) {
      process.stderr.write(
        `[P-MATRIX] Server call failed/timeout — fail-open, using cached R(t)=${state.currentRt.toFixed(3)}\n`
      );
    }
  }

  return state.currentRt;
}

function buildSignal(
  state: PersistedSessionState,
  sessionId: string,
  toolName: string,
  metadata: Record<string, unknown>,
  frameworkTag: 'beta' | 'stable'
): SignalPayload {
  return {
    agent_id: state.agentId,
    baseline: 0,
    norm: state.currentRt,   // Source::Accessibility: NORM = R(t) approximation
    stability: 0,
    meta_control: 0,
    timestamp: new Date().toISOString(),
    signal_source: 'claude_code_hook',
    framework: 'claude_code',
    framework_tag: frameworkTag,
    schema_version: '0.3',
    metadata: {
      session_id: sessionId,
      tool_name: toolName,
      ...metadata,
    },
    state_vector: null,
  };
}

function buildAllowOutput(): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

function buildDenyOutput(reason: string): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
