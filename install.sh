#!/bin/bash
set -euo pipefail

# Undoable Installer for macOS and Linux
# Usage: curl -fsSL https://undoable.xyz/install.sh | bash

BOLD='\033[1m'
ACCENT='\033[38;2;0;255;175m'       # mint #00ffaf
INFO='\033[38;2;136;146;176m'       # text-secondary
SUCCESS='\033[38;2;0;229;204m'      # cyan
WARN='\033[38;2;255;176;32m'        # amber
ERROR='\033[38;2;230;57;70m'        # red
MUTED='\033[38;2;90;100;128m'       # text-muted
NC='\033[0m'

DEFAULT_TAGLINE="Undo anything. Ship with confidence."

ORIGINAL_PATH="${PATH:-}"
TMPFILES=()

cleanup_tmpfiles() {
    local f
    for f in "${TMPFILES[@]:-}"; do
        rm -rf "$f" 2>/dev/null || true
    done
}
trap cleanup_tmpfiles EXIT

mktempfile() {
    local f
    f="$(mktemp)"
    TMPFILES+=("$f")
    echo "$f"
}

DOWNLOADER=""
detect_downloader() {
    if command -v curl &> /dev/null; then
        DOWNLOADER="curl"
        return 0
    fi
    if command -v wget &> /dev/null; then
        DOWNLOADER="wget"
        return 0
    fi
    ui_error "Missing downloader (curl or wget required)"
    exit 1
}

download_file() {
    local url="$1"
    local output="$2"
    if [[ -z "$DOWNLOADER" ]]; then
        detect_downloader
    fi
    if [[ "$DOWNLOADER" == "curl" ]]; then
        curl -fsSL --retry 3 --retry-delay 1 --retry-connrefused -o "$output" "$url"
        return
    fi
    wget -q --tries=3 --timeout=20 -O "$output" "$url"
}

run_remote_bash() {
    local url="$1"
    local tmp
    tmp="$(mktempfile)"
    download_file "$url" "$tmp"
    /bin/bash "$tmp"
}

print_installer_banner() {
    echo ""
    echo -e "${ACCENT}${BOLD}"
    echo "  ╭──────────────────────────────────────╮"
    echo "  │         Undoable Installer           │"
    echo "  │   Security-first agent runtime       │"
    echo "  ╰──────────────────────────────────────╯"
    echo -e "${NC}${INFO}  ${TAGLINE}${NC}"
    echo ""
}

detect_os_or_die() {
    OS="unknown"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
        OS="linux"
    fi

    if [[ "$OS" == "unknown" ]]; then
        ui_error "Unsupported operating system"
        echo "This installer supports macOS and Linux (including WSL)."
        exit 1
    fi

    ui_success "Detected: $OS"
}

ui_info() {
    local msg="$*"
    echo -e "${MUTED}·${NC} ${msg}"
}

ui_warn() {
    local msg="$*"
    echo -e "${WARN}!${NC} ${msg}"
}

ui_success() {
    local msg="$*"
    echo -e "${SUCCESS}✓${NC} ${msg}"
}

ui_error() {
    local msg="$*"
    echo -e "${ERROR}✗${NC} ${msg}"
}

ui_section() {
    local title="$1"
    echo ""
    echo -e "${ACCENT}${BOLD}${title}${NC}"
}

ui_kv() {
    local key="$1"
    local value="$2"
    echo -e "${MUTED}${key}:${NC} ${value}"
}

ui_celebrate() {
    local msg="$1"
    echo -e "${SUCCESS}${BOLD}${msg}${NC}"
}

is_root() {
    [[ "$(id -u)" -eq 0 ]]
}

require_sudo() {
    if [[ "$OS" != "linux" ]]; then
        return 0
    fi
    if is_root; then
        return 0
    fi
    if command -v sudo &> /dev/null; then
        if ! sudo -n true >/dev/null 2>&1; then
            ui_info "Administrator privileges required; enter your password"
            sudo -v
        fi
        return 0
    fi
    ui_error "sudo is required for system installs on Linux"
    echo "  Install sudo or re-run as root."
    exit 1
}

# Install Homebrew on macOS
install_homebrew() {
    if [[ "$OS" == "macos" ]]; then
        if ! command -v brew &> /dev/null; then
            ui_info "Homebrew not found, installing"
            run_remote_bash "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"

            # Add Homebrew to PATH for this session
            if [[ -f "/opt/homebrew/bin/brew" ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [[ -f "/usr/local/bin/brew" ]]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
            ui_success "Homebrew installed"
        else
            ui_success "Homebrew already installed"
        fi
    fi
}

# Check Node.js version
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$NODE_VERSION" -ge 22 ]]; then
            ui_success "Node.js v$(node -v | cut -d'v' -f2) found"
            return 0
        else
            ui_info "Node.js $(node -v) found, upgrading to v22+"
            return 1
        fi
    else
        ui_info "Node.js not found, installing it now"
        return 1
    fi
}

# Install Node.js
install_node() {
    if [[ "$OS" == "macos" ]]; then
        ui_info "Installing Node.js via Homebrew"
        brew install node@22
        brew link node@22 --overwrite --force 2>/dev/null || true
        ui_success "Node.js installed"
    elif [[ "$OS" == "linux" ]]; then
        ui_info "Installing Node.js via NodeSource"
        require_sudo

        if command -v apt-get &> /dev/null; then
            local tmp
            tmp="$(mktempfile)"
            download_file "https://deb.nodesource.com/setup_22.x" "$tmp"
            if is_root; then
                bash "$tmp"
                apt-get install -y -qq nodejs
            else
                sudo -E bash "$tmp"
                sudo apt-get install -y -qq nodejs
            fi
        elif command -v dnf &> /dev/null; then
            local tmp
            tmp="$(mktempfile)"
            download_file "https://rpm.nodesource.com/setup_22.x" "$tmp"
            if is_root; then
                bash "$tmp"
                dnf install -y -q nodejs
            else
                sudo bash "$tmp"
                sudo dnf install -y -q nodejs
            fi
        elif command -v yum &> /dev/null; then
            local tmp
            tmp="$(mktempfile)"
            download_file "https://rpm.nodesource.com/setup_22.x" "$tmp"
            if is_root; then
                bash "$tmp"
                yum install -y -q nodejs
            else
                sudo bash "$tmp"
                sudo yum install -y -q nodejs
            fi
        else
            ui_error "Could not detect package manager"
            echo "Please install Node.js 22+ manually: https://nodejs.org"
            exit 1
        fi

        ui_success "Node.js v22 installed"
    fi
}

# Check Git
check_git() {
    if command -v git &> /dev/null; then
        ui_success "Git already installed"
        return 0
    fi
    ui_info "Git not found, installing it now"
    return 1
}

# Install Git
install_git() {
    if [[ "$OS" == "macos" ]]; then
        brew install git
    elif [[ "$OS" == "linux" ]]; then
        require_sudo
        if command -v apt-get &> /dev/null; then
            if is_root; then
                apt-get update -qq
                apt-get install -y -qq git
            else
                sudo apt-get update -qq
                sudo apt-get install -y -qq git
            fi
        elif command -v dnf &> /dev/null; then
            if is_root; then
                dnf install -y -q git
            else
                sudo dnf install -y -q git
            fi
        elif command -v yum &> /dev/null; then
            if is_root; then
                yum install -y -q git
            else
                sudo yum install -y -q git
            fi
        else
            ui_error "Could not detect package manager for Git"
            exit 1
        fi
    fi
    ui_success "Git installed"
}

# Check pnpm
check_pnpm() {
    if command -v pnpm &> /dev/null; then
        ui_success "pnpm $(pnpm -v) found"
        return 0
    fi
    ui_info "pnpm not found, installing it now"
    return 1
}

# Install pnpm
install_pnpm() {
    if command -v corepack &> /dev/null; then
        ui_info "Installing pnpm via Corepack"
        corepack enable >/dev/null 2>&1 || true
        corepack prepare pnpm@10 --activate || true
        hash -r 2>/dev/null || true
        if command -v pnpm &> /dev/null; then
            ui_success "pnpm installed via Corepack"
            return 0
        fi
    fi

    ui_info "Installing pnpm via npm"
    npm install -g pnpm@10
    hash -r 2>/dev/null || true
    ui_success "pnpm installed"
}

# Check PostgreSQL
check_postgres() {
    if command -v psql &> /dev/null; then
        ui_success "PostgreSQL $(psql --version | head -1 | awk '{print $3}') found"
        return 0
    fi
    ui_info "PostgreSQL not found, installing it now"
    return 1
}

# Install PostgreSQL
install_postgres() {
    if [[ "$OS" == "macos" ]]; then
        ui_info "Installing PostgreSQL via Homebrew"
        brew install postgresql@16
        brew link postgresql@16 --force 2>/dev/null || true

        # Start PostgreSQL service
        brew services start postgresql@16 2>/dev/null || true
        ui_success "PostgreSQL installed and started"
    elif [[ "$OS" == "linux" ]]; then
        require_sudo
        if command -v apt-get &> /dev/null; then
            if is_root; then
                apt-get update -qq
                apt-get install -y -qq postgresql postgresql-contrib
                systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true
                systemctl enable postgresql 2>/dev/null || true
            else
                sudo apt-get update -qq
                sudo apt-get install -y -qq postgresql postgresql-contrib
                sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start 2>/dev/null || true
                sudo systemctl enable postgresql 2>/dev/null || true
            fi
        elif command -v dnf &> /dev/null; then
            if is_root; then
                dnf install -y -q postgresql-server postgresql-contrib
                postgresql-setup --initdb 2>/dev/null || true
                systemctl start postgresql
                systemctl enable postgresql
            else
                sudo dnf install -y -q postgresql-server postgresql-contrib
                sudo postgresql-setup --initdb 2>/dev/null || true
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
            fi
        elif command -v yum &> /dev/null; then
            if is_root; then
                yum install -y -q postgresql-server postgresql-contrib
                postgresql-setup initdb 2>/dev/null || true
                systemctl start postgresql
                systemctl enable postgresql
            else
                sudo yum install -y -q postgresql-server postgresql-contrib
                sudo postgresql-setup initdb 2>/dev/null || true
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
            fi
        else
            ui_error "Could not detect package manager for PostgreSQL"
            exit 1
        fi
        ui_success "PostgreSQL installed and started"
    fi

    # Wait for PostgreSQL to be ready
    sleep 2
}

# Setup undoable database
setup_database() {
    ui_info "Setting up Undoable database"

    local db_name="undoable"
    local db_user="undoable"
    local db_pass="undoable_dev"

    if [[ "$OS" == "macos" ]]; then
        # On macOS, default user is current user
        if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db_name"; then
            createdb "$db_name" 2>/dev/null || true
            ui_success "Database '$db_name' created"
        else
            ui_info "Database '$db_name' already exists"
        fi

        # Create user if not exists
        psql -d "$db_name" -c "DO \$\$ BEGIN CREATE USER $db_user WITH PASSWORD '$db_pass'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" 2>/dev/null || true
        psql -d "$db_name" -c "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;" 2>/dev/null || true
        psql -d "$db_name" -c "GRANT ALL ON SCHEMA public TO $db_user;" 2>/dev/null || true

    elif [[ "$OS" == "linux" ]]; then
        run_postgres_sql() {
            local db="${1:-postgres}"
            local sql="$2"
            if is_root; then
                su - postgres -c "psql -d \"$db\" -c \"$sql\"" >/dev/null 2>&1 || true
            else
                sudo -u postgres psql -d "$db" -c "$sql" >/dev/null 2>&1 || true
            fi
        }

        list_databases() {
            if is_root; then
                su - postgres -c "psql -lqt" 2>/dev/null || true
            else
                sudo -u postgres psql -lqt 2>/dev/null || true
            fi
        }

        # Create database
        if ! list_databases | cut -d \| -f 1 | grep -qw "$db_name"; then
            run_postgres_sql "postgres" "CREATE DATABASE $db_name;"
            ui_success "Database '$db_name' created"
        else
            ui_info "Database '$db_name' already exists"
        fi

        # Create user and grants
        run_postgres_sql "postgres" "DO \$\$ BEGIN CREATE USER $db_user WITH PASSWORD '$db_pass'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
        run_postgres_sql "postgres" "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;"
        run_postgres_sql "$db_name" "GRANT ALL ON SCHEMA public TO $db_user;"
    fi

    ui_success "Database setup complete"
}

# Detect existing undoable checkout
detect_undoable_checkout() {
    local dir="$1"
    if [[ ! -f "$dir/package.json" ]]; then
        return 1
    fi
    if [[ ! -f "$dir/pnpm-workspace.yaml" ]]; then
        return 1
    fi
    if ! grep -q '"name"[[:space:]]*:[[:space:]]*"undoable"' "$dir/package.json" 2>/dev/null; then
        return 1
    fi
    echo "$dir"
    return 0
}

# Ensure ~/.local/bin is on PATH
ensure_user_local_bin_on_path() {
    local target="$HOME/.local/bin"
    mkdir -p "$target"

    export PATH="$target:$PATH"

    local path_line='export PATH="$HOME/.local/bin:$PATH"'
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
        if [[ -f "$rc" ]] && ! grep -q ".local/bin" "$rc"; then
            echo "$path_line" >> "$rc"
        fi
    done
}

bootstrap_default_skills() {
    local repo_dir="$1"
    local bundled_dir="$repo_dir/packages/daemon/skills"
    local user_skills_dir="$HOME/.undoable/skills"
    local skills_config="$HOME/.undoable/skills.json"
    local copied=0
    local skipped=0

    if [[ ! -d "$bundled_dir" ]]; then
        ui_warn "Bundled skills directory not found: $bundled_dir"
        return 0
    fi

    mkdir -p "$user_skills_dir"

    local skill_dir
    for skill_dir in "$bundled_dir"/*; do
        [[ -d "$skill_dir" ]] || continue

        local skill_name
        skill_name="$(basename "$skill_dir")"
        local source_skill="$skill_dir/SKILL.md"
        local target_dir="$user_skills_dir/$skill_name"
        local target_skill="$target_dir/SKILL.md"

        [[ -f "$source_skill" ]] || continue
        if [[ -f "$target_skill" ]]; then
            skipped=$((skipped + 1))
            continue
        fi

        mkdir -p "$target_dir"
        cp -R "$skill_dir"/. "$target_dir"/
        copied=$((copied + 1))
    done

    if [[ ! -f "$skills_config" ]]; then
        cat > "$skills_config" <<EOF
{
  "version": 1,
  "enabled": ["github", "web-search"],
  "disabled": []
}
EOF
    fi

    if [[ "$copied" -gt 0 ]]; then
        ui_success "Bootstrapped $copied built-in skills"
    elif [[ "$skipped" -gt 0 ]]; then
        ui_info "Built-in skills already present"
    else
        ui_warn "No bundled skills were bootstrapped"
    fi
}

# Install undoable from git
install_undoable_from_git() {
    local repo_dir="$1"
    local repo_url="https://github.com/neurana/undoable.git"

    if [[ -d "$repo_dir/.git" ]]; then
        ui_info "Installing Undoable from git checkout: ${repo_dir}"
    else
        ui_info "Installing Undoable from GitHub"
    fi

    if ! check_git; then
        install_git
    fi

    if ! check_pnpm; then
        install_pnpm
    fi

    if [[ ! -d "$repo_dir" ]]; then
        ui_info "Cloning Undoable repository"
        git clone "$repo_url" "$repo_dir"
        ui_success "Repository cloned"
    fi

    if [[ "$GIT_UPDATE" == "1" ]]; then
        if [[ -z "$(git -C "$repo_dir" status --porcelain 2>/dev/null || true)" ]]; then
            ui_info "Updating repository"
            git -C "$repo_dir" pull --rebase || true
            ui_success "Repository updated"
        else
            ui_info "Repo has local changes; skipping git pull"
        fi
    fi

    ui_info "Installing dependencies"
    pnpm -C "$repo_dir" install
    ui_success "Dependencies installed"

    ui_info "Building Undoable"
    pnpm -C "$repo_dir" build
    ui_success "Build complete"

    ensure_user_local_bin_on_path

    # Create .env file if it doesn't exist
    if [[ ! -f "$repo_dir/.env" ]]; then
        cat > "$repo_dir/.env" <<ENVEOF
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable
OPENAI_API_KEY=\${OPENAI_API_KEY:-}
ENVEOF
        ui_success "Created .env file"
    fi

    if [[ "$SKIP_DB" != "1" ]]; then
        ui_info "Applying database schema"
        DATABASE_URL="${DATABASE_URL:-postgresql://undoable:undoable_dev@localhost:5432/undoable}" \
          pnpm -C "$repo_dir" db:push
        ui_success "Database schema applied"
    fi

    ui_info "Bootstrapping built-in skills"
    bootstrap_default_skills "$repo_dir"

    # Create CLI wrapper script
    cat > "$HOME/.local/bin/undoable" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DATABASE_URL="\${DATABASE_URL:-postgresql://undoable:undoable_dev@localhost:5432/undoable}"
cd "${repo_dir}"
exec node dist/cli/index.mjs "\$@"
EOF
    chmod +x "$HOME/.local/bin/undoable"

    # Create canonical CLI name (nrn)
    cat > "$HOME/.local/bin/nrn" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DATABASE_URL="\${DATABASE_URL:-postgresql://undoable:undoable_dev@localhost:5432/undoable}"
cd "${repo_dir}"
exec node dist/cli/index.mjs "\$@"
EOF
    chmod +x "$HOME/.local/bin/nrn"

    # Create daemon wrapper
    cat > "$HOME/.local/bin/undoable-daemon" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DATABASE_URL="\${DATABASE_URL:-postgresql://undoable:undoable_dev@localhost:5432/undoable}"
cd "${repo_dir}"
exec node dist/daemon/index.mjs "\$@"
EOF
    chmod +x "$HOME/.local/bin/undoable-daemon"

    # Create dev command wrapper
    cat > "$HOME/.local/bin/undoable-dev" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DATABASE_URL="\${DATABASE_URL:-postgresql://undoable:undoable_dev@localhost:5432/undoable}"
cd "${repo_dir}"
exec ./dev.sh "\$@"
EOF
    chmod +x "$HOME/.local/bin/undoable-dev"

    ui_success "Undoable CLI installed to ~/.local/bin/undoable (and ~/.local/bin/nrn)"
}

# Check Full Disk Access on macOS
check_full_disk_access() {
    if [[ "$OS" != "macos" ]]; then
        return 0
    fi

    local test_dir="$HOME/Downloads"
    if [[ ! -d "$test_dir" ]]; then
        test_dir="$HOME/Desktop"
    fi
    local count
    count=$(ls -1A "$test_dir" 2>/dev/null | head -n 1 | wc -l)
    if [[ "$count" -eq 0 ]]; then
        local real_count
        real_count=$(find "$test_dir" -maxdepth 1 2>/dev/null | wc -l)
        if [[ "$real_count" -le 1 ]]; then
            return 1
        fi
    fi
    return 0
}

# Prompt for Full Disk Access
prompt_full_disk_access() {
    echo ""
    echo -e "${WARN}!${NC} Full Disk Access is NOT granted"
    echo ""
    echo -e "   ${INFO}Undoable needs Full Disk Access to read protected folders${NC}"
    echo -e "   ${INFO}like ~/Downloads, ~/Desktop, ~/Documents.${NC}"
    echo ""
    echo -e "   ${BOLD}To fix:${NC}"
    echo "   1. System Settings will open to Privacy & Security"
    echo "   2. Click 'Full Disk Access' in the list"
    echo "   3. Enable your terminal app (Terminal, iTerm2, Warp, etc.)"
    echo "   4. Restart your terminal completely"
    echo "   5. Run this installer again to verify"
    echo ""
    read -rp "   Open System Settings now? [Y/n] " response
    response=${response:-Y}
    if [[ "$response" =~ ^[Yy] ]]; then
        open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null \
          || open "x-apple.systempreferences:com.apple.preference.security" 2>/dev/null \
          || open "/System/Applications/System Settings.app" 2>/dev/null \
          || true
        echo ""
        echo -e "   ${WARN}After enabling Full Disk Access, restart your terminal and run:${NC}"
        echo -e "   ${BOLD}./install.sh${NC}"
    fi
}

# Show install plan
show_install_plan() {
    ui_section "Install plan"
    ui_kv "OS" "$OS"
    if [[ "$USE_DOCKER" == "1" ]]; then
        ui_kv "Install method" "Docker"
        ui_kv "Git directory" "$GIT_DIR"
        ui_kv "Database" "PostgreSQL (Docker container)"
    else
        ui_kv "Install method" "$INSTALL_METHOD"
        if [[ "$INSTALL_METHOD" == "git" ]]; then
            ui_kv "Git directory" "$GIT_DIR"
            ui_kv "Git update" "$GIT_UPDATE"
        fi
        if [[ "$SKIP_DB" == "1" ]]; then
            ui_kv "Database setup" "skipped"
        else
            ui_kv "Database" "PostgreSQL (local)"
        fi
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
        ui_kv "Dry run" "yes"
    fi
}

# Print completion message
print_completion() {
    local completion_messages=(
        "Ready to undo anything. Let's build with confidence."
        "Installed! Your agent runtime is ready."
        "All set! Time to ship safely."
        "Undoable is ready. Every action is now reversible."
        "Installation complete. Security-first, local-first."
    )
    local msg="${completion_messages[RANDOM % ${#completion_messages[@]}]}"
    echo -e "${MUTED}${msg}${NC}"
}

# Check Docker
check_docker() {
    if command -v docker &> /dev/null; then
        ui_success "Docker $(docker --version | head -1 | awk '{print $3}' | tr -d ',') found"
        return 0
    fi
    ui_info "Docker not found"
    return 1
}

# Install Docker
install_docker() {
    if [[ "$OS" == "macos" ]]; then
        ui_info "Installing Docker Desktop via Homebrew"
        brew install --cask docker
        ui_success "Docker Desktop installed"
        ui_warn "Please open Docker Desktop to complete setup, then re-run installer"
        exit 0
    elif [[ "$OS" == "linux" ]]; then
        require_sudo
        ui_info "Installing Docker via official script"
        local tmp
        tmp="$(mktempfile)"
        download_file "https://get.docker.com" "$tmp"
        if is_root; then
            bash "$tmp"
        else
            sudo bash "$tmp"
            sudo usermod -aG docker "$USER"
        fi
        ui_success "Docker installed"
        ui_info "You may need to log out and back in for Docker permissions"
    fi
}

# Install undoable via Docker
install_undoable_docker() {
    local repo_dir="$1"
    local repo_url="https://github.com/neurana/undoable.git"

    ui_info "Installing Undoable with Docker"

    if ! check_git; then
        install_git
    fi

    if ! check_docker; then
        install_docker
    fi

    # Check if Docker is running
    if ! docker info &>/dev/null; then
        ui_error "Docker is not running. Please start Docker Desktop and try again."
        exit 1
    fi

    if [[ ! -d "$repo_dir" ]]; then
        ui_info "Cloning Undoable repository"
        git clone "$repo_url" "$repo_dir"
        ui_success "Repository cloned"
    fi

    if [[ "$GIT_UPDATE" == "1" ]]; then
        if [[ -z "$(git -C "$repo_dir" status --porcelain 2>/dev/null || true)" ]]; then
            ui_info "Updating repository"
            git -C "$repo_dir" pull --rebase || true
            ui_success "Repository updated"
        else
            ui_info "Repo has local changes; skipping git pull"
        fi
    fi

    # Create .env file if it doesn't exist
    if [[ ! -f "$repo_dir/.env" ]]; then
        cat > "$repo_dir/.env" <<ENVEOF
DATABASE_URL=postgresql://undoable:undoable_dev@postgres:5432/undoable
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ENVEOF
        ui_success "Created .env file"
    fi

    ui_info "Building Docker images"
    docker compose -f "$repo_dir/docker/docker-compose.yml" build
    ui_success "Docker images built"

    ui_info "Starting services"
    docker compose -f "$repo_dir/docker/docker-compose.yml" up -d
    ui_success "Services started"
    ui_info "Built-in skills bootstrap automatically on daemon startup (persisted in Docker volume)"

    ui_info "Applying database schema in daemon container"
    local attempt=0
    until docker compose -f "$repo_dir/docker/docker-compose.yml" exec -T daemon pnpm db:push >/dev/null 2>&1; do
        attempt=$((attempt + 1))
        if [[ "$attempt" -ge 10 ]]; then
            ui_error "Failed to apply database schema in daemon container"
            echo "  Try running manually:"
            echo "  docker compose -f \"$repo_dir/docker/docker-compose.yml\" exec -T daemon pnpm db:push"
            exit 1
        fi
        sleep 2
    done
    ui_success "Database schema applied"
}

# Print help
print_usage() {
    cat <<EOF
Undoable installer (macOS + Linux)

Usage:
  curl -fsSL https://undoable.xyz/install.sh | bash -s -- [options]

Options:
  --docker                    Install using Docker (recommended)
  --git-dir, --dir <path>     Checkout directory (default: ~/undoable)
  --no-git-update             Skip git pull for existing checkout
  --skip-db                   Skip PostgreSQL installation and setup
  --dry-run                   Print what would happen (no changes)
  --verbose                   Print debug output
  --help, -h                  Show this help

Environment variables:
  UNDOABLE_DOCKER=0|1         Use Docker installation (default: 0)
  UNDOABLE_GIT_DIR=...        Checkout directory
  UNDOABLE_GIT_UPDATE=0|1     Update existing checkout (default: 1)
  UNDOABLE_SKIP_DB=0|1        Skip database setup (default: 0)
  UNDOABLE_DRY_RUN=1          Dry run mode
  UNDOABLE_VERBOSE=1          Verbose output
  DATABASE_URL=...            PostgreSQL connection string

Examples:
  curl -fsSL https://undoable.xyz/install.sh | bash
  curl -fsSL https://undoable.xyz/install.sh | bash -s -- --docker
  curl -fsSL https://undoable.xyz/install.sh | bash -s -- --git-dir ~/projects/undoable
  curl -fsSL https://undoable.xyz/install.sh | bash -s -- --skip-db
EOF
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=1
                shift
                ;;
            --verbose)
                VERBOSE=1
                shift
                ;;
            --help|-h)
                HELP=1
                shift
                ;;
            --docker)
                USE_DOCKER=1
                shift
                ;;
            --git-dir|--dir)
                GIT_DIR="$2"
                shift 2
                ;;
            --no-git-update)
                GIT_UPDATE=0
                shift
                ;;
            --skip-db)
                SKIP_DB=1
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Configure verbose mode
configure_verbose() {
    if [[ "$VERBOSE" == "1" ]]; then
        set -x
    fi
}

# Taglines for random selection
TAGLINES=(
    "Undo anything. Ship with confidence."
    "Security-first, local-first agent runtime."
    "Every action is reversible. Every change is safe."
    "Your AI's safety net for file operations."
    "Transactional execution for the modern developer."
    "Because Ctrl+Z should work everywhere."
    "Safe AI operations with one-click rollback."
    "Build boldly. Undo instantly."
)

pick_tagline() {
    local count=${#TAGLINES[@]}
    if [[ "$count" -eq 0 ]]; then
        echo "$DEFAULT_TAGLINE"
        return
    fi
    local idx=$((RANDOM % count))
    echo "${TAGLINES[$idx]}"
}

# Initialize variables
TAGLINE=$(pick_tagline)
DRY_RUN=${UNDOABLE_DRY_RUN:-0}
INSTALL_METHOD="git"
GIT_DIR_DEFAULT="${HOME}/undoable"
GIT_DIR=${UNDOABLE_GIT_DIR:-$GIT_DIR_DEFAULT}
GIT_UPDATE=${UNDOABLE_GIT_UPDATE:-1}
SKIP_DB=${UNDOABLE_SKIP_DB:-0}
USE_DOCKER=${UNDOABLE_DOCKER:-0}
VERBOSE="${UNDOABLE_VERBOSE:-0}"
HELP=0
OS="unknown"

# Main installation flow
main() {
    if [[ "$HELP" == "1" ]]; then
        print_usage
        return 0
    fi

    print_installer_banner
    detect_os_or_die

    # Check for existing checkout in current directory
    local detected_checkout=""
    detected_checkout="$(detect_undoable_checkout "$PWD" || true)"
    if [[ -n "$detected_checkout" ]]; then
        GIT_DIR="$detected_checkout"
        ui_info "Found existing Undoable checkout in current directory"
    fi

    show_install_plan

    if [[ "$DRY_RUN" == "1" ]]; then
        ui_success "Dry run complete (no changes made)"
        return 0
    fi

    # Docker installation path
    if [[ "$USE_DOCKER" == "1" ]]; then
        ui_section "[1/3] Checking prerequisites"

        if [[ "$OS" == "macos" ]]; then
            install_homebrew
        fi

        ui_section "[2/3] Installing with Docker"

        install_undoable_docker "$GIT_DIR"

        ui_section "[3/3] Finalizing"

        # Check if API key is set
        if [[ -n "${OPENAI_API_KEY:-}" ]]; then
            ui_success "OPENAI_API_KEY is set"
        else
            ui_warn "OPENAI_API_KEY is not set"
            echo "   Add to .env file: OPENAI_API_KEY=sk-..."
        fi

        echo ""
        ui_celebrate "Undoable installed successfully with Docker!"
        print_completion
        echo ""

        ui_section "Quick start"
        echo ""
        echo "  Services are running:"
        echo -e "    ${INFO}http://localhost:5173${NC}  (UI)"
        echo -e "    ${INFO}http://localhost:7433${NC}  (API)"
        echo ""
        echo "  Docker commands:"
        echo -e "    ${ACCENT}cd $GIT_DIR/docker && ./start.sh --logs${NC}   View logs"
        echo -e "    ${ACCENT}cd $GIT_DIR/docker && ./start.sh --down${NC}   Stop services"
        echo -e "    ${ACCENT}cd $GIT_DIR/docker && ./start.sh --dev${NC}    Dev mode"
        echo ""
        ui_info "Source directory: $GIT_DIR"
        echo ""
        return 0
    fi

    # Native installation path
    ui_section "[1/5] Checking Full Disk Access"
    if [[ "$OS" == "macos" ]]; then
        if check_full_disk_access; then
            ui_success "Full Disk Access is granted"
        else
            prompt_full_disk_access
            exit 1
        fi
    else
        ui_info "Skipping (Linux)"
    fi

    ui_section "[2/5] Preparing environment"

    # Homebrew (macOS only)
    install_homebrew

    # Node.js
    if ! check_node; then
        install_node
    fi

    ui_section "[3/5] Setting up PostgreSQL"

    if [[ "$SKIP_DB" == "1" ]]; then
        ui_info "Skipping database setup (--skip-db)"
    else
        # PostgreSQL
        if ! check_postgres; then
            install_postgres
        fi

        # Setup database
        setup_database
    fi

    ui_section "[4/5] Installing Undoable"

    install_undoable_from_git "$GIT_DIR"

    ui_section "[5/5] Finalizing"

    # Check if API key is set
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        ui_success "OPENAI_API_KEY is set"
    else
        ui_warn "OPENAI_API_KEY is not set"
        echo "   Set it before running: export OPENAI_API_KEY=sk-..."
    fi

    echo ""
    ui_celebrate "Undoable installed successfully!"
    print_completion
    echo ""

    ui_section "Quick start"
    echo ""
    echo "  Start the development server:"
    echo -e "    ${ACCENT}undoable-dev${NC}"
    echo ""
    echo "  Or start via CLI:"
    echo -e "    ${ACCENT}undoable start${NC}"
    echo -e "    ${ACCENT}nrn start${NC}"
    echo ""
    echo "  Daemon-only:"
    echo -e "    ${ACCENT}undoable-daemon${NC}"
    echo ""
    echo "  Access the UI:"
    echo -e "    ${INFO}http://localhost:5173${NC}"
    echo ""
    echo "  API endpoint:"
    echo -e "    ${INFO}http://localhost:7433${NC}"
    echo ""

    if [[ -n "$detected_checkout" ]]; then
        ui_info "Source directory: $detected_checkout"
    else
        ui_info "Source directory: $GIT_DIR"
    fi

    echo ""
}

parse_args "$@"
configure_verbose
main
