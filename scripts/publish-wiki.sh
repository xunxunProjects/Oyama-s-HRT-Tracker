#!/usr/bin/env bash
# Publish the versioned wiki/ pages to the GitHub wiki.
#
#   scripts/publish-wiki.sh            # publish
#   scripts/publish-wiki.sh --check    # only check that the wiki repo exists
#   scripts/publish-wiki.sh --dry-run  # clone and show the pending diff
#
# The wiki git repository only exists after the first page has been saved in
# the web UI once. This script detects that case and prints the exact steps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="push"
for arg in "$@"; do
    case "$arg" in
        --check) MODE="check" ;;
        --dry-run) MODE="dry-run" ;;
        -h|--help)
            sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "publish-wiki: unknown argument: $arg" >&2
            exit 2
            ;;
    esac
done

if [ ! -f "$ROOT/wiki/Home.md" ]; then
    echo "publish-wiki: missing $ROOT/wiki/Home.md" >&2
    exit 1
fi

if [ -n "${WIKI_URL:-}" ]; then
    :
else
    # Prefer the canonical upstream remote over a personal fork.
    REPO_URL="$(git -C "$ROOT" remote get-url upstream 2>/dev/null || true)"
    if [ -z "$REPO_URL" ]; then
        REPO_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
    fi
    if [ -z "$REPO_URL" ]; then
        echo "publish-wiki: no upstream or origin remote; set WIKI_URL" >&2
        exit 1
    fi
    WIKI_URL="${REPO_URL%.git}.wiki.git"
fi

WEB_URL=""
case "$WIKI_URL" in
    git@github.com:*) WEB_URL="https://github.com/${WIKI_URL#git@github.com:}" ;;
    https://github.com/*) WEB_URL="$WIKI_URL" ;;
    ssh://git@github.com/*) WEB_URL="https://github.com/${WIKI_URL#ssh://git@github.com/}" ;;
esac
if [ -n "$WEB_URL" ]; then
    WEB_URL="${WEB_URL%.wiki.git}/wiki"
fi

if ! git ls-remote "$WIKI_URL" >/dev/null 2>&1; then
    cat >&2 <<EOF
publish-wiki: the wiki repository is not initialized:
  $WIKI_URL

GitHub creates the wiki git repository only after the first page is saved in
the web UI. gh has no API for this one-time step.

1. Open ${WEB_URL:-the repository wiki page}
2. Click "Create the first page".
3. Set the title to "Home" and save any minimal body.
4. Re-run: $0

Manual fallback (after step 3):
  tmp="\$(mktemp -d)"
  git clone "$WIKI_URL" "\$tmp/wiki"
  find "\$tmp/wiki" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a "$ROOT/wiki/." "\$tmp/wiki/"
  git -C "\$tmp/wiki" add -A
  git -C "\$tmp/wiki" commit -m "docs(wiki): sync from $(git -C "$ROOT" rev-parse --short HEAD)"
  git -C "\$tmp/wiki" push origin "\$(git -C "\$tmp/wiki" symbolic-ref --short HEAD)"
EOF
    exit 1
fi

if [ "$MODE" = "check" ]; then
    echo "publish-wiki: wiki repository reachable: $WIKI_URL"
    exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "publish-wiki: cloning $WIKI_URL"
git clone --quiet "$WIKI_URL" "$TMP/wiki"

find "$TMP/wiki" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$ROOT/wiki/." "$TMP/wiki/"
git -C "$TMP/wiki" add -A

if git -C "$TMP/wiki" diff --cached --quiet; then
    echo "publish-wiki: wiki is already up to date"
    exit 0
fi

if [ "$MODE" = "dry-run" ]; then
    git -C "$TMP/wiki" diff --cached --stat
    git -C "$TMP/wiki" diff --cached | head -200
    exit 0
fi

NAME="$(git -C "$ROOT" config user.name || true)"
EMAIL="$(git -C "$ROOT" config user.email || true)"
NAME="${NAME:-hrt-tracker wiki}"
EMAIL="${EMAIL:-noreply@localhost}"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$TMP/wiki" -c user.name="$NAME" -c user.email="$EMAIL" \
    commit --quiet -m "docs(wiki): sync from $SHA"
BRANCH="$(git -C "$TMP/wiki" symbolic-ref --short HEAD)"
echo "publish-wiki: pushing to $BRANCH"
git -C "$TMP/wiki" push --quiet origin "$BRANCH"
echo "publish-wiki: published $WEB_URL"
