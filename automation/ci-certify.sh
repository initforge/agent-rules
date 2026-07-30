#!/usr/bin/env bash
set -euo pipefail

: "${CERTIFICATION_HOST:?CERTIFICATION_HOST is required}"
: "${CERTIFICATION_COMMIT_SHA:?CERTIFICATION_COMMIT_SHA is required}"
: "${HOST_ATTESTATION_FILE:?HOST_ATTESTATION_FILE is required}"

node automation/control-plane-ci.mjs certification-validate
