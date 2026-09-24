#!/usr/bin/env bash

set -Eeuo pipefail

readonly target_branch="main"
readonly source_branch="$(git symbolic-ref --quiet --short HEAD || true)"

if [[ -z "$source_branch" ]]; then
  printf 'Error: this repository is in detached HEAD state.\n' >&2
  exit 1
fi

if [[ "$source_branch" == "$target_branch" ]]; then
  git push origin "$target_branch"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Error: working tree must be clean before merging %s into %s.\n' \
    "$source_branch" "$target_branch" >&2
  exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/$target_branch"; then
  printf 'Error: local branch %s does not exist.\n' "$target_branch" >&2
  exit 1
fi

return_to_source() {
  if [[ "$(git branch --show-current)" != "$source_branch" ]]; then
    git switch "$source_branch" >/dev/null
  fi
}

trap return_to_source EXIT

git switch "$target_branch"
if ! git merge "$source_branch"; then
  git merge --abort >/dev/null 2>&1 || true
  exit 1
fi
git push origin "$target_branch"
