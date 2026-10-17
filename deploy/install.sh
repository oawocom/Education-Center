#!/bin/bash
# First install on a fresh Ubuntu server, as root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/oawocom/education-center/main/deploy/install.sh)
# Installs Docker, clones the repo to /opt/education-center, writes .env (asks the super
# admin's e-mail and password), starts the stack and the timer that deploys every push to main.

main() {
  set -euo pipefail
  local name=education-center
  local repo=https://github.com/oawocom/education-center.git
  local dir=/opt/$name
  local default_port=8001

  [ "$(id -u)" = 0 ] || { echo "Run as root."; return 1; }
  command -v git > /dev/null || { apt-get update -qq && apt-get install -y -qq git; }
  command -v docker > /dev/null || curl -fsSL https://get.docker.com | sh
  [ -d "$dir/.git" ] || git clone -q "$repo" "$dir"
  cd "$dir"

  if [ ! -f .env ]; then
    local email pw port
    read -rp "Super admin e-poçtu: " email
    while :; do
      read -rsp "Super admin parolu (8+ simvol): " pw; echo
      [ ${#pw} -ge 8 ] && break
      echo "Ən azı 8 simvol."
    done
    read -rp "Port [$default_port]: " port
    port=${port:-$default_port}
    (umask 077; cat > .env << ENV
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SUPERADMIN_EMAIL=$email
SUPERADMIN_PASSWORD=$pw
SUPER_HOST=
BIND=0.0.0.0
PORT=$port
ENV
)
  fi
  chmod +x deploy/*.sh

  cat > /etc/systemd/system/$name-update.service << UNIT
[Unit]
Description=$name: deploy new commits of main
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=$dir/deploy/update.sh
UNIT
  cat > /etc/systemd/system/$name-update.timer << UNIT
[Unit]
Description=$name: check GitHub for new commits every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload

  deploy/update.sh --force
  local port ip
  port=$(grep '^PORT=' .env | cut -d= -f2)
  echo "Waiting for the app..."
  for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$port/api/health" > /dev/null && break; sleep 3; done
  curl -fs "http://127.0.0.1:$port/api/health" > /dev/null || { echo "The app did not answer; see: docker compose -f $dir/docker-compose.yml logs"; return 1; }
  # the super admin exists now: its password is not kept in .env
  sed -i 's/^SUPERADMIN_PASSWORD=.*/SUPERADMIN_PASSWORD=/' .env
  docker compose up -d > /dev/null 2>&1
  systemctl enable --now $name-update.timer > /dev/null
  ip=$(hostname -I | awk '{print $1}')
  echo
  echo "Ready: http://$ip:$port/super  (super admin panel)"
  echo "Every push to main is deployed within a few minutes (journalctl -u $name-update)."
}

main "$@"
exit $?
