// =============================================================================
// @pmatrix/claude-code-monitor — cli/setup.ts
// Setup command: writes P-MATRIX hooks to ~/.claude/settings.json
//
// Usage:
//   pmatrix-cc setup
//   pmatrix-cc setup --agent-id <id> --api-key <key>
//
// What it does:
//   1. Resolves the path to the pmatrix-cc binary
//   2. Reads/creates ~/.claude/settings.json
//   3. Merges in the P-MATRIX hook configuration
//   4. Saves the file
//   5. Prints confirmation with next steps
//
// Hook events configured:
//   - PreToolUse (command hook — all matchers)
//   - PermissionRequest (command hook)
//   - SessionStart (command hook)
//   - SessionEnd (command hook)
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Claude settings.json shape (partial) ────────────────────────────────────

interface ClaudeHookEntry {
  type: 'command';
  command: string;
  timeout?: number;
}

interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[];
  matcher?: string;
}

interface ClaudeMcpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookMatcher[]>;
  mcpServers?: Record<string, ClaudeMcpServerEntry>;
  [key: string]: unknown;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  // Resolve binary path
  const binaryPath = resolveBinaryPath();

  // Parse CLI flags (--agent-id, --api-key)
  const args = process.argv.slice(3);
  const agentId = getFlag(args, '--agent-id');
  const apiKey = getFlag(args, '--api-key');

  // Update ~/.pmatrix/config.json if flags provided
  if (agentId || apiKey) {
    updatePMatrixConfig({ agentId, apiKey });
  }

  // Read/create ~/.claude/settings.json
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readJsonOrEmpty<ClaudeSettings>(settingsPath);

  // Build hook config
  const hookConfig = buildHookConfig(binaryPath);

  // Merge hooks
  settings.hooks = mergeHooks(settings.hooks ?? {}, hookConfig);

  // Inject MCP server (pmatrix-cc mcp)
  settings.mcpServers = mergeMcpServers(settings.mcpServers ?? {});

  // Write settings
  const settingsDir = path.dirname(settingsPath);
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // Copy skills → ~/.claude/skills/
  const installDir = resolveInstallDir();
  const skillsInstalled = copySkills(installDir);

  // Print confirmation
  console.log('');
  console.log('✓ P-MATRIX Claude Code Monitor hooks registered');
  console.log(`  Config: ${settingsPath}`);
  console.log(`  Binary: ${binaryPath}`);
  console.log('');
  console.log('Hooks registered:');
  console.log('  • PreToolUse           → Safety Gate');
  console.log('  • PermissionRequest    → Kill Switch (secondary path)');
  console.log('  • SessionStart/End     → Session lifecycle');
  console.log('  • PostToolUseFailure   → Tool failure observation [P2]');
  console.log('  • SubagentStart/Stop   → Subagent tree observation [P2]');
  console.log('  • UserPromptSubmit     → Credential scan + frequency [P3]');
  console.log('  • InstructionsLoaded   → CLAUDE.md load observation [P4]');
  console.log('');
  console.log('MCP server registered (global):');
  console.log('  pmatrix → pmatrix-cc mcp  (pmatrix_status / pmatrix_grade / pmatrix_halt)');
  console.log('');
  if (skillsInstalled > 0) {
    console.log(`Skills installed (${skillsInstalled}) → ~/.claude/skills/`);
    console.log('  /pmatrix-status   → show R(t)/Grade/Mode/counters');
    console.log('  /pmatrix-grade    → show trust grade + history');
    console.log('  /pmatrix-halt     → activate global Kill Switch');
    console.log('');
  }

  if (!agentId) {
    console.log('Next step: set your Agent ID');
    console.log('  pmatrix-cc setup --agent-id <YOUR_AGENT_ID>');
    console.log('  or: PMATRIX_AGENT_ID=<id> in your shell');
    console.log('');
  }

  if (!apiKey) {
    console.log('Next step: set your API key');
    console.log('  export PMATRIX_API_KEY=<YOUR_API_KEY>');
    console.log('  or add to ~/.pmatrix/config.json: { "apiKey": "${PMATRIX_API_KEY}" }');
    console.log('');
  }

  console.log('Restart Claude Code to activate monitoring.');
  console.log('Dashboard: https://app.pmatrix.io');
  console.log('');
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildHookConfig(binaryPath: string): Record<string, ClaudeHookMatcher[]> {
  return {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} pre-tool-use`,
            timeout: 5,  // 5s — fail-open if exceeded
          },
        ],
      },
    ],
    PermissionRequest: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} permission-request`,
            timeout: 5,
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} session-start`,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} session-end`,
          },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} post-tool-use-failure`,
          },
        ],
      },
    ],
    SubagentStart: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} subagent-start`,
          },
        ],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} subagent-stop`,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} user-prompt-submit`,
            timeout: 5,  // 5s — credential scan is fast; fail-open if exceeded
          },
        ],
      },
    ],
    InstructionsLoaded: [
      {
        hooks: [
          {
            type: 'command',
            command: `${binaryPath} instructions-loaded`,
            // No timeout — async-only hook, does not block Claude Code execution
          },
        ],
      },
    ],
  };
}

function mergeHooks(
  existing: Record<string, ClaudeHookMatcher[]>,
  newHooks: Record<string, ClaudeHookMatcher[]>
): Record<string, ClaudeHookMatcher[]> {
  const result = { ...existing };

  for (const [event, matchers] of Object.entries(newHooks)) {
    if (!result[event]) {
      result[event] = matchers;
      continue;
    }

    // Check if pmatrix-cc hook already present
    const existingList = result[event]!;
    const alreadyInstalled = existingList.some((m) =>
      m.hooks.some((h) => h.command.includes('pmatrix-cc'))
    );

    if (!alreadyInstalled) {
      result[event] = [...existingList, ...matchers];
    }
    // If already installed, leave as-is (idempotent)
  }

  return result;
}

// ─── MCP server injection ─────────────────────────────────────────────────────

function mergeMcpServers(
  existing: Record<string, ClaudeMcpServerEntry>
): Record<string, ClaudeMcpServerEntry> {
  // Idempotent: only add if not already present
  if (existing['pmatrix']) return existing;

  return {
    ...existing,
    pmatrix: {
      command: 'pmatrix-cc',
      args: ['mcp'],
    },
  };
}

// ─── Skills copy ──────────────────────────────────────────────────────────────

/**
 * Copies skills/ → ~/.claude/skills/
 * Returns the number of skill directories successfully copied.
 * Fail-open: errors logged but do not abort setup.
 */
function copySkills(installDir: string): number {
  const skillsSource = path.join(installDir, 'skills');
  const skillsTarget = path.join(os.homedir(), '.claude', 'skills');

  if (!fs.existsSync(skillsSource)) {
    // Skills directory not found (dev environment or non-standard install)
    return 0;
  }

  let count = 0;

  try {
    fs.mkdirSync(skillsTarget, { recursive: true });

    const skillDirs = fs.readdirSync(skillsSource, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const skillName of skillDirs) {
      try {
        const src = path.join(skillsSource, skillName);
        const dst = path.join(skillsTarget, skillName);
        fs.mkdirSync(dst, { recursive: true });

        // Copy all files in the skill directory
        const files = fs.readdirSync(src);
        for (const file of files) {
          fs.copyFileSync(path.join(src, file), path.join(dst, file));
        }
        count += 1;
      } catch {
        // skip individual skill copy errors
      }
    }
  } catch {
    // fail-open
  }

  return count;
}

/**
 * Resolve the package install directory.
 * Works for both global npm install and npx/direct node invocations.
 */
function resolveInstallDir(): string {
  const scriptPath = process.argv[1] ?? '';
  // scriptPath is dist/index.js → go up one level to package root
  return path.dirname(path.dirname(path.resolve(scriptPath)));
}

function resolveBinaryPath(): string {
  const scriptPath = process.argv[1]; // this script

  if (scriptPath) {
    // If running as installed binary, use the binary name
    const binName = path.basename(scriptPath);
    if (binName === 'pmatrix-cc') {
      return 'pmatrix-cc';  // rely on PATH
    }

    // If running via npx or direct node invocation
    const distDir = path.dirname(scriptPath);
    const candidate = path.join(path.dirname(distDir), 'node_modules', '.bin', 'pmatrix-cc');
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: rely on PATH
  return 'pmatrix-cc';
}

function readJsonOrEmpty<T>(filePath: string): T {
  try {
    if (!fs.existsSync(filePath)) return {} as T;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function updatePMatrixConfig(updates: { agentId?: string; apiKey?: string }): void {
  const configPath = path.join(os.homedir(), '.pmatrix', 'config.json');
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const existing = readJsonOrEmpty<Record<string, unknown>>(configPath);

  if (updates.agentId) existing['agentId'] = updates.agentId;
  if (updates.apiKey)  existing['apiKey']  = updates.apiKey;

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(`  Saved config: ${configPath}`);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
