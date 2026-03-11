---
name: pmatrix-status
description: Show current P-MATRIX safety grade, R(t) risk score, mode, and session counters for this Claude Code session
user-invocable: true
allowed-tools: mcp__pmatrix__pmatrix_status
---

Call the pmatrix_status MCP tool and display the result.

Show Grade (A-E), R(t) risk score, current mode (Normal/Caution/Alert/Critical/Halt), 4-axis values, and session counters (prompt turns, safety gate blocks, credential blocks, subagent spawns).

If HALT is active, clearly indicate that all tool calls are blocked and show how to resume.
