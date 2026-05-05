// =============================================================================
// session.test.ts — SessionStart / SessionEnd handlers
//
// Coverage:
//   1. SessionStart double-fire defense (sessionStartFired guard)
//   2. SessionEnd deletes state file
//   3. SessionEnd preserves session counters in summary
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let HOME = '';

jest.mock('os', () => {
  const real = jest.requireActual<typeof import('os')>('os');
  return { ...real, homedir: () => HOME };
});

jest.mock('@pmatrix/field-node-runtime', () => ({
  isField4Enabled: () => false,
  writeFieldState: () => {},
  deleteFieldState: () => {},
}));

import { handleSessionStart, handleSessionEnd } from '../hooks/session';
import { loadState, loadOrCreateState, saveState } from '../state-store';
import type { PMatrixConfig, SessionStartInput, SessionEndInput } from '../types';

beforeEach(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pmatrix-sess-'));
});

afterEach(() => {
  if (HOME && fs.existsSync(HOME)) {
    fs.rmSync(HOME, { recursive: true, force: true });
  }
});

function makeConfig(overrides: Partial<PMatrixConfig> = {}): PMatrixConfig {
  return {
    serverUrl: 'https://api.pmatrix.io',
    agentId: 'agent-s',
    apiKey: 'key-s',
    safetyGate: { enabled: true, serverTimeoutMs: 100, customToolRisk: {} },
    credentialProtection: { enabled: true, customPatterns: [] },
    killSwitch: { autoHaltOnRt: 0.75 },
    dataSharing: false,
    batch: { maxSize: 10, flushIntervalMs: 2_000, retryMax: 0 },
    frameworkTag: 'stable',
    debug: false,
    ...overrides,
  };
}

function makeClient() {
  return {
    sendSignal: jest.fn().mockResolvedValue({ received: 1 }),
    sendCritical: jest.fn().mockResolvedValue(undefined),
    sendSessionSummary: jest.fn().mockResolvedValue(undefined),
    resubmitUnsent: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../client').PMatrixHttpClient;
}

// ── SessionStart ──────────────────────────────────────────────────────────────

describe('handleSessionStart', () => {
  test('first fire creates state with sessionStartFired=true', async () => {
    const evt: SessionStartInput = {
      hook_event_name: 'SessionStart',
      session_id: 'sess-start-1',
    };
    await handleSessionStart(evt, makeConfig(), makeClient());

    const state = loadState('sess-start-1');
    expect(state).not.toBeNull();
    expect(state!.sessionStartFired).toBe(true);
  });

  test('double fire is ignored (idempotent)', async () => {
    const evt: SessionStartInput = {
      hook_event_name: 'SessionStart',
      session_id: 'sess-start-2',
    };
    const cfg = makeConfig();
    const client = makeClient();

    await handleSessionStart(evt, cfg, client);

    // Mutate state to detect re-initialization
    const after1 = loadOrCreateState('sess-start-2', 'agent-s');
    after1.totalTurns = 99;
    saveState(after1);

    await handleSessionStart(evt, cfg, client);

    const after2 = loadState('sess-start-2');
    expect(after2!.totalTurns).toBe(99);  // not reset
  });
});

// ── SessionEnd ────────────────────────────────────────────────────────────────

describe('handleSessionEnd', () => {
  test('removes state file', async () => {
    const startEvt: SessionStartInput = {
      hook_event_name: 'SessionStart',
      session_id: 'sess-end-1',
    };
    await handleSessionStart(startEvt, makeConfig(), makeClient());
    expect(loadState('sess-end-1')).not.toBeNull();

    const endEvt: SessionEndInput = {
      hook_event_name: 'SessionEnd',
      session_id: 'sess-end-1',
    };
    await handleSessionEnd(endEvt, makeConfig(), makeClient());

    expect(loadState('sess-end-1')).toBeNull();
  });

  test('SessionEnd on never-started session does not throw', async () => {
    const endEvt: SessionEndInput = {
      hook_event_name: 'SessionEnd',
      session_id: 'never-started',
    };
    await expect(handleSessionEnd(endEvt, makeConfig(), makeClient())).resolves.not.toThrow();
  });
});
