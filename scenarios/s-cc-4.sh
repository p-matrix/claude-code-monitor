#!/usr/bin/env bash
# =============================================================================
# S-CC-4 — PermissionRequest 거부 누적
# PermissionRequest deny accumulation — expected Grade: C
#
# 시퀀스:
#   SessionStart → PermissionRequest ×4 → [3회차: R(t) 상승 후 deny+interrupt] → SessionEnd
#
# 검증 포인트:
#   - PermissionRequest 빈도 = META_CONTROL 상승 (meta_control: 0.02 × 4 = 0.08)
#   - 4회 반복 후 서버 R(t) 상승 시 deny+interrupt 발화
#   - Grade C 예상 (META_CONTROL 주도)
#   - 2차 Kill Switch 경로 동작 시연
#
# 참고: PermissionRequest deny+interrupt는 R(t) ≥ 0.75 또는 isHalted=true 시 발화.
#       실제 서버 연동 없이는 allow 응답이 나올 수 있음 (fail-open 정상 동작).
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node ${SCRIPT_DIR}/../dist/index.js"
SESSION_ID="demo-s-cc-4-$(date +%s)"

echo "[S-CC-4] PermissionRequest 거부 누적 — session=${SESSION_ID}"
echo "------------------------------------------------------"

# 1. Session Start
echo "[1/6] SessionStart"
echo "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"${SESSION_ID}\",\"source\":\"ide\"}" \
  | ${CLI} session-start

# 2. PermissionRequest × 4 — META_CONTROL 빈도 측정
for i in 1 2 3 4; do
  echo "[2.$i/6] PermissionRequest (count=$i)"
  RESULT=$(echo "{\"hook_event_name\":\"PermissionRequest\",\"session_id\":\"${SESSION_ID}\",\"tool_name\":\"Bash\"}" \
    | ${CLI} permission-request)
  echo "  → ${RESULT}"
done

# 3. Session End
echo "[3/6] SessionEnd"
echo "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"${SESSION_ID}\",\"end_reason\":\"user_ended\"}" \
  | ${CLI} session-end

echo ""
echo "✓ S-CC-4 완료 — Dashboard에서 META_CONTROL 상승 확인: https://app.pmatrix.io"
echo "  Point: PermissionRequest ×4 = meta_control 0.08 누적 → Grade C 방향"
echo ""
echo "  [Kill Switch 시연] 서버 R(t) ≥ 0.75 도달 시 다음 PermissionRequest에서"
echo "  { behavior: 'deny', interrupt: true } 응답 → 세션 강제 종료"
echo "  → S-CC-6에서 Kill Switch 전체 경로 확인 가능"
