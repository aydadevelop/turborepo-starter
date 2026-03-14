#!/usr/bin/env bash
# Runs oxfmt + oxlint --fix after any file write/edit tool call.
# Input: JSON piped from the agent with toolName and toolArgs.

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.toolName // empty' 2>/dev/null || true)

case "$TOOL" in
  create_file \
  | replace_string_in_file \
  | multi_replace_string_in_file \
  | edit_notebook_file \
  | str_replace_based_edit_tool \
  | write_file)
    echo "🔧 [post-write-lint] Running oxfmt + oxlint --fix after $TOOL" >&2
    bunx oxfmt . && bunx oxlint --fix apps/ packages/
    ;;
  *)
    # Non-write tool — skip
    ;;
esac
