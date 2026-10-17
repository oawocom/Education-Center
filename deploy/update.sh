#!/bin/bash
# Brings the server up to date with GitHub's main: when main has a commit the server
# has not deployed yet, it is checked out and the stack is rebuilt. The timer runs this
# every minute, so a push to main reaches the server within a few minutes. Each run also
# gives new domains from the super admin panel their nginx site and certificate (domains.sh).
#   deploy/update.sh            deploy if main changed
#   deploy/update.sh --force    rebuild now
# Logs: journalctl -u <name>-update

main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  # new domains from the super admin panel: nginx site + certificate (never stops a deploy)
  deploy/domains.sh || true
  git fetch -q origin main
  local want deployed failed
  want=$(git rev-parse origin/main)
  deployed=$(cat .deployed 2>/dev/null || true)
  failed=$(cat .failed 2>/dev/null || true)
  if [ "${1:-}" != "--force" ]; then
    [ "$want" = "$deployed" ] && return 0
    [ "$want" = "$failed" ] && return 0 # this commit did not build; the next push (or --force) tries again
  fi
  git reset -q --hard "$want"
  echo "$(date -Is) deploying ${want:0:7}"
  if docker compose up -d --build --remove-orphans; then
    echo "$want" > .deployed
    rm -f .failed
    docker image prune -f > /dev/null || true
    echo "$(date -Is) deployed ${want:0:7}"
  else
    echo "$want" > .failed
    echo "$(date -Is) build of ${want:0:7} FAILED; the running version stays"
    return 1
  fi
}

# the whole function is read before it runs, so a new version of this file arriving with git reset is safe
main "$@"
exit $?
