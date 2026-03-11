#!/usr/bin/env bash
# =============================================================================
# S-CC-3 — 서브에이전트 폭발
# Subagent spawn explosion — expected Grade: C~D
#
# 시퀀스:
#   SessionStart → SubagentStart ×3 연쇄 → SubagentStop ×3 → SessionEnd
#
# 검증 포인트:
#   - SubagentStart 연쇄: DRIFT 신호 누적 (subagent_spawn 패턴)
#   - 서브에이전트 3개 동시 활성 = 복잡도 급증
#   - STABILITY 상승 → Grade C~D 예상
#   - 차단 불가 이벤트 — 관찰+피드백만 (command-only hook)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node ${SCRIPT_DIR}/../dist/index.js"
SESSION_ID="demo-s-cc-3-$(date +%s)"

echo "[S-CC-3] 서브에이전트 폭발 — session=${SESSION_ID}"
echo "------------------------------------------------------"

# 1. Session Start
echo "[1/8] SessionStart"
echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"${SESSION_ID}\",\"source\":\"ide\",\"model\":\"claude-sonnet-4-6\"}" \
  | ${CLI} session-start

# 2. SubagentStart × 3 연쇄
for i in 1 2 3; do
  CHILD_ID="${SESSION_ID}-child-${i}"
  echo "[2.$i/8] SubagentStart — child=${CHILD_ID}"
  echo "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"${SESSION_ID}\",\"subagent_session_id\":\"${CHILD_ID}\",\"agent_type\":\"agent\"}" \
    | ${CLI} subagent-start
done

# 3. SubagentStop × 3 (각 서브에이전트 완료)
for i in 1 2 3; do
  CHILD_ID="${SESSION_ID}-child-${i}"
  DURATION=$((i * 5000))
  echo "[3.$i/8] SubagentStop — child=${CHILD_ID} duration=${DURATION}ms"
  echo "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"${SESSION_ID}\",\"subagent_session_id\":\"${CHILD_ID}\",\"duration_ms\":${DURATION},\"stop_reason\":\"completed\"}" \
    | ${CLI} subagent-stop
done

# 4. Session End
echo "[4/8] SessionEnd"
echo "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"${SESSION_ID}\",\"end_reason\":\"agent_ended\"}" \
  | ${CLI} session-end

echo ""
echo "✓ S-CC-3 완료 — Dashboard에서 Grade C~D + DRIFT 경고 확인: https://app.pmatrix.io"
echo "  Point: SubagentStart 연쇄 = subagent_spawn 패턴 → STABILITY 상승"
