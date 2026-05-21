// =============================================================================
// claude-code-monitor contract.test.ts — Tier 2 conformance (Contract v0.1)
// =============================================================================

import {
  AgentEventSchema,
  NormalizedActionEventSchema,
  ObservableFactSchema,
  AxisEvidenceSchema,
  PEPEvaluationInputSchema,
  type AgentEvent,
  type NormalizedActionEvent,
  type ObservableFact,
  type AxisEvidence,
  type PEPEvaluationInput,
} from '@pmatrix/core-sdk';
import { PMatrixHttpClient } from '../client';
import type { SessionSummaryInput } from '../client';
import type { PMatrixConfig } from '@pmatrix/core-sdk';

function mockConfig(): PMatrixConfig {
  return {
    serverUrl: 'https://test.invalid',
    agentId: 'claude-code-agent-001',
    apiKey: 'test-key',
    safetyGate: { enabled: true, serverTimeoutMs: 2500 },
    credentialProtection: { enabled: true, customPatterns: [] },
    killSwitch: { autoHaltOnRt: 0.75 },
    dataSharing: false,
    batch: { maxSize: 50, flushIntervalMs: 5000, retryMax: 3 },
    debug: false,
  };
}

function claudeCodeAgentEvent(eventType: string, hookName: string): AgentEvent {
  return {
    vendor: 'anthropic',
    product: 'claude-code-cli',
    host_surface: 'cli',
    event_type: eventType,
    timestamp: '2026-05-20T00:00:00.000Z',
    session_id: 'sess-cc-001',
    agent_id: 'claude-code-agent-001',
    raw_event_ref: 'sha256:cc-raw-event',
    content_included: false,
    host_integration_scope: {
      integration_type: 'cli-hook',
      hook_name: hookName,
      adapter_version: '0.7.0',
    },
    vendor_extensions: { source: 'startup' },
  };
}

describe('claude-code-monitor contract v0.1 conformance', () => {
  test('PMatrixHttpClient identity auto-injected (claude_code_hook / claude_code)', () => {
    const client = new PMatrixHttpClient(mockConfig());
    expect(client.identity.signalSource).toBe('claude_code_hook');
    expect(client.identity.framework).toBe('claude_code');
  });

  test('SessionSummaryInput drops hardcoded brand fields (R-X.3)', () => {
    const summary: SessionSummaryInput = {
      sessionId: 'sess-001',
      agentId: 'claude-code-agent-001',
      totalTurns: 5,
      dangerEvents: 0,
      credentialBlocks: 0,
      safetyGateBlocks: 0,
      framework_tag: 'stable',
    };
    expect(Object.prototype.hasOwnProperty.call(summary, 'signal_source')).toBe(false);
  });

  test.each([
    ['SessionStart', 'SessionStart'],
    ['UserPromptSubmit', 'UserPromptSubmit'],
    ['PreToolUse', 'PreToolUse'],
    ['PostToolUse', 'PostToolUse'],
    ['SubagentStart', 'SubagentStart'],
    ['SubagentStop', 'SubagentStop'],
    ['PermissionRequest', 'PermissionRequest'],
    ['PostCompact', 'PostCompact'],
    ['Stop', 'Stop'],
  ])('emits valid AgentEvent for %s hook', (eventType, hookName) => {
    const ev = claudeCodeAgentEvent(eventType, hookName);
    expect(AgentEventSchema.safeParse(ev).success).toBe(true);
  });

  test('vendor_extensions accepts Claude Code primitives', () => {
    const ev = claudeCodeAgentEvent('PostCompact', 'PostCompact');
    ev.vendor_extensions = {
      messages_before: 100,
      messages_after: 50,
      mcp_server_name: 'github-mcp',
      subagent_depth: 1,
      worktree_path: '/repo/feature-branch',
    };
    expect(AgentEventSchema.safeParse(ev).success).toBe(true);
  });

  test('5-layer round-trip — Bash tool_call', () => {
    const agentEvent: AgentEvent = claudeCodeAgentEvent('PreToolUse', 'PreToolUse');
    expect(AgentEventSchema.safeParse(agentEvent).success).toBe(true);

    const normalized: NormalizedActionEvent = {
      source_event_ref: agentEvent.raw_event_ref,
      action_type: 'tool_call',
      actor: agentEvent.agent_id,
      target: 'Bash',
      scope: {},
      action_category: 'shell',
      evidence_ref: 'sha256:bash-evidence',
    };
    expect(NormalizedActionEventSchema.safeParse(normalized).success).toBe(true);

    const fact: ObservableFact = {
      fact_type: 'action',
      fact_id: 'fact-cc-001',
      agent_id: agentEvent.agent_id,
      contract_id: 'contract-cc-001',
      source_vendor: agentEvent.vendor,
      source_surface: agentEvent.host_surface,
      observed_at: agentEvent.timestamp,
      confidence: 0.95,
      provenance: {
        adapter_id: 'claude-code-monitor-001',
        adapter_version: '0.7.0',
        chain_ref: null,
        signature: 'hmac-sha256:cc-sig',
      },
      content_agnostic_ref: 'sha256:fact-canonical',
    };
    expect(ObservableFactSchema.safeParse(fact).success).toBe(true);

    const evidence: AxisEvidence = {
      axis: 'meta_control',
      evidence_type: 'observation',
      signal_strength: 0.4,
      direction: 'increase',
      confidence: 0.85,
      reason_code: 'high_risk_bash_invocation',
      fact_refs: [fact.fact_id],
      axis_status: 'WARN',
    };
    expect(AxisEvidenceSchema.safeParse(evidence).success).toBe(true);

    const pepInput: PEPEvaluationInput = {
      delegation_contract_ref: null,
      current_runtime_mode: 'Caution',
      current_rt: 0.42,
      current_tier: 'T5',
      action_type: 'tool_call',
      action_category: 'shell',
      authority_scope: 'shell_exec',
      approval_requirement: 'human-required',
      risk_level: 'high',
      fact_refs: [fact.fact_id],
      peer_verifications: [
        {
          peer_node_id: 'peer-beta',
          decision: 'PASS',
          axes_status: {
            cap_within_bounds: 'N/A',
            delegation_receipt_valid: 'PASS',
            expiry_not_passed: 'PASS',
            action_within_scope: 'PASS',
            delegator_authority: 'PASS',
            policy_digest_match: 'PASS',
            rt_within_threshold: 'PASS',
            mode_compatible: 'PASS',
          },
          signature: 'hmac-sha256:peer-cc',
          timestamp: agentEvent.timestamp,
        },
      ],
      quorum_rule: 'critical-axis-veto',
    };
    expect(PEPEvaluationInputSchema.safeParse(pepInput).success).toBe(true);
  });
});
