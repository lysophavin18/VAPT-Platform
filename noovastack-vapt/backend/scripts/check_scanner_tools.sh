#!/usr/bin/env bash
# Verifies every scanner binary in the backend image is installed and executable,
# and prints a Markdown table of installed versions. Exits non-zero if any tool is broken.
set -u

TOOLS=(
  "nuclei|nuclei -version"
  "subfinder|subfinder -version"
  "httpx-pd|httpx-pd -version"
  "dnsx|dnsx -version"
  "katana|katana -version"
  "naabu|naabu -version"
  "ffuf|ffuf -V"
  "gobuster|gobuster --version"
  "dalfox|dalfox version"
  "depx|depx --version"
  "trivy|trivy --version"
  "grype|grype version"
  "nikto|nikto -Version"
  "testssl.sh|testssl.sh --version"
  "wapiti|wapiti --version"
  "bandit|bandit --version"
  "pip-audit|pip-audit --version"
  "semgrep|semgrep --version"
  "nmap|nmap --version"
  "sqlmap|sqlmap --version"
  "sslscan|sslscan --version"
  "whatweb|whatweb --version"
)

failed=0
echo "| Tool | Status | Version output |"
echo "|------|--------|----------------|"
for entry in "${TOOLS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "| $name | MISSING | - |"
    failed=1
    continue
  fi
  out=$(timeout 60 $cmd 2>&1 < /dev/null | sed 's/\x1b\[[0-9;]*m//g')
  code=${PIPESTATUS[0]}
  # 124 = timeout, 126/127 = not executable / missing shared lib
  if [ "$code" -eq 124 ] || [ "$code" -eq 126 ] || [ "$code" -eq 127 ]; then
    echo "| $name | BROKEN (exit $code) | $(echo "$out" | head -1 | tr '|' '/') |"
    failed=1
    continue
  fi
  # Some tools (nikto, testssl.sh) report missing dependencies but still exit 0
  err=$(echo "$out" | grep -Ei "required module not found|missing dependencies|can't locate|fatal error|command not found|no such file|error while loading shared" | head -1)
  if [ -n "$err" ]; then
    echo "| $name | BROKEN | $(echo "$err" | tr '|' '/') |"
    failed=1
    continue
  fi
  version=$(echo "$out" | grep -iv '^warning' | grep -Eio 'v?[0-9]+\.[0-9]+(\.[0-9]+)?[^ ]*' | head -1)
  echo "| $name | OK | ${version:-$(echo "$out" | head -1 | tr '|' '/')} |"
done

exit "$failed"
