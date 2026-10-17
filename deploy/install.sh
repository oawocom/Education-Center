#!/bin/bash
# First install on a fresh Ubuntu server, as root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/oawocom/education-center/main/deploy/install.sh)
# Installs Docker and nginx, clones the repo to /home/education-center, writes .env (asks the
# super admin's e-mail and password and the domain), starts the stack behind nginx with a
# Let's Encrypt certificate, and starts the timer that deploys every push to main.

main() {
  set -euo pipefail
  local name=education-center
  local repo=https://github.com/oawocom/education-center.git
  local dir=/home/$name
  local default_port=8001

  [ "$(id -u)" = 0 ] || { echo "root kimi işə salın."; return 1; }
  export DEBIAN_FRONTEND=noninteractive
  command -v git > /dev/null || { apt-get update -qq && apt-get install -y -qq git; }
  command -v docker > /dev/null || curl -fsSL https://get.docker.com | sh
  command -v nginx > /dev/null || { apt-get update -qq && apt-get install -y -qq nginx; }
  command -v certbot > /dev/null || apt-get install -y -qq certbot python3-certbot-nginx
  [ -d "$dir/.git" ] || git clone -q "$repo" "$dir"
  cd "$dir"

  if [ ! -f .env ]; then
    local email pw port domain
    read -rp "Domen (məs. neweducation.center): " domain
    read -rp "Super admin e-poçtu: " email
    while :; do
      read -rsp "Super admin parolu (8+ simvol): " pw; echo
      [ ${#pw} -ge 8 ] && break
      echo "Ən azı 8 simvol."
    done
    read -rp "Daxili port [$default_port]: " port
    port=${port:-$default_port}
    (umask 077; cat > .env << ENV
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SUPERADMIN_EMAIL=$email
SUPERADMIN_PASSWORD=$pw
SUPER_HOST=
DOMAIN=$domain
BIND=127.0.0.1
PORT=$port
ENV
)
  fi
  chmod +x deploy/*.sh
  local port domain email
  port=$(grep '^PORT=' .env | cut -d= -f2)
  domain=$(grep '^DOMAIN=' .env | cut -d= -f2)
  email=$(grep '^SUPERADMIN_EMAIL=' .env | cut -d= -f2)

  # nginx: the domain -> the web app (HTTPS added by certbot below)
  if [ -n "$domain" ] && [ ! -f /etc/nginx/sites-available/$name.conf ]; then
    cat > /etc/nginx/sites-available/$name.conf << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/$name.conf /etc/nginx/sites-enabled/$name.conf
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
  fi

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
  echo "Tətbiq işə düşür..."
  for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$port/api/health" > /dev/null && break; sleep 3; done
  curl -fs "http://127.0.0.1:$port/api/health" > /dev/null || { echo "Tətbiq cavab vermədi; baxın: docker compose -f $dir/docker-compose.yml logs"; return 1; }
  # the super admin exists now: its password is not kept in .env
  sed -i 's/^SUPERADMIN_PASSWORD=.*/SUPERADMIN_PASSWORD=/' .env
  docker compose up -d > /dev/null 2>&1
  systemctl enable --now $name-update.timer > /dev/null

  local url="http://$(hostname -I | awk '{print $1}'):$port"
  if [ -n "$domain" ]; then
    url="http://$domain"
    if certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect > /tmp/$name-certbot.log 2>&1; then
      url="https://$domain"
    else
      echo
      echo "HTTPS hələ qurulmadı ($domain bu serverə yönəlməyib?). DNS hazır olanda bunu işə salın:"
      echo "  certbot --nginx -d $domain --redirect"
    fi
  fi
  echo
  echo "Hazırdır: $url/super  (super admin paneli)"
  echo "main-ə hər push bir neçə dəqiqəyə serverə özü gəlir (journalctl -u $name-update)."
}

main "$@"
exit $?
