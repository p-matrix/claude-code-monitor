// =============================================================================
// @pmatrix/claude-code-monitor — client.ts
// =============================================================================
// R-X.3 migration: PMatrixHttpClient extracted to @pmatrix/core-sdk v0.1.0.
// Thin Claude-Code-bound wrapper pre-supplying AdapterIdentity.
// =============================================================================

import { PMatrixHttpClient as CorePMatrixHttpClient } from '@pmatrix/core-sdk';
import type {
  AdapterIdentity,
  PMatrixConfig,
} from '@pmatrix/core-sdk';

export type { SessionSummaryInput } from '@pmatrix/core-sdk';

const CLAUDE_CODE_IDENTITY: AdapterIdentity = Object.freeze({
  signalSource: 'claude_code_hook',
  framework: 'claude_code',
});

export class PMatrixHttpClient extends CorePMatrixHttpClient {
  constructor(config: PMatrixConfig) {
    super(config, CLAUDE_CODE_IDENTITY);
  }
}
