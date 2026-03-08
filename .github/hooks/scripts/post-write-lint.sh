#!/usr/bin/env bash
# Runs `bun ultracite fix` after any file write/edit tool call.
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
    echo "🔧 [post-write-lint] Running ultracite fix after $TOOL" >&2
    bun ultracite fix
    ;;
  *)
    # Non-write tool — skip
    ;;
esac
