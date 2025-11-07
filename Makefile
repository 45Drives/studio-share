# --- Makefile for build+deploy of the web UI behind Caddy ---

SERVER_USER := root
#SERVER_HOST := 192.168.123.5
SERVER_HOST := 192.168.207.11
# SERVER_HOST := 192.168.209.147
REMOTE_UI_DIR  := /srv/studio-share/ui
REMOTE_CADDYDIR := /etc/caddy
REMOTE_CADDYFILE:= $(REMOTE_CADDYDIR)/Caddyfile
CADDY_SRC := system_files/etc/caddy/Caddyfile

RSYNC_FLAGS := -avz --delete --chmod=Fu=rw,Fgo=r,Du=rwx,Dgo=rx
BUILD_DIR := build/renderer

CADDY_RELOAD := if command -v caddy >/dev/null 2>&1; then \
  caddy validate --config $(REMOTE_CADDYFILE) && \
  ( systemctl reload caddy || systemctl restart caddy || systemctl start caddy ); \
else \
  echo "Caddy not installed — skipped reload"; \
fi

# .PHONY: build deploy quick caddy-reload restart-server logs open-url
.PHONY: build deploy deploy-ui deploy-caddy caddy-reload restart-server logs open-url quick

build:
	yarn vite build --config ./vite.config.mjs

deploy: build ensure-caddy deploy-ui deploy-caddy caddy-reload

ensure-caddy:
	rsync -avz scripts/ensure-caddy.sh $(SERVER_USER)@$(SERVER_HOST):/tmp/ensure-caddy.sh
	ssh $(SERVER_USER)@$(SERVER_HOST) 'chmod +x /tmp/ensure-caddy.sh && /tmp/ensure-caddy.sh && rm -f /tmp/ensure-caddy.sh'

deploy-ui:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'mkdir -p $(REMOTE_UI_DIR)'
	rsync $(RSYNC_FLAGS) $(BUILD_DIR)/ $(SERVER_USER)@$(SERVER_HOST):$(REMOTE_UI_DIR)/

deploy-caddy:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'mkdir -p $(REMOTE_CADDYDIR)'
	rsync -avz $(CADDY_SRC) $(SERVER_USER)@$(SERVER_HOST):$(REMOTE_CADDYFILE)
	ssh $(SERVER_USER)@$(SERVER_HOST) 'if command -v caddy >/dev/null 2>&1; then caddy fmt --overwrite $(REMOTE_CADDYFILE) || true; fi'

caddy-reload:
	ssh $(SERVER_USER)@$(SERVER_HOST) '$(CADDY_RELOAD) || true'

restart-server:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'systemctl restart houston-broadcaster && systemctl --no-pager --full status houston-broadcaster | sed -n "1,25p"'

logs:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'journalctl -u houston-broadcaster -f -n 200'

open-url:
	@echo "Visit: https://studio-share.protocase.local/"

quick: deploy restart-server open-url
