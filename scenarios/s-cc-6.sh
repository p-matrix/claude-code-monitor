#!/usr/bin/env bash
# =============================================================================
# S-CC-6 — Kill Switch 발동 경로
# Kill Switch trigger path — expected Grade: E → PermissionRequest interrupt
#
# 시퀀스:
#   SessionStart → PostToolUseFailure ×5 → [세션 상태 직접 halt 설정]
#               → PreToolUse(Bash) → BLOCK ✓
#               → PermissionRequest → deny + interrupt ✓
#               → SessionEnd
#
# 검증 포인트:
#   - PostToolUseFailure ×5: STABILITY 상승 (0.05 × 5 = 0.25)
#   - isHalted=true 후:
#     • PreToolUse: 모든 도구 BLOCK → { permissionDecision: "deny" }
#     • PermissionRequest: deny + interrupt: true → 세션 강제 종료
#   - Grade E 예상
#
# 주의: 실제 서버 R(t) ≥ 0.75 자동 도달은 서버 연동 필요.
#       이 스크립트는 세션 상태 파일을 직접 수정하여 서버 없이도 Kill Switch 동작 시연.
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node ${SCRIPT_DIR}/../dist/index.js"
SESSION_ID="demo-s-cc-6-$(date +%s)"

echo "[S-CC-6] Kill Switch 발동 경로 — session=${SESSION_ID}"
echo "------------------------------------------------------"

# 1. Session Start
echo "[1/9] SessionStart"
echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"${SESSION_ID}\",\"source\":\"ide\"}" \
  | ${CLI} session-start

# 2. PostToolUseFailure × 5 — STABILITY 급상승
for i in 1 2 3 4 5; do
  echo "[2.$i/9] PostToolUseFailure — dangerEvents 누적"
  echo "{\"hook_event_name\":\"PostToolUseFailure\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Bash\",\"tool_use_id\":\"tu-fail-${i}\"}" \
    | ${CLI} post-tool-use-failure
done

# 3. 세션 상태 파일 직접 수정 — Kill Switch 강제 트리거 (서버 없이 데모)
# 실제 환경: 서버가 R(t) ≥ 0.75 응답 → PreToolUse가 isHalted=true 설정
# BUG-2 fix: state-store.ts의 sessionFilePath()와 동일한 로직 사용
# SESSION_ID는 알파벳/숫자/-만 포함하므로 직접 사용 가능
STATE_FILE="${HOME}/.pmatrix/sessions/${SESSION_ID}.json"

if [ -f "${STATE_FILE}" ]; then
  echo "[3/9] Kill Switch 트리거 — 세션 상태 파일 수정: isHalted=true, currentRt=0.80"
  # Node.js로 JSON 수정 (jq 없어도 동작)
  node -e "
    const fs = require('fs');
    const state = JSON.parse(fs.readFileSync('${STATE_FILE}', 'utf-8'));
    state.isHalted = true;
    state.haltReason = 'R(t) 0.80 >= 0.75 (S-CC-6 demo)';
    state.currentRt = 0.80;
    state.currentMode = 'A-0';  // R(t) >= 0.75 → A-0 (Halt zone)
    fs.writeFileSync('${STATE_FILE}', JSON.stringify(state, null, 2));
    console.log('  State updated: isHalted=true currentRt=0.80');
  "
else
  echo "[3/9] ⚠️  State file not found: ${STATE_FILE}"
  echo "  (agentId 미설정 시 상태 파일이 생성되지 않을 수 있음)"
fi

# 4. PreToolUse(Bash) — HALT 상태 → 즉시 BLOCK
echo "[4/9] PreToolUse(Bash) — isHalted=true → BLOCK 예상"
BLOCK_RESULT=$(echo "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Bash\",\"tool_use_id\":\"tu-halt-1\"}" \
  | ${CLI} pre-tool-use 2>&1 || true)
echo "  → ${BLOCK_RESULT}"

# 5. PreToolUse(Write) — HALT 상태 → 즉시 BLOCK
echo "[5/9] PreToolUse(Write) — isHalted=true → BLOCK 예상"
BLOCK_RESULT2=$(echo "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Write\",\"tool_use_id\":\"tu-halt-2\"}" \
  | ${CLI} pre-tool-use 2>&1 || true)
echo "  → ${BLOCK_RESULT2}"

# 6. PermissionRequest — HALT 상태 → deny + interrupt
echo "[6/9] PermissionRequest — isHalted=true → deny + interrupt 예상"
INTERRUPT_RESULT=$(echo "{\"hook_event_name\":\"PermissionRequest\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Bash\"}" \
  | ${CLI} permission-request 2>&1 || true)
echo "  → ${INTERRUPT_RESULT}"

# 7. Session End
echo "[7/9] SessionEnd"
echo "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"${SESSION_ID}\",\"end_reason\":\"killed\"}" \
  | ${CLI} session-end

echo ""
echo "✓ S-CC-6 완료 — Kill Switch 발동 경로 시연 완료"
echo "  예상 결과 확인:"
echo "    • PreToolUse:       { permissionDecision: 'deny', permissionDecisionReason: 'HALT: ...' }"
echo "    • PermissionRequest: { decision: { behavior: 'deny', interrupt: true } }"
echo "  Dashboard: https://app.pmatrix.io"
