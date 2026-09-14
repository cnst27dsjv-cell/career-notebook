#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
backup_path="storage/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_path"
docker compose exec -T db pg_dump -U career -Fc career > "$backup_path/database.dump"
python3 - "$backup_path" <<'PY'
from pathlib import Path
import sys,tarfile
with tarfile.open(Path(sys.argv[1])/'files.tar.gz','w:gz') as archive:
 for p in Path('storage').iterdir():
  if p.is_file() and p.name!='.gitkeep': archive.add(p,arcname=p.name)
PY
printf 'Backup created: %s\n' "$backup_path"
