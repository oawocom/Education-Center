#!/bin/bash
# Gives every domain added in the super admin panel its nginx site and HTTPS certificate,
# as soon as the domain's DNS points to this server. update.sh runs it every minute.
# A failed certificate is retried after an hour (Let's Encrypt limits). Log: journalctl -u <name>-update

NGINX_DIR=${NGINX_DIR:-/etc/nginx}

# served_ssl HOST: an enabled nginx site already answers HOST over HTTPS
served_ssl() {
  local re=" ${1//./\\.}[ ;]" f
  for f in "$NGINX_DIR"/sites-enabled/*; do
    [ -f "$f" ] || continue
    tr '\t' ' ' < "$f" | grep -qE "server_name[^;]*$re" && grep -q ssl_certificate "$f" && return 0
  done
  return 1
}

site() { # site HOST PORT: the HTTP site certbot then turns into HTTPS
  cat << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $1;
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:$2;
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
}

main() {
  set -uo pipefail
  cd "$(dirname "$0")/.." || return 1
  [ -f .env ] || return 0
  local name port email ip state hosts h conf
  name=$(basename "$PWD")
  port=$(grep '^PORT=' .env | cut -d= -f2)
  email=$(grep '^SUPERADMIN_EMAIL=' .env | cut -d= -f2)
  state=${STATE_DIR:-/var/lib/$name-domains}
  mkdir -p "$state"
  ip=$(ip -4 route get 1.1.1.1 2> /dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
  hosts=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT host FROM domains"' 2> /dev/null) || return 0

  for h in $hosts; do
    [[ "$h" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || continue
    served_ssl "$h" && continue
    getent ahostsv4 "$h" | awk '{print $1}' | grep -qxF "$ip" || continue # DNS does not point here (yet)
    if [ -f "$state/$h.failed" ] && [ $(($(date +%s) - $(stat -c %Y "$state/$h.failed"))) -lt 3600 ]; then
      continue
    fi
    conf="$NGINX_DIR/sites-available/$name-$h.conf"
    if [ ! -f "$conf" ]; then
      site "$h" "$port" > "$conf"
      ln -sf "$conf" "$NGINX_DIR/sites-enabled/$name-$h.conf"
      if ! nginx -t > /dev/null 2>&1; then
        rm -f "$conf" "$NGINX_DIR/sites-enabled/$name-$h.conf"
        echo "$(date -Is) $h: nginx refused the site"
        continue
      fi
      systemctl reload nginx
    fi
    if certbot --nginx -d "$h" --non-interactive --agree-tos -m "$email" --redirect >> "$state/certbot.log" 2>&1; then
      rm -f "$state/$h.failed"
      echo "$(date -Is) $h: HTTPS ready"
    else
      touch "$state/$h.failed"
      echo "$(date -Is) $h: certificate failed, next try in an hour (see $state/certbot.log)"
    fi
  done
  return 0
}

main "$@"
exit $?
