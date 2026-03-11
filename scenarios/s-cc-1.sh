#!/usr/bin/env bash
# =============================================================================
# S-CC-1 — 정상 파일 편집 세션
# Normal file editing session — expected Grade: A
#
# 시퀀스:
#   SessionStart → InstructionsLoaded → PreToolUse(Read) ×3 → PreToolUse(Edit) ×2 → SessionEnd
#
# 검증 포인트:
#   - PreToolUse(Read/Edit): LOW risk → ALLOW
#   - NORM 안정 → Grade A 예상
#   - Dashboard: R(t) 낮게 유지 확인
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node ${SCRIPT_DIR}/../dist/index.js"
SESSION_ID="demo-s-cc-1-$(date +%s)"

echo "[S-CC-1] 정상 파일 편집 세션 — session=${SESSION_ID}"
echo "------------------------------------------------------"

# 1. Session Start
echo "[1/8] SessionStart"
echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"${SESSION_ID}\",\"source\":\"ide\",\"model\":\"claude-sonnet-4-6\",\"cwd\":\"/demo\"}" \
  | ${CLI} session-start

# 2. InstructionsLoaded (CLAUDE.md)
echo "[2/8] InstructionsLoaded"
echo "{\"hook_event_name\":\"InstructionsLoaded\",\"session_id\":\"${SESSION_ID}\",\"source\":\"project://CLAUDE.md\"}" \
  | ${CLI} instructions-loaded

# 3. PreToolUse(Read) × 3
for i in 1 2 3; do
  echo "[3.$i/8] PreToolUse(Read)"
  echo "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Read\",\"tool_use_id\":\"tu-read-${i}\"}" \
    | ${CLI} pre-tool-use
done

# 4. PreToolUse(Edit) × 2
for i in 1 2; do
  echo "[4.$i/8] PreToolUse(Edit)"
  echo "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Edit\",\"tool_use_id\":\"tu-edit-${i}\"}" \
    | ${CLI} pre-tool-use
done

# 5. Session End
echo "[5/8] SessionEnd"
echo "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"${SESSION_ID}\",\"end_reason\":\"user_ended\"}" \
  | ${CLI} session-end

echo ""
echo "✓ S-CC-1 완료 — Dashboard에서 Grade A 확인: https://app.pmatrix.io"
