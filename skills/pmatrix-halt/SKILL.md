---
name: pmatrix-halt
description: Immediately halt all P-MATRIX monitored tool execution across all Claude Code sessions on this machine
user-invocable: true
allowed-tools: mcp__pmatrix__pmatrix_halt
---

Call the pmatrix_halt MCP tool to activate the global Kill Switch.

This creates ~/.pmatrix/HALT, which causes all PreToolUse and PermissionRequest hooks to immediately block tool calls — across ALL Claude Code sessions on this machine.

To resume normal operation: rm ~/.pmatrix/HALT

Optionally accept a reason parameter from the user to log with the HALT activation.
