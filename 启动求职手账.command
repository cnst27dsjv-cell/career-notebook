#!/bin/zsh
cd "$(dirname "$0")"
node --env-file=.env scripts/run-local.mjs
