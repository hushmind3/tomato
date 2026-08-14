#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/backups"
ARCHIVE="$BACKUP_DIR/tomato-source-$STAMP.zip"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
zip -r "$ARCHIVE" . \
  -x "node_modules/*" ".next/*" "backups/*" ".env" ".env.*" "!.env.example" ".git/*" >/dev/null
echo "$ARCHIVE"
