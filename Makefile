# --- Makefile for build+deploy of the web UI behind Caddy ---

SERVER_USER := root
SERVER_HOST := 192.168.123.5
REMOTE_DIR  := /srv/studio-share/ui

CADDY_RELOAD := sudo caddy reload --config /etc/caddy/Caddyfile
RSYNC_FLAGS := -avz --delete --chmod=Fu=rw,Fgo=r,Du=rwx,Dgo=rx
BUILD_DIR := build/renderer

.PHONY: build deploy quick caddy-reload restart-server logs open-url

build:
	yarn vite build --config ./vite.config.mjs

deploy: build
	rsync $(RSYNC_FLAGS) $(BUILD_DIR)/ $(SERVER_USER)@$(SERVER_HOST):$(REMOTE_DIR)/
	ssh $(SERVER_USER)@$(SERVER_HOST) '$(CADDY_RELOAD) || true'

restart-server:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'sudo systemctl restart houston-broadcaster && systemctl --no-pager --full status houston-broadcaster | sed -n "1,25p"'

logs:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'sudo journalctl -u houston-broadcaster -f -n 200'

open-url:
	@echo "Visit: https://studio-share.protocase.local/"

quick: deploy restart-server open-url
