#!/bin/sh
# shot.sh — screenshot a page of the site with headless Chrome.
#
#   tools/shot.sh hw01/curve.html?curve=C1 [out.png] [width] [height]
#
# Headless Chrome races a page's ES modules: some runs paint the bare HTML
# before the modules have built anything, and no timing flag fixes it. So this
# works in two steps — dump the finished DOM, strip the scripts out of it, and
# photograph that. The second page has nothing left to run, so the shot is
# always of the complete page.

set -e
PATH_PART="${1:?usage: tools/shot.sh <path[?query]> [out.png] [width] [height]}"
OUT="${2:-/tmp/shot.png}"
W="${3:-1280}"
H="${4:-900}"
PORT=8777
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGE_PATH=${PATH_PART%%\?*}
DIR=$(dirname "$PAGE_PATH")
FROZEN="$DIR/_shot-$$.html"
cleanup() {
  rm -f "$FROZEN"
  [ -n "$STARTED" ] && pkill -f "http.server $PORT" >/dev/null 2>&1
  return 0
}
trap cleanup EXIT INT TERM

if ! curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  (python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  STARTED=1
  sleep 1
fi

# The dump races the modules too, so insist on evidence that they ran: the
# site header is built by JavaScript and cannot appear in the served HTML.
attempt=1
while [ "$attempt" -le 6 ]; do
  "$CHROME" --headless=new --disable-gpu --virtual-time-budget=15000 \
    --dump-dom "http://localhost:$PORT/$PATH_PART" 2>/dev/null \
    | python3 -c "
import re, sys
html = sys.stdin.read()
# the modules have already run; re-running them would duplicate the page
html = re.sub(r'<script\b.*?</script>', '', html, flags=re.S | re.I)
sys.stdout.write(html)
" > "$FROZEN"
  grep -q 'site-header' "$FROZEN" && break
  attempt=$((attempt + 1))
done

if ! grep -q 'site-header' "$FROZEN"; then
  echo "error: the page never finished rendering in $((attempt - 1)) attempts" >&2
  exit 1
fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --run-all-compositor-stages-before-draw --virtual-time-budget=5000 \
  --window-size="$W,$H" --screenshot="$OUT" \
  "http://localhost:$PORT/$FROZEN" 2>/dev/null

echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
