#!/bin/bash
# Helper to run pnpm since it's not in system PATH
# Usage: bash pnpm.sh install / bash pnpm.sh add <package> / etc.
PNPM="C:/Users/Avner/AppData/Local/pnpm/global/v11/830c-19e030e4de9/node_modules/.bin/pnpm"
bash "$PNPM" "$@"
