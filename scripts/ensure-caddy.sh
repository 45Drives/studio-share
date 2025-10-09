#!/usr/bin/env bash
set -euo pipefail

already=false
if command -v caddy >/dev/null 2>&1; then
  (caddy version || true)
  already=true
else
  echo "→ Installing Caddy..."
  . /etc/os-release || true
  case ":${ID:-}:${ID_LIKE:-}:" in
    *:debian:*|*:ubuntu:*|*:debian*:*|*:ubuntu*:* )
      apt-get update
      apt-get install -y debian-keyring debian-archive-keyring curl gpg
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
        > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update
      apt-get install -y caddy
      ;;
    *:rhel:*|*:centos:*|*:rocky:*|*:fedora:*|*:rhel*:*|*:centos*:*|*:rocky*:*|*:fedora*:* )
      dnf -y install 'dnf-command(copr)' || true
      dnf -y copr enable @caddy/caddy || true
      dnf -y install caddy
      ;;
    * )
      echo "Unsupported distro (${ID:-unknown}). Install Caddy manually." >&2
      exit 1
      ;;
  esac
fi

# ALWAYS ensure service is enabled and running
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now caddy || true
fi

# Firewall & SELinux niceties
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --add-service=http  --permanent || true
  firewall-cmd --add-service=https --permanent || true
  firewall-cmd --reload || true
fi
if command -v restorecon >/dev/null 2>&1; then
  restorecon -R /etc/caddy || true
fi

if [ "$already" = true ]; then
  echo "✓ Caddy present; service ensured active"
else
  echo "✓ Caddy installed and started"
fi
