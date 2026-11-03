#!/usr/bin/env bash
set -Eeuo pipefail

# Paw Haven -> https://github.com/pexpelit-pixel/pawheaven
# Usage:
#   bash push.sh
#   bash push.sh "Your commit message"
#   bash push.sh --no-checks "Quick commit message"

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

readonly REPO_URL="https://github.com/pexpelit-pixel/pawheaven.git"
readonly EXPECTED_SSH_URL="git@github.com:pexpelit-pixel/pawheaven.git"
readonly EXPECTED_SSH_URL_ALT="ssh://git@github.com/pexpelit-pixel/pawheaven.git"
readonly TARGET_BRANCH="main"

SKIP_CHECKS=0
if [[ "${1:-}" == "--no-checks" ]]; then
  SKIP_CHECKS=1
  shift
fi
COMMIT_MESSAGE="${1:-Update Paw Haven}"

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "Git belum terpasang."

# Initialize this project if it has not been initialized yet.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '[INFO] Git repository belum ada. Menginisialisasi branch %s...\n' "$TARGET_BRANCH"
  git init
  git branch -M "$TARGET_BRANCH"
fi

GIT_ROOT="$(git rev-parse --show-toplevel)"
[[ "$(cd "$GIT_ROOT" && pwd -P)" == "$(pwd -P)" ]] || fail "Folder proyek berada di dalam Git repository lain: $GIT_ROOT"

# Never silently push this project to an unrelated remote.
if git remote get-url origin >/dev/null 2>&1; then
  CURRENT_REMOTE="$(git remote get-url origin)"
  case "$CURRENT_REMOTE" in
    "$REPO_URL"|"https://github.com/pexpelit-pixel/pawheaven"|"$EXPECTED_SSH_URL"|"$EXPECTED_SSH_URL_ALT")
      ;;
    *)
      fail "Remote origin berbeda dari target Paw Haven: $CURRENT_REMOTE"
      ;;
  esac
else
  printf '[INFO] Menambahkan remote origin: %s\n' "$REPO_URL"
  git remote add origin "$REPO_URL"
fi

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  command -v npm >/dev/null 2>&1 || fail "npm tidak ditemukan. Gunakan --no-checks untuk melewati pemeriksaan."
  printf '\n[1/4] Menjalankan pemeriksaan proyek...\n'
  printf '\n[2/4] Membuat production build...\n'
  npm run build
else
  printf '\n[INFO] Pemeriksaan dan build dilewati (--no-checks).\n'
fi

printf '\n[3/4] Menyiapkan perubahan Git...\n'
# Local dependencies, reference audio, backups, and the MatCaps archive stay local.
git add -A -- . \
  ':(exclude)node_modules/**' \
  ':(exclude)referensisuara/**' \
  ':(exclude)backups/**' \
  ':(exclude)matcaps.zip'

git diff --cached --check || fail "Ada whitespace error pada perubahan staged."
git diff --cached --stat

if ! git diff --cached --quiet; then
  printf '\nPesan commit: %s\n' "$COMMIT_MESSAGE"
  git commit -m "$COMMIT_MESSAGE"
else
  printf '\n[INFO] Tidak ada perubahan baru untuk di-commit.\n'
fi

printf '\n[4/4] Push ke branch %s...\n' "$TARGET_BRANCH"
printf '[INFO] Autentikasi memakai Git Credential Manager atau gh auth setup-git. Token tidak disimpan di script.\n'
git push --set-upstream origin "HEAD:$TARGET_BRANCH"

printf '\n[SUCCESS] Push selesai: %s (%s)\n' "$REPO_URL" "$TARGET_BRANCH"
