#!/usr/bin/env bash

# Shared helpers for VPS scripts.

vps_expand_path() {
  local p="$1"
  if [[ "${p}" == "~" ]]; then
    printf '%s\n' "${HOME}"
    return
  fi
  if [[ "${p}" == "~/"* ]]; then
    printf '%s\n' "${HOME}/${p#~/}"
    return
  fi
  printf '%s\n' "${p}"
}

vps_require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: required command '$1' is not installed." >&2
    return 1
  }
}

vps_repo_root_from_script_dir() {
  local script_dir="$1"
  (cd "${script_dir}/../.." && pwd)
}

vps_resolve_host() {
  local host="$1"
  local root_dir="$2"
  local env_name="$3"

  if [[ -z "${host}" ]]; then
    local ip_file="${root_dir}/.vps/${env_name}.ip"
    if [[ -f "${ip_file}" ]]; then
      host="$(tr -d '[:space:]' < "${ip_file}")"
    fi
  fi

  if [[ -z "${host}" ]]; then
    echo "Error: SSH host is not set. Use --host or create .vps/${env_name}.ip" >&2
    return 1
  fi

  printf '%s\n' "${host}"
}

vps_resolve_key_path() {
  local key_path="$1"
  local env_name="$2"

  if [[ -z "${key_path}" ]]; then
    if [[ -f "${HOME}/.ssh/deploy_${env_name}" ]]; then
      key_path="${HOME}/.ssh/deploy_${env_name}"
    elif [[ -f "${HOME}/.ssh/id_rsa" ]]; then
      key_path="${HOME}/.ssh/id_rsa"
    else
      # No explicit key file found. Allow SSH agent-based auth.
      printf '\n'
      return 0
    fi
  fi

  key_path="$(vps_expand_path "${key_path}")"
  if [[ ! -f "${key_path}" ]]; then
    echo "Error: SSH key not found at '${key_path}'" >&2
    return 1
  fi

  printf '%s\n' "${key_path}"
}
