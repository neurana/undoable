#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$SCRIPT_DIR"

echo ""
echo "╭──────────────────────────────────────╮"
echo "│      Undoable Docker Launcher        │"
echo "╰──────────────────────────────────────╯"
echo ""

ensure_env_file() {
    if [[ -f "$ROOT_DIR/.env" ]]; then
        return 0
    fi
    echo "Creating .env file..."
    cat > "$ROOT_DIR/.env" <<EOF
DATABASE_URL=postgresql://undoable:undoable_dev@postgres:5432/undoable
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
EOF
    echo "✓ Created .env file"
}

# Parse arguments
MODE="prod"
ACTION="up"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev|-d)
            MODE="dev"
            shift
            ;;
        --build|-b)
            BUILD=1
            shift
            ;;
        --down)
            ACTION="down"
            shift
            ;;
        --logs|-l)
            ACTION="logs"
            shift
            ;;
        --help|-h)
            echo "Usage: ./start.sh [--dev] [--build] [--up|--down|--logs]"
            exit 0
            ;;
        --up)
            ACTION="up"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

BUILD=${BUILD:-0}

if [[ "$MODE" == "dev" ]]; then
    echo "Starting in DEVELOPMENT mode..."
    COMPOSE_FILE="docker-compose.dev.yml"
else
    echo "Starting in PRODUCTION mode..."
    COMPOSE_FILE="docker-compose.yml"
fi

if [[ "$ACTION" == "down" ]]; then
    echo "Stopping containers..."
    docker compose -f "$COMPOSE_FILE" down
    exit 0
fi

if [[ "$ACTION" == "logs" ]]; then
    docker compose -f "$COMPOSE_FILE" logs -f
    exit 0
fi

ensure_env_file

if [[ "$BUILD" == "1" ]]; then
    echo "Building containers..."
    docker compose -f "$COMPOSE_FILE" build
fi

echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "╭──────────────────────────────────────╮"
echo "│      Undoable is running!            │"
echo "├──────────────────────────────────────┤"
echo "│  UI:     http://localhost:5173       │"
echo "│  API:    http://localhost:7433       │"
echo "│  DB:     localhost:5432              │"
echo "│  Skills: persisted in Docker volume  │"
echo "╰──────────────────────────────────────╯"
echo ""
echo "Commands:"
echo "  ./start.sh --logs     View logs"
echo "  ./start.sh --down     Stop all services"
echo "  ./start.sh --dev      Start in dev mode"
echo ""
