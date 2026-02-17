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

# Check for .env file
if [[ ! -f "$ROOT_DIR/.env" ]]; then
    echo "Creating .env file..."
    cat > "$ROOT_DIR/.env" <<EOF
DATABASE_URL=postgresql://undoable:undoable_dev@postgres:5432/undoable
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
EOF
    echo "✓ Created .env file"
fi

# Parse arguments
MODE="prod"
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
            echo "Stopping containers..."
            if [[ "$MODE" == "dev" ]]; then
                docker compose -f docker-compose.dev.yml down
            else
                docker compose down
            fi
            exit 0
            ;;
        --logs|-l)
            if [[ "$MODE" == "dev" ]]; then
                docker compose -f docker-compose.dev.yml logs -f
            else
                docker compose logs -f
            fi
            exit 0
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
echo "╰──────────────────────────────────────╯"
echo ""
echo "Commands:"
echo "  ./start.sh --logs     View logs"
echo "  ./start.sh --down     Stop all services"
echo "  ./start.sh --dev      Start in dev mode"
echo ""
