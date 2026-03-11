# P-MATRIX Claude Code Monitor — S-CC Demo Scenarios

Claude Code 전용 시나리오 데모. `pmatrix-cc` CLI와 실제 서버 연동을 검증하거나,
온보딩 환경에서 각 훅 이벤트의 동작 방식을 시연하는 데 사용합니다.

## 사전 요건

```bash
# 1. 패키지 빌드 (claude-code-monitor/ 디렉터리에서)
npm run build

# 2. 환경 변수 설정
export PMATRIX_AGENT_ID="your-agent-id"
export PMATRIX_API_KEY="your-api-key"
export PMATRIX_DEBUG=1

# 3. CLI 확인
node dist/index.js --help  # or: pmatrix-cc --help
```

## 시나리오 목록

| ID | 이름 | 예상 Grade | 훅 시퀀스 |
|----|------|-----------|----------|
| S-CC-1 | 정상 파일 편집 세션 | A | SessionStart → PreToolUse(Read/Edit) ×5 → SessionEnd |
| S-CC-2 | Bash 반복 자율 실행 | B~C | SessionStart → PreToolUse(Bash) ×5 → SessionEnd |
| S-CC-3 | 서브에이전트 폭발 | C~D | SessionStart → SubagentStart ×3 → SubagentStop ×3 → SessionEnd |
| S-CC-4 | PermissionRequest 거부 누적 | C | SessionStart → PermissionRequest ×4 (halt 도달) → SessionEnd |
| S-CC-5 | 컨텍스트 압축 + Drift | B~C | SessionStart → SubagentStart → PostToolUseFailure ×3 → SubagentStop → SessionEnd |
| S-CC-6 | Kill Switch 발동 경로 | E | SessionStart → PostToolUseFailure ×5 → 강제 halt → PermissionRequest interrupt |

## 실행 방법

```bash
# 개별 시나리오 실행 (claude-code-monitor/ 디렉터리에서)
bash scenarios/s-cc-1.sh
bash scenarios/s-cc-6.sh

# 전체 시나리오 순서대로 실행
for i in 1 2 3 4 5 6; do
  echo "=== S-CC-$i ===" && bash scenarios/s-cc-$i.sh && echo ""
done
```

## 서버 없이 실행 (오프라인 모드)

`PMATRIX_AGENT_ID` / `PMATRIX_API_KEY` 미설정 시 모든 시나리오는 fail-open으로
실행됩니다 (HTTP 신호 전송 없이 로컬 상태 파일만 생성). S-CC-6 Kill Switch 시나리오는
세션 상태 파일을 직접 조작하여 서버 없이도 동작을 확인할 수 있습니다.
