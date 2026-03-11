#!/usr/bin/env node
// =============================================================================
// @pmatrix/claude-code-monitor — index.ts
// CLI entry point: reads Claude Code hook event from stdin, dispatches to
// handler, writes hook response JSON to stdout.
//
// Usage (configured in ~/.claude/settings.json hooks):
//   pmatrix-cc pre-tool-use
//   pmatrix-cc permission-request
//   pmatrix-cc session-start
//   pmatrix-cc session-end
//   pmatrix-cc post-tool-use-failure   [P2]
//   pmatrix-cc subagent-start          [P2]
//   pmatrix-cc subagent-stop           [P2]
//   pmatrix-cc user-prompt-submit      [P3]
//   pmatrix-cc instructions-loaded     [P4]
//   pmatrix-cc mcp            -- stdio MCP server (pmatrix_status/grade/halt)
//   pmatrix-cc setup          -- writes hook config to ~/.claude/settings.json
//
// Stdin:  Claude Code hook event JSON
// Stdout: Claude Code hook response JSON (for PreToolUse / PermissionRequest)
// Stderr: Debug logs (only when PMATRIX_DEBUG=1)
//
// Exit codes:
//   0  — success (allow or deny via JSON output)
//   1  — error (fail-open: Claude Code continues, non-blocking)
// =============================================================================

import { loadConfig } from './config';
import { PMatrixHttpClient } from './client';
import {
  ClaudeHookInput,
  PreToolUseInput,
  PermissionRequestInput,
  SessionStartInput,
  SessionEndInput,
  PostToolUseFailureInput,
  SubagentStartInput,
  SubagentStopInput,
  UserPromptSubmitInput,
  InstructionsLoadedInput,
} from './types';
import { handlePreToolUse } from './hooks/pre-tool-use';
import { handleSessionStart, handleSessionEnd } from './hooks/session';
import { handlePermissionRequest } from './hooks/permission-request';
import { handlePostToolUseFailure } from './hooks/post-tool-use-failure';
import { handleSubagentStart, handleSubagentStop } from './hooks/subagent';
import { handleUserPromptSubmit } from './hooks/user-prompt-submit';
import { handleInstructionsLoaded } from './hooks/instructions-loaded';

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const subcommand = process.argv[2];

  // MCP server — persistent stdio process for Claude Code MCP integration
  if (subcommand === 'mcp') {
    const { runMcpServer } = await import('./mcp/server.js');
    await runMcpServer();
    return;
  }

  // Setup command — delegates to cli/setup
  if (subcommand === 'setup') {
    const { runSetup } = await import('./cli/setup.js');
    await runSetup();
    return;
  }

  // All other subcommands: read stdin, dispatch, write stdout
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    // Empty stdin — no event to process, exit cleanly
    process.exit(0);
    return;
  }

  let event: ClaudeHookInput;
  try {
    event = JSON.parse(rawInput) as ClaudeHookInput;
  } catch {
    // Invalid JSON — fail-open
    process.exit(0);
    return;
  }

  // Config
  const config = loadConfig();

  // Validate prerequisites
  if (!config.agentId) {
    if (config.debug) {
      process.stderr.write('[P-MATRIX] No agentId configured — run: pmatrix-cc setup\n');
    }
    process.exit(0);
    return;
  }
  if (!config.apiKey) {
    if (config.debug) {
      process.stderr.write('[P-MATRIX] No apiKey configured — set PMATRIX_API_KEY\n');
    }
    process.exit(0);
    return;
  }
  const client = new PMatrixHttpClient(config);

  // Determine effective subcommand:
  // Prefer CLI arg, fall back to hook_event_name in event JSON
  const hookName =
    subcommand ??
    (event as unknown as Record<string, unknown>)['hook_event_name'] as string | undefined;

  try {
    switch (hookName) {
      case 'pre-tool-use':
      case 'PreToolUse': {
        const output = await handlePreToolUse(
          event as PreToolUseInput,
          config,
          client
        );
        process.stdout.write(JSON.stringify(output) + '\n');
        break;
      }

      case 'permission-request':
      case 'PermissionRequest': {
        const output = await handlePermissionRequest(
          event as PermissionRequestInput,
          config,
          client
        );
        process.stdout.write(JSON.stringify(output) + '\n');
        break;
      }

      case 'session-start':
      case 'SessionStart': {
        await handleSessionStart(event as SessionStartInput, config, client);
        // No stdout output for SessionStart (command hook lifecycle only)
        break;
      }

      case 'session-end':
      case 'SessionEnd': {
        await handleSessionEnd(event as SessionEndInput, config, client);
        // No stdout output for SessionEnd
        break;
      }

      case 'post-tool-use-failure':
      case 'PostToolUseFailure': {
        await handlePostToolUseFailure(event as PostToolUseFailureInput, config, client);
        break;
      }

      case 'subagent-start':
      case 'SubagentStart': {
        await handleSubagentStart(event as SubagentStartInput, config, client);
        break;
      }

      case 'subagent-stop':
      case 'SubagentStop': {
        await handleSubagentStop(event as SubagentStopInput, config, client);
        break;
      }

      case 'user-prompt-submit':
      case 'UserPromptSubmit': {
        const result = await handleUserPromptSubmit(
          event as UserPromptSubmitInput,
          config,
          client
        );
        if (result.blocked) {
          process.stderr.write(result.reason ?? '[P-MATRIX] Credential detected in prompt\n');
          process.exit(2);
        }
        break;
      }

      case 'instructions-loaded':
      case 'InstructionsLoaded': {
        await handleInstructionsLoaded(event as InstructionsLoadedInput, config, client);
        break;
      }

      default: {
        // Unknown hook — exit cleanly (fail-open)
        if (config.debug) {
          process.stderr.write(`[P-MATRIX] Unknown hook event: ${String(hookName)}\n`);
        }
        break;
      }
    }

    process.exit(0);
  } catch (err) {
    // Any unhandled error → fail-open (exit 0, not exit 2)
    if (config.debug) {
      process.stderr.write(`[P-MATRIX] Hook error: ${(err as Error).message}\n`);
    }
    process.exit(0);
  }
}

// ─── Stdin reader ─────────────────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      // No stdin attached (interactive terminal) — return empty
      resolve('');
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch(() => {
  // Top-level error — always fail-open
  process.exit(0);
});
