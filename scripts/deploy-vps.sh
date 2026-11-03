#!/usr/bin/env bash
set -Eeuo pipefail

APP='robotic-dog-shelter'
SERVICE="${APP}.service"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/${APP}}"
UNIT_PATH="/etc/systemd/system/${SERVICE}"

log() { printf '\n[%s] %s\n' "$APP" "$*"; }
die() { printf '\n[%s] ERROR: %s\n' "$APP" "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die 'Run on the VPS as root, e.g. sudo bash scripts/deploy-vps.sh.'
command -v systemctl >/dev/null || die 'systemd/systemctl was not found; this deployment expects a systemd Linux host.'
command -v ss >/dev/null || die 'The ss command (iproute2) is required to inspect occupied TCP ports.'
command -v python3 >/dev/null || die 'python3 is required for a safe local port-availability probe.'
command -v curl >/dev/null || die 'curl is required for HTTP checks.'
command -v npm >/dev/null || die 'npm is required; install a supported Node.js release first.'
command -v node >/dev/null || die 'Node.js was not found.'
NODE_BIN="$(command -v node)"
NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MINOR="$(node -p 'process.versions.minor')"
[[ "$NODE_MAJOR" =~ ^[0-9]+$ && "$NODE_MINOR" =~ ^[0-9]+$ ]] || die "Unable to interpret Node.js version: $NODE_VERSION"
if ! (( (NODE_MAJOR == 20 && NODE_MINOR >= 19) || (NODE_MAJOR == 22 && NODE_MINOR >= 12) || NODE_MAJOR > 22 )); then die "Node.js $NODE_VERSION is unsupported. Install Node.js 22 LTS >=22.12.0 (or Node.js 20 >=20.19.0)."; fi

log 'Host summary'
printf 'Hostname: %s\n' "$(hostname)"
printf 'Kernel:   %s\n' "$(uname -srmo)"
printf 'Node.js:  %s (%s)\n' "$NODE_VERSION" "$NODE_BIN"
printf 'Source:   %s\nInstall:  %s\n' "$SOURCE_DIR" "$INSTALL_DIR"
log 'Listening TCP ports before installation (read-only inspection)'
ss -ltnp || true
log 'A short list of currently running system services (read-only inspection)'
systemctl --type=service --state=running --no-legend 2>/dev/null | head -n 30 || true

log 'Firewall status and existing rules (read-only inspection)'
if command -v ufw >/dev/null 2>&1; then
  ufw status verbose 2>/dev/null || true
else
  printf 'UFW: not installed. This script will not modify nftables/iptables directly.\n'
fi
if command -v nft >/dev/null 2>&1; then
  printf '\nSelected nftables rules (first 80 lines, read-only):\n'
  nft list ruleset 2>/dev/null | head -n 80 || true
elif command -v iptables >/dev/null 2>&1; then
  printf '\niptables INPUT chain (read-only):\n'
  iptables -S INPUT 2>/dev/null | head -n 40 || true
fi

[[ -f "$SOURCE_DIR/package.json" && -f "$SOURCE_DIR/server.mjs" && -f "$SOURCE_DIR/index.html" ]] || die 'Run the script from the root of the complete project; package.json, server.mjs, and index.html must exist.'
[[ ! -e "$INSTALL_DIR" && ! -L "$INSTALL_DIR" ]] || die "$INSTALL_DIR already exists. Nothing was overwritten. Choose a new INSTALL_DIR only after checking the existing files."
[[ ! -e "$UNIT_PATH" && ! -L "$UNIT_PATH" ]] || die "$UNIT_PATH already exists. Nothing was overwritten; inspect that service before continuing."

PORT="$(python3 - <<'PY'
import socket
for port in range(4173, 4274):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        sock.bind(('0.0.0.0', port))
    except OSError:
        sock.close()
        continue
    sock.close()
    print(port)
    break
else:
    raise SystemExit('No unused TCP port found in range 4173-4273')
PY
)" || die 'No unused TCP port found in 4173–4273.'
[[ "$PORT" =~ ^[0-9]+$ ]] || die "Port probe returned an invalid value: $PORT"
log "Port $PORT appears free based on a bind probe. No existing service will be stopped."

cleanup_on_failure() {
  status=$?
  if (( status != 0 )); then
    printf '\n[%s] Deployment stopped with exit code %s. Existing services and firewall configuration were not intentionally modified.\n' "$APP" "$status" >&2
    if [[ -e "$UNIT_PATH" ]]; then
      systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
      rm -f "$UNIT_PATH"
      systemctl daemon-reload >/dev/null 2>&1 || true
    fi
    printf '[%s] Any new app files under %s were left for inspection; this script does not recursively delete a failed install.\n' "$APP" "$INSTALL_DIR" >&2
  fi
}
trap cleanup_on_failure EXIT

log 'Copying only this project into its new isolated directory'
install -d -m 0755 "$INSTALL_DIR"
( cd "$SOURCE_DIR" && tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' --exclude='./matcaps/.git' --exclude='./matcaps/.git/*' --exclude='./.DS_Store' -cf - . ) | ( cd "$INSTALL_DIR" && tar -xf - )
chmod 0755 "$INSTALL_DIR"
cd "$INSTALL_DIR"

log 'Installing dependencies and validating source paths'
npm install --no-audit --no-fund
npm run check
npm run build
[[ -s "$INSTALL_DIR/dist/index.html" ]] || die 'Vite build completed but dist/index.html is missing or empty.'
ASSET_FILE="$(find "$INSTALL_DIR/dist/assets" -maxdepth 1 -type f -name '*.js' -print -quit 2>/dev/null || true)"
[[ -n "$ASSET_FILE" && -s "$ASSET_FILE" ]] || die 'No built JavaScript asset found in dist/assets.'
ASSET_URL="/assets/$(basename "$ASSET_FILE")"

log 'Writing a dedicated, read-only production service'
cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Robotic Dog Shelter Simulator (production static server)
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$PORT
ExecStart=$NODE_BIN $INSTALL_DIR/server.mjs
Restart=on-failure
RestartSec=3s
StartLimitIntervalSec=60s
StartLimitBurst=8
DynamicUser=yes
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=yes
RestrictSUIDSGID=yes
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$UNIT_PATH"
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || { systemctl status "$SERVICE" --no-pager -l || true; die 'systemd service did not become active.'; }

log 'Verifying the local HTTP response and an actual built JavaScript asset'
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${PORT}/" -o /tmp/robotic-dog-shelter-index.html
curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${PORT}${ASSET_URL}" -o /dev/null
if ! grep -qE 'assets/[^" ]+\.js' /tmp/robotic-dog-shelter-index.html; then die 'HTTP returned HTML, but the built entry script path could not be verified.'; fi
printf 'HTTP root:  OK (200)\nJS asset:   OK (%s)\n' "$ASSET_URL"

FIREWALL_NOTE='UFW was not active or unavailable, so firewall rules were left unchanged. Verify Hostinger/provider firewall policy and external reachability.'
if command -v ufw >/dev/null 2>&1; then
  UFW_STATUS="$(ufw status 2>/dev/null | head -n 1 || true)"
  if [[ "$UFW_STATUS" == 'Status: active' ]]; then
    UFW_RULES="$(ufw status 2>/dev/null || true)"
    if grep -Eq "^[[:space:]]*${PORT}/tcp[[:space:]]+DENY" <<<"$UFW_RULES"; then
      die "UFW contains an explicit deny rule for TCP $PORT. No firewall rule was changed; inspect the existing policy and rerun after choosing a safe port."
    elif grep -Eq "^[[:space:]]*${PORT}/tcp[[:space:]]+ALLOW" <<<"$UFW_RULES"; then
      FIREWALL_NOTE="UFW active: TCP $PORT was already allowed; no duplicate rule added. Provider-level firewall and external reachability still need independent verification."
    else
      log "UFW is active. Adding one inbound TCP allow rule for port $PORT only."
      ufw allow "${PORT}/tcp" comment 'robotic-dog-shelter'
      FIREWALL_NOTE="UFW active: allowed inbound TCP $PORT only. Provider-level firewall and external reachability still need independent verification."
    fi
  fi
fi

PUBLIC_IP="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || true)"
log 'Deployment result'
printf 'Project directory: %s\nService:           %s\nService status:    %s\nSelected TCP port: %s\nBind address:      0.0.0.0\n' \
  "$INSTALL_DIR" "$SERVICE" "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" "$PORT"
if [[ -n "$PUBLIC_IP" ]]; then printf 'Public URL:        http://%s:%s\n' "$PUBLIC_IP" "$PORT"; else printf 'Public URL:        Not determined (public IPv4 lookup failed).\n'; fi
printf 'HTTP checks:       root index + built JavaScript asset passed from the VPS.\nFirewall note:     %s\n' "$FIREWALL_NOTE"
printf 'External check:    Not independently verified from a separate network. Open the public URL in a browser to confirm.\n'
printf '\nUseful commands:\n  systemctl status %s --no-pager -l\n  journalctl -u %s -n 100 --no-pager\n  ss -ltnp | grep ":%s"\n' "$SERVICE" "$SERVICE" "$PORT"
trap - EXIT
