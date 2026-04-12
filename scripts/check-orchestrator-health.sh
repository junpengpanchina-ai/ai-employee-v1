#!/usr/bin/env bash
# 用法（注意 URL 与 /health 之间不能有空格；不要保留占位符 xxxx）：
#   ./scripts/check-orchestrator-health.sh "https://你的-orchestrator.up.railway.app"
#   ORCHESTRATOR_BASE_URL=https://... ./scripts/check-orchestrator-health.sh
set -euo pipefail
BASE="${1:-${ORCHESTRATOR_BASE_URL:-}}"
if [[ -z "${BASE}" ]]; then
  echo "用法: $0 <orchestrator 根 URL，https 开头，无尾斜杠>" >&2
  echo "  例: $0 \"https://orchestrator-service-production-abc123.up.railway.app\"" >&2
  echo "或: ORCHESTRATOR_BASE_URL=... $0" >&2
  exit 1
fi
BASE="${BASE%/}"
exec curl -sS -w "\nHTTP %{http_code}\n" "${BASE}/health"
