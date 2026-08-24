#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CERTIFICATION_HOST:-}" ]]; then
  : "${DIAGNOSTICS_OUTPUT:=certification-diagnostics.json}"
  REQUESTED_MODEL="${REQUESTED_MODEL:-qwencoder/qwen3.7-max}" \
    DIAGNOSTICS_OUTPUT="$DIAGNOSTICS_OUTPUT" npx --no-install tsx automation/local-certification-diagnostics.ts
  exit 78
fi

: "${CERTIFICATION_COMMIT_SHA:?CERTIFICATION_COMMIT_SHA is required}"
: "${HOST_ATTESTATION_FILE:?HOST_ATTESTATION_FILE is required}"

node automation/certification-ci.mjs certification-validate
