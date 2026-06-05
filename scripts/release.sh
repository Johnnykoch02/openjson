#!/usr/bin/env bash
# Bump version, commit, tag, and push to trigger the GitHub release workflow.
#
# Usage:
#   ./scripts/release.sh              # bump patch (0.1.2 -> 0.1.3)
#   ./scripts/release.sh 0.2.0        # explicit version
#   ./scripts/release.sh --dry-run    # show what would happen
#
# Requires: git, gh (logged in), clean working tree on main.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "Unexpected argument: $arg" >&2
        exit 1
      fi
      VERSION="$arg"
      ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ $*"
  else
    "$@"
  fi
}

command -v git >/dev/null || die "git not found"
command -v gh >/dev/null || die "gh CLI not found (install: https://cli.github.com)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "main" ]] || die "must be on main (currently on $BRANCH)"

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is not clean — commit or stash changes first"
fi

latest_tag="$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
current="$(node -p "require('./package.json').version")"

if [[ -z "$VERSION" ]]; then
  if [[ -n "$latest_tag" ]]; then
    base="${latest_tag#v}"
    IFS=. read -r major minor patch <<< "$base"
    VERSION="${major}.${minor}.$((patch + 1))"
  else
    VERSION="$current"
  fi
fi

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be semver X.Y.Z (got: $VERSION)"

TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists locally"
fi

if git ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
  die "tag $TAG already exists on origin"
fi

echo "Release plan:"
echo "  package version : $current -> $VERSION"
echo "  tag             : $TAG"
echo "  branch          : $BRANCH"
echo "  latest tag      : ${latest_tag:-<none>}"
echo ""
echo "After push, .github/workflows/release.yml builds draft installers."
echo ""

bump_file() {
  local file="$1"
  local pattern="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ bump $file -> $VERSION"
  else
    sed -i "s/${pattern}/${VERSION}/" "$file"
  fi
}

bump_file package.json '"version": "[0-9.]\+"' '"version": "'"$VERSION"'"'
bump_file src-tauri/tauri.conf.json '"version": "[0-9.]\+"' '"version": "'"$VERSION"'"'
bump_file src-tauri/Cargo.toml '^version = "[0-9.]\+"' 'version = "'"$VERSION"'"'
bump_file crates/json-vis-core/Cargo.toml '^version = "[0-9.]\+"' 'version = "'"$VERSION"'"'

if [[ "$DRY_RUN" -eq 0 ]]; then
  (cd src-tauri && cargo check -q)
fi

run git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml crates/json-vis-core/Cargo.toml Cargo.lock
run git commit -m "chore: release ${TAG}"
run git tag -a "$TAG" -m "OpenJSON ${TAG}"
run git push origin "$BRANCH"
run git push origin "$TAG"

echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run complete."
else
  echo "Pushed ${TAG}. Watch the release workflow:"
  gh run list --workflow=release.yml --limit 3
  echo ""
  echo "Draft release (when CI finishes):"
  echo "  gh release view ${TAG} --web"
fi
