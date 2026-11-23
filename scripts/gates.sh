#!/usr/bin/env bash
# Runs the five gate steps in the Suites table order: typecheck, test, build, test:pages (build before page tests), gate and prints a count.
# `paint-kit gate --all` exists from Task 4; until then that step fails.
set -u
cd "$(dirname "$0")/.."
pass=0; fail=0
step() { echo "== $*"; if "$@"; then pass=$((pass+1)); else fail=$((fail+1)); fi; }
step pnpm typecheck
step pnpm test
step pnpm build
step pnpm test:pages
step node dist/src/cli/paint-kit.js gate --all
echo "gates: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
