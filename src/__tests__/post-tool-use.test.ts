// =============================================================================
// post-tool-use.test.ts — PostToolUseFailure handler with duration_ms
//
// Coverage:
//   1. dangerEvents counter increments
//   2. duration_ms (CC v2.1.119) appended to state.toolDurations ring buffer
//   3. duration_ms missing → no push (no crash)
//   4. dataSharing=false → client.sendCritical NOT called
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let HOME = '';

jest.mock('os', () => {
  const real = jest.requireActual<typeof import('os')>('os');
  return { ...real, homedir: () => HOME };
});

import { handlePostToolUseFailure } from '../hooks/post-tool-use-failure';
import { loadOrCreateState } from '../state-store';
import type { PMatrixConfig, PostToolUseFailureInput } from '../types';

beforeEach(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pmatrix-post-'));
});

afterEach(() => {
  if (HOME && fs.existsSync(HOME)) {
    fs.rmSync(HOME, { recursive: true, force: true });
  }
});

function makeConfig(overrides: Partial<PMatrixConfig> = {}): PMatrixConfig {
  return {
    serverUrl: 'https://api.pmatrix.io',
    agentId: 'agent-z',
    apiKey: 'key-z',
    safetyGate: { enabled: true, serverTimeoutMs: 100, customToolRisk: {} },
    credentialProtection: { enabled: true, customPatterns: [] },
    killSwitch: { autoHaltOnRt: 0.75 },
    dataSharing: true,
    batch: { maxSize: 10, flushIntervalMs: 2_000, retryMax: 0 },
    frameworkTag: 'stable',
    debug: false,
    ...overrides,
  };
}

function makeInput(opts: Partial<PostToolUseFailureInput> = {}): PostToolUseFailureInput {
  return {
    hook_event_name: 'PostToolUseFailure',
    session_id: 'sess-post-1',
    tool_name: 'bash',
    ...opts,
  };
}

function makeClient() {
  return {
    sendSignal: jest.fn(),
    sendCritical: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../client').PMatrixHttpClient;
}

// ── 1. counter increments ─────────────────────────────────────────────────────

describe('handlePostToolUseFailure', () => {
  test('dangerEvents increments by 1', async () => {
    const before = loadOrCreateState('sess-post-1', 'agent-z');
    expect(before.dangerEvents).toBe(0);

    await handlePostToolUseFailure(makeInput(), makeConfig(), makeClient());

    const after = loadOrCreateState('sess-post-1', 'agent-z');
    expect(after.dangerEvents).toBe(1);
  });

  test('duration_ms is captured in toolDurations ring buffer', async () => {
    await handlePostToolUseFailure(
      makeInput({ duration_ms: 250 }),
      makeConfig(),
      makeClient(),
    );

    const state = loadOrCreateState('sess-post-1', 'agent-z');
    expect(state.toolDurations).toEqual([250]);
  });

  test('multiple duration_ms values accumulate', async () => {
    await handlePostToolUseFailure(
      makeInput({ duration_ms: 100 }), makeConfig(), makeClient(),
    );
    await handlePostToolUseFailure(
      makeInput({ duration_ms: 200 }), makeConfig(), makeClient(),
    );
    await handlePostToolUseFailure(
      makeInput({ duration_ms: 300 }), makeConfig(), makeClient(),
    );

    const state = loadOrCreateState('sess-post-1', 'agent-z');
    expect(state.toolDurations).toEqual([100, 200, 300]);
  });

  test('missing duration_ms does not push anything', async () => {
    await handlePostToolUseFailure(makeInput(), makeConfig(), makeClient());
    const state = loadOrCreateState('sess-post-1', 'agent-z');
    expect(state.toolDurations).toEqual([]);
  });

  test('dataSharing=true → sendCritical called', async () => {
    const client = makeClient();
    await handlePostToolUseFailure(makeInput(), makeConfig({ dataSharing: true }), client);
    expect((client.sendCritical as unknown as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  test('dataSharing=false → sendCritical NOT called', async () => {
    const client = makeClient();
    await handlePostToolUseFailure(makeInput(), makeConfig({ dataSharing: false }), client);
    expect((client.sendCritical as unknown as jest.Mock)).not.toHaveBeenCalled();
  });
});
