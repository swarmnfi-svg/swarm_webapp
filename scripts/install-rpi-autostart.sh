#!/usr/bin/env bash
# Install systemd service so SWARM Docker stack starts automatically after Pi reboot/power loss.
# Run once on the Pi:
#   cd ~/swarm_webapp
#   chmod +x scripts/install-rpi-autostart.sh
#   ./scripts/install-rpi-autostart.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="swarm-rpi"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="${REPO_DIR}/.env.rpi"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE missing. Copy .env.rpi.example and configure it first."
  exit 1
fi

echo "Enabling Docker on boot..."
sudo systemctl enable docker
sudo systemctl start docker

echo "Installing ${SERVICE_NAME}.service..."
sudo cp "${REPO_DIR}/scripts/swarm-rpi.service" "$SERVICE_FILE"
sudo sed -i "s|/home/swarm/swarm_webapp|${REPO_DIR}|g" "$SERVICE_FILE"

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}.service"
sudo systemctl restart "${SERVICE_NAME}.service"

echo ""
echo "Status:"
sudo systemctl status "${SERVICE_NAME}.service" --no-pager || true

echo ""
echo "Done. SWARM will start automatically after reboot/power restore."
echo "Manual commands:"
echo "  sudo systemctl status swarm-rpi"
echo "  sudo systemctl restart swarm-rpi"
echo "  journalctl -u swarm-rpi -f"
