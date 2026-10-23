#!/bin/sh
# One-command Docker Compose deployment for Oyama's HRT Tracker.
#
# This script assumes Docker Engine and the Compose v2 plugin are already
# installed. It checks dependencies, prepares .env and ./data, starts the
# container, and waits for the health endpoint. It never prints JWT_SECRET and
# never rotates an existing weak secret.
set -eu
umask 077

PROJECT_NAME=oyama-hrt
CONTAINER_NAME=hrt-tracker
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

MODE=
DOMAIN=
PUBLIC_PORT=443
PUBLIC_PORT_SET=0
APP_PORT=8787
APP_PORT_SET=0
PROXY=
YES=0
DRY_RUN=0
CONFIG_CHANGED=0
GENERATED_SECRET=
PUBLIC_ORIGIN=
TRUSTED_IP_SOURCE=none

usage() {
    cat <<'EOF'
Usage: ./docker-install.sh [options]

Deploy Oyama's HRT Tracker with Docker Compose. Docker Engine and the Compose
v2 plugin must already be installed; this script does not install Docker.

Access modes:
  --mode loopback   Publish on 127.0.0.1 only (default)
  --mode proxy      Keep the app on 127.0.0.1 and serve a public HTTPS domain
                    through an existing Caddy, nginx, Cloudflare, or Tailscale
                    reverse proxy
  --mode lan        Publish on 0.0.0.0 without TLS (trusted LAN only)

Options:
  --domain NAME       Public hostname for proxy mode (for example hrt.example.com)
  --public-port N     Public HTTPS port for proxy mode (default: 443)
  --port N            Host port for the app (default: 8787)
  --proxy NAME        caddy, nginx, cloudflare, or tailscale (proxy mode)
  --yes, -y           Do not prompt; use defaults or fail if a value is required
  --dry-run           Print the plan without writing files or starting containers
  -h, --help          Show this help

Examples:
  ./docker-install.sh --yes
  ./docker-install.sh --mode proxy --domain hrt.example.com --proxy caddy --yes
  ./docker-install.sh --mode proxy --domain hrt.example.com --public-port 8443 --proxy nginx --yes
  ./docker-install.sh --mode lan --port 18787 --yes

After a proxy-mode deploy, finish the printed reverse-proxy configuration. The
script does not edit Caddy or nginx configuration for you.
EOF
}

note() {
    printf '%s\n' "$*"
}

warn() {
    printf 'Warning: %s\n' "$*" >&2
}

die() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

validate_port() {
    value=$1
    label=$2
    case $value in
        ''|*[!0-9]*) die "$label must be a number" ;;
    esac
    if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
        die "$label must be between 1 and 65535"
    fi
}

validate_domain() {
    case $1 in
        ''|*://*|*/*|*:*|*' '*|*[!A-Za-z0-9.-]*)
            die 'domain must be a hostname without a scheme, path, port, or spaces'
            ;;
    esac
}

env_value() {
    key=$1
    file=$2
    awk -v key="$key" '
        index($0, key "=") == 1 {
            value = substr($0, length(key) + 2);
            print value;
            exit
        }
    ' "$file"
}

strip_quotes() {
    printf '%s' "$1" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null || printf '?'
}

file_owner() {
    stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1" 2>/dev/null || printf '?'
}

secret_problem() {
    secret=$1

    if [ "${#secret}" -lt 32 ]; then
        printf '%s' 'less than 32 characters'
        return 0
    fi

    distinct=$(printf '%s' "$secret" | fold -w 1 | sort -u | wc -l | tr -d ' ')
    if [ "$distinct" -lt 8 ]; then
        printf '%s' 'fewer than 8 distinct characters'
        return 0
    fi

    lower=$(printf '%s' "$secret" | tr '[:upper:]' '[:lower:]')
    case $lower in
        *secret*|*fallback-secret*|*fallback_secret*|*test-secret*|*dev-secret*|*default*|*password*|*123456*|*changeme*)
            printf '%s' 'contains a known weak word'
            return 0
            ;;
    esac

    return 1
}

validate_secret() {
    problem=$(secret_problem "$1" || true)
    if [ -n "$problem" ]; then
        die "JWT_SECRET in .env is $problem. Edit .env and set a strong value; this script will not rotate it automatically."
    fi
}

generate_secret() {
    if ! command -v openssl >/dev/null 2>&1; then
        die 'openssl is required to generate JWT_SECRET'
    fi
    GENERATED_SECRET=$(openssl rand -base64 48 | tr -d '\n\r')
    if [ -z "$GENERATED_SECRET" ]; then
        die 'openssl did not produce a JWT_SECRET'
    fi
}

create_env_from_example() {
    secret=$1
    [ -f .env.docker.example ] || die '.env.docker.example is missing; run this script from the repository root'

    tmp=$(mktemp "${TMPDIR:-/tmp}/hrt-env.XXXXXX")
    replaced=0
    while IFS= read -r line || [ -n "$line" ]; do
        case $line in
            JWT_SECRET=*)
                printf 'JWT_SECRET=%s\n' "$secret"
                replaced=1
                ;;
            *)
                printf '%s\n' "$line"
                ;;
        esac
    done < .env.docker.example > "$tmp"
    [ "$replaced" -eq 1 ] || printf 'JWT_SECRET=%s\n' "$secret" >> "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" .env
    CONFIG_CHANGED=1
}

fill_env_secret() {
    secret=$1
    tmp=$(mktemp "${TMPDIR:-/tmp}/hrt-env.XXXXXX")
    replaced=0
    while IFS= read -r line || [ -n "$line" ]; do
        case $line in
            JWT_SECRET=*)
                printf 'JWT_SECRET=%s\n' "$secret"
                replaced=1
                ;;
            *)
                printf '%s\n' "$line"
                ;;
        esac
    done < .env > "$tmp"
    [ "$replaced" -eq 1 ] || printf 'JWT_SECRET=%s\n' "$secret" >> "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" .env
    CONFIG_CHANGED=1
}

ensure_env() {
    if [ ! -f .env ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            note 'Would create .env from .env.docker.example and generate JWT_SECRET.'
            return
        fi
        generate_secret
        create_env_from_example "$GENERATED_SECRET"
        note 'Created .env with a generated JWT_SECRET (mode 600).'
        return
    fi

    mode=$(file_mode .env)
    if [ "$mode" != '600' ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            note "Would chmod 600 .env (currently $mode)."
        elif ! chmod 600 .env 2>/dev/null; then
            warn 'could not chmod 600 .env; check that you own the file'
        fi
    fi

    secret=$(strip_quotes "$(env_value JWT_SECRET .env)")
    if [ -z "$secret" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            note 'Would generate and write JWT_SECRET to .env.'
            return
        fi
        generate_secret
        fill_env_secret "$GENERATED_SECRET"
        note 'Filled the empty JWT_SECRET in .env (mode 600).'
        return
    fi

    validate_secret "$secret"
}

set_env_var() {
    key=$1
    value=$2

    if grep -q "^${key}=" .env 2>/dev/null; then
        current=$(env_value "$key" .env)
        if [ "$current" = "$value" ]; then
            return
        fi
    fi

    CONFIG_CHANGED=1
    tmp=$(mktemp "${TMPDIR:-/tmp}/hrt-env.XXXXXX")
    replaced=0
    while IFS= read -r line || [ -n "$line" ]; do
        case $line in
            "$key="*)
                printf '%s=%s\n' "$key" "$value"
                replaced=1
                ;;
            *)
                printf '%s\n' "$line"
                ;;
        esac
    done < .env > "$tmp"
    [ "$replaced" -eq 1 ] || printf '%s=%s\n' "$key" "$value" >> "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" .env
}

apply_env() {
    key=$1
    value=$2

    if [ "$DRY_RUN" -eq 1 ]; then
        note "Would set $key=$value"
        return
    fi

    set_env_var "$key" "$value"
    note "Set $key=$value"
}

prepare_data_dir() {
    if [ ! -d data ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            note 'Would create ./data.'
        else
            mkdir -p data
        fi
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        note 'Would ensure ./data is owned by uid 1000.'
        return
    fi

    owner=$(file_owner data)
    if [ "$owner" = '1000' ]; then
        return
    fi

    if [ "$(id -u)" -eq 0 ]; then
        chown 1000:1000 data
        note 'Set ./data ownership to uid 1000.'
        return
    fi

    if command -v sudo >/dev/null 2>&1 && sudo -n chown 1000:1000 data 2>/dev/null; then
        note 'Set ./data ownership to uid 1000 with sudo.'
        return
    fi

    die "./data is owned by uid $owner; run sudo chown 1000:1000 ./data and rerun"
}

port_in_use() {
    port=$1

    if command -v ss >/dev/null 2>&1; then
        if ss -ltn 2>/dev/null | awk -v p=":$port" 'index($4, p) > 0 { found = 1 } END { exit found ? 0 : 1 }'; then
            return 0
        fi
        return 1
    fi

    if command -v netstat >/dev/null 2>&1; then
        if netstat -ltn 2>/dev/null | awk -v p=":$port" 'index($4, p) > 0 { found = 1 } END { exit found ? 0 : 1 }'; then
            return 0
        fi
        return 1
    fi

    return 2
}

container_is_ours() {
    if command -v docker >/dev/null 2>&1 && docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
        project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER_NAME" 2>/dev/null || true)
        if [ "$project" = "$PROJECT_NAME" ]; then
            return 0
        fi
    fi
    return 1
}

check_app_port() {
    if container_is_ours; then
        return
    fi

    status=0
    port_in_use "$APP_PORT" || status=$?
    if [ "$status" -eq 0 ]; then
        die "port $APP_PORT is already in use; choose another with --port"
    elif [ "$status" -eq 2 ]; then
        warn "neither ss nor netstat is available; cannot check port $APP_PORT"
    fi
}

compose_up() {
    if [ "$DRY_RUN" -eq 1 ]; then
        if [ "$CONFIG_CHANGED" -eq 1 ]; then
            note "Would run: docker compose -p $PROJECT_NAME up -d --build --force-recreate"
        else
            note "Would run: docker compose -p $PROJECT_NAME up -d --build"
        fi
        return
    fi

    if [ "$CONFIG_CHANGED" -eq 1 ]; then
        if ! docker compose -p "$PROJECT_NAME" up -d --build --force-recreate; then
            docker compose -p "$PROJECT_NAME" logs --tail=200 "$CONTAINER_NAME" || true
            die 'docker compose failed'
        fi
    else
        if ! docker compose -p "$PROJECT_NAME" up -d --build; then
            docker compose -p "$PROJECT_NAME" logs --tail=200 "$CONTAINER_NAME" || true
            die 'docker compose failed'
        fi
    fi
}

wait_for_health() {
    if [ "$DRY_RUN" -eq 1 ]; then
        note "Would wait for http://127.0.0.1:$APP_PORT/api/transparency"
        return
    fi

    attempt=0
    while [ "$attempt" -lt 60 ]; do
        if curl -fsS "http://127.0.0.1:$APP_PORT/api/transparency" >/dev/null 2>&1; then
            return
        fi
        attempt=$((attempt + 2))
        sleep 2
    done

    docker compose -p "$PROJECT_NAME" logs --tail=200 "$CONTAINER_NAME" || true
    die 'container did not become healthy; see the logs above'
}

print_proxy_help() {
    case $PROXY in
        caddy)
            if [ "$PUBLIC_PORT" -eq 443 ]; then
                caddy_site=$DOMAIN
            else
                caddy_site="https://$DOMAIN:$PUBLIC_PORT"
            fi
            cat <<EOF

Caddy site block:
$caddy_site {
    reverse_proxy 127.0.0.1:$APP_PORT
}
EOF
            ;;
        nginx)
            cat <<EOF

nginx server block (nginx 1.30.6+ or 1.31.7+):
server {
    listen $PUBLIC_PORT ssl http2;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
            ;;
        cloudflare)
            cat <<EOF

Cloudflare:
  1. Point $DOMAIN at this host (orange cloud) or use a Cloudflare Tunnel for a loopback-only app.
  2. Keep the origin on 127.0.0.1:$APP_PORT; do not open the app port to the internet.
  3. TRUSTED_IP_SOURCE=cf is already set.
EOF
            ;;
        tailscale)
            cat <<EOF

Tailscale:
  tailscale serve --bg $APP_PORT
  Then use https://<machine>.<tailnet>.ts.net as the public origin.
  TRUSTED_IP_SOURCE=x-forwarded-for is already set.
EOF
            ;;
    esac
}

while [ "$#" -gt 0 ]; do
    case $1 in
        --mode)
            [ "$#" -ge 2 ] || die '--mode requires a value'
            MODE=$2
            shift 2
            ;;
        --domain)
            [ "$#" -ge 2 ] || die '--domain requires a value'
            DOMAIN=$2
            shift 2
            ;;
        --public-port)
            [ "$#" -ge 2 ] || die '--public-port requires a value'
            PUBLIC_PORT=$2
            PUBLIC_PORT_SET=1
            shift 2
            ;;
        --port)
            [ "$#" -ge 2 ] || die '--port requires a value'
            APP_PORT=$2
            APP_PORT_SET=1
            shift 2
            ;;
        --proxy)
            [ "$#" -ge 2 ] || die '--proxy requires a value'
            PROXY=$2
            shift 2
            ;;
        --yes|-y)
            YES=1
            shift
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown option: $1"
            ;;
    esac
done

case $MODE in
    ''|loopback|proxy|lan) ;;
    *) die '--mode must be loopback, proxy, or lan' ;;
esac
validate_port "$PUBLIC_PORT" 'public port'
validate_port "$APP_PORT" 'app port'
if [ -n "$DOMAIN" ]; then
    validate_domain "$DOMAIN"
fi

if [ -z "$MODE" ]; then
    if [ "$YES" -eq 1 ] || [ ! -t 0 ]; then
        MODE=loopback
    else
        printf '\nHow should the app be reached?\n'
        printf '  1) Loopback only, no domain (default)\n'
        printf '  2) Public domain through an existing HTTPS reverse proxy\n'
        printf '  3) LAN direct, no TLS (trusted network only)\n'
        printf 'Choose [1]: '
        read -r choice
        case ${choice:-1} in
            1) MODE=loopback ;;
            2) MODE=proxy ;;
            3) MODE=lan ;;
            *) die 'invalid mode choice' ;;
        esac
    fi
fi

if [ "$MODE" = 'proxy' ]; then
    if [ -z "$DOMAIN" ]; then
        if [ "$YES" -eq 1 ] || [ ! -t 0 ]; then
            die '--domain is required in proxy mode'
        fi
        printf 'Domain name (for example hrt.example.com): '
        read -r DOMAIN
    fi
    validate_domain "$DOMAIN"

    if [ -z "$PROXY" ]; then
        if [ "$YES" -eq 1 ] || [ ! -t 0 ]; then
            die '--proxy is required in proxy mode'
        fi
        printf 'Reverse proxy [caddy/nginx/cloudflare/tailscale]: '
        read -r PROXY
    fi
    case $PROXY in
        caddy|nginx|cloudflare|tailscale) ;;
        *) die '--proxy must be caddy, nginx, cloudflare, or tailscale' ;;
    esac

    if [ "$PUBLIC_PORT_SET" -eq 0 ] && [ "$YES" -eq 0 ] && [ -t 0 ]; then
        printf 'Public HTTPS port [443]: '
        read -r public_choice
        if [ -n "$public_choice" ]; then
            PUBLIC_PORT=$public_choice
            PUBLIC_PORT_SET=1
            validate_port "$PUBLIC_PORT" 'public port'
        fi
    fi

    if [ "$PUBLIC_PORT" -eq 443 ]; then
        PUBLIC_ORIGIN="https://$DOMAIN"
    else
        PUBLIC_ORIGIN="https://$DOMAIN:$PUBLIC_PORT"
    fi

    case $PROXY in
        cloudflare) TRUSTED_IP_SOURCE=cf ;;
        caddy|nginx|tailscale) TRUSTED_IP_SOURCE=x-forwarded-for ;;
    esac
else
    if [ "$APP_PORT_SET" -eq 0 ] && [ "$YES" -eq 0 ] && [ -t 0 ]; then
        printf 'Local port [8787]: '
        read -r port_choice
        if [ -n "$port_choice" ]; then
            APP_PORT=$port_choice
            APP_PORT_SET=1
            validate_port "$APP_PORT" 'app port'
        fi
    fi
fi

validate_port "$PUBLIC_PORT" 'public port'
validate_port "$APP_PORT" 'app port'

if [ ! -f ./Dependency-Detection.sh ]; then
    die './Dependency-Detection.sh is missing; run this script from the repository root'
fi

check_output=$(sh ./Dependency-Detection.sh --docker --port "$APP_PORT" 2>&1) || {
    printf '%s\n' "$check_output" >&2
    die 'Dependency check failed; fix the required items above and rerun.'
}
printf '%s\n' "$check_output"

ensure_env

case $MODE in
    loopback)
        apply_env HRT_BIND_HOST 127.0.0.1
        apply_env HRT_PORT "$APP_PORT"
        apply_env PUBLIC_APP_ORIGIN ''
        apply_env TRUSTED_IP_SOURCE none
        ;;
    proxy)
        apply_env HRT_BIND_HOST 127.0.0.1
        apply_env HRT_PORT "$APP_PORT"
        apply_env PUBLIC_APP_ORIGIN "$PUBLIC_ORIGIN"
        apply_env TRUSTED_IP_SOURCE "$TRUSTED_IP_SOURCE"
        ;;
    lan)
        apply_env HRT_BIND_HOST 0.0.0.0
        apply_env HRT_PORT "$APP_PORT"
        apply_env PUBLIC_APP_ORIGIN ''
        apply_env TRUSTED_IP_SOURCE none
        ;;
esac

prepare_data_dir
check_app_port
compose_up
wait_for_health

if [ "$DRY_RUN" -eq 1 ]; then
    note ''
    note 'Dry run complete; no files were changed and no containers were started.'
else
    note ''
    note 'Deployment is running.'
fi

case $MODE in
    loopback)
        if [ "$DRY_RUN" -eq 1 ]; then
            note "Would publish: http://127.0.0.1:$APP_PORT"
        else
            note "Open: http://127.0.0.1:$APP_PORT"
        fi
        ;;
    proxy)
        note "Public URL: $PUBLIC_ORIGIN"
        note "The app stays on 127.0.0.1:$APP_PORT; finish the proxy configuration below."
        print_proxy_help
        ;;
    lan)
        if [ "$DRY_RUN" -eq 1 ]; then
            note "Would publish on 0.0.0.0:$APP_PORT without TLS."
        else
            note "Open from your LAN: http://<server-ip>:$APP_PORT"
        fi
        warn 'LAN mode publishes without TLS. Use it only on a trusted network and never expose it to the internet.'
        ;;
esac

note "Data: $SCRIPT_DIR/data"
note "Stop: docker compose -p $PROJECT_NAME down"
