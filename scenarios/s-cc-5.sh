#!/usr/bin/env bash
# =============================================================================
# S-CC-5 — 대형 컨텍스트 압축 + Drift
# Large context compaction + Drift — expected Grade: B~C
#
# 시퀀스:
#   SessionStart → SubagentStart → PostToolUseFailure ×3 → SubagentStop(large delta) → SessionEnd
#
# 검증 포인트:
#   - PostToolUseFailure 연속: STABILITY 상승 (0.05 × 3 = 0.15)
#   - SubagentStop large duration_ms = Drift delta 큼
#   - STABILITY + DRIFT 복합 패턴 → Grade B~C 예상
#   - 참고: PreCompact 훅은 현재 미구현 (v2에서 추가 예정)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node ${SCRIPT_DIR}/../dist/index.js"
SESSION_ID="demo-s-cc-5-$(date +%s)"
CHILD_ID="${SESSION_ID}-child-1"

echo "[S-CC-5] 대형 컨텍스트 압축 + Drift — session=${SESSION_ID}"
echo "------------------------------------------------------"

# 1. Session Start
echo "[1/6] SessionStart"
echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"${SESSION_ID}\",\"source\":\"ide\"}" \
  | ${CLI} session-start

# 2. SubagentStart (대형 컨텍스트 처리용 서브에이전트)
echo "[2/6] SubagentStart"
echo "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"${SESSION_ID}\",\"subagent_session_id\":\"${CHILD_ID}\",\"agent_type\":\"agent\"}" \
  | ${CLI} subagent-start

# 3. PostToolUseFailure × 3 — STABILITY 상승 (compaction 중 도구 실패 패턴)
for i in 1 2 3; do
  echo "[3.$i/6] PostToolUseFailure — tool=Write (compaction 중 실패)"
  echo "{\"hook_event_name\":\"PostToolUseFailure\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Write\",\"tool_use_id\":\"tu-write-${i}\"}" \
    | ${CLI} post-tool-use-failure
done

# 4. SubagentStop — large duration (컨텍스트 압축 완료, 장시간 소요)
echo "[4/6] SubagentStop — duration=120000ms (2분, drift delta 큼)"
echo "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"${SESSION_ID}\",\"subagent_session_id\":\"${CHILD_ID}\",\"duration_ms\":120000,\"stop_reason\":\"compaction_complete\"}" \
  | ${CLI} subagent-stop

# 5. Session End
echo "[5/6] SessionEnd"
echo "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"${SESSION_ID}\",\"end_reason\":\"agent_ended\"}" \
  | ${CLI} session-end

echo ""
echo "✓ S-CC-5 완료 — Dashboard에서 STABILITY + Drift 복합 확인: https://app.pmatrix.io"
echo "  Point: PostToolUseFailure ×3 (stability +0.15) + SubagentStop 120s (drift) → Grade B~C"
