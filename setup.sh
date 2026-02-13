#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Undoable — macOS Setup          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

check_fda() {
  local test_dir="$HOME/Downloads"
  if [ ! -d "$test_dir" ]; then
    test_dir="$HOME/Desktop"
  fi
  local count
  count=$(ls -1A "$test_dir" 2>/dev/null | head -n 1 | wc -l)
  if [ "$count" -eq 0 ]; then
    local real_count
    real_count=$(find "$test_dir" -maxdepth 1 2>/dev/null | wc -l)
    if [ "$real_count" -le 1 ]; then
      return 1
    fi
  fi
  return 0
}

echo -e "${BOLD}1. Checking Full Disk Access...${NC}"
if check_fda; then
  echo -e "   ${GREEN}✓ Full Disk Access is granted${NC}"
  FDA_OK=true
else
  echo -e "   ${RED}✗ Full Disk Access is NOT granted${NC}"
  echo ""
  echo -e "   ${YELLOW}Undoable needs Full Disk Access to read protected folders${NC}"
  echo -e "   ${YELLOW}like ~/Downloads, ~/Desktop, ~/Documents.${NC}"
  echo ""
  echo -e "   ${BOLD}To fix:${NC}"
  echo "   1. System Settings will open to Privacy & Security"
  echo "   2. Click 'Full Disk Access' in the list"
  echo "   3. Enable your terminal app (Terminal, iTerm2, Warp, etc.)"
  echo "   4. Restart your terminal completely"
  echo "   5. Run this setup again to verify"
  echo ""
  read -rp "   Open System Settings now? [Y/n] " response
  response=${response:-Y}
  if [[ "$response" =~ ^[Yy] ]]; then
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null \
      || open "x-apple.systempreferences:com.apple.preference.security" 2>/dev/null \
      || open "/System/Applications/System Settings.app" 2>/dev/null \
      || true
    echo ""
    echo -e "   ${YELLOW}After enabling Full Disk Access, restart your terminal and run:${NC}"
    echo -e "   ${BOLD}./setup.sh${NC}"
  fi
  FDA_OK=false
fi

echo ""
echo -e "${BOLD}2. Checking dependencies...${NC}"
if command -v node &>/dev/null; then
  echo -e "   ${GREEN}✓ Node.js $(node -v)${NC}"
else
  echo -e "   ${RED}✗ Node.js not found${NC}"
fi

if command -v pnpm &>/dev/null; then
  echo -e "   ${GREEN}✓ pnpm $(pnpm -v)${NC}"
else
  echo -e "   ${RED}✗ pnpm not found — install with: npm i -g pnpm${NC}"
fi

echo ""
echo -e "${BOLD}3. Checking environment...${NC}"
if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo -e "   ${GREEN}✓ OPENAI_API_KEY is set${NC}"
else
  echo -e "   ${YELLOW}⚠ OPENAI_API_KEY is not set${NC}"
  echo "   Set it before running: export OPENAI_API_KEY=sk-..."
fi

echo ""
echo -e "${BOLD}4. Installing dependencies...${NC}"
pnpm install 2>&1 | tail -1

echo ""
if [ "$FDA_OK" = true ]; then
  echo -e "${GREEN}${BOLD}✓ Setup complete! Run ./dev.sh to start Undoable.${NC}"
else
  echo -e "${YELLOW}${BOLD}⚠ Setup incomplete — Full Disk Access needed.${NC}"
  echo -e "${YELLOW}  Grant it in System Settings, restart terminal, then run ./setup.sh again.${NC}"
fi
echo ""
