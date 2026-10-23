#!/bin/sh
# Read-only deployment prerequisite checker.
#
# This script never installs anything, never uses sudo, and never writes to the
# repository. It reports what the selected deployment path still needs.
set -eu

MODE=vps
JSON=0
FAILS=0
WARNINGS=0
CHECKS_FILE=
CHECK_PORT_ARG=
CHECK_PORT=8787
PORT_CHECKED=0
PROJECT_NAME=oyama-hrt
CONTAINER_NAME=hrt-tracker

usage() {
    cat <<'EOF'
Usage: ./Dependency-Detection.sh [--vps | --docker | --all] [--port N] [--json]

Modes:
  --vps       Check a native Node + systemd deployment (default)
  --docker    Check a Docker Compose deployment
  --all       Run both check sets

Options:
  --port N    Host port to check (default: HRT_PORT from .env, else 8787)
  --json      Print one JSON object instead of the human-readable report
  -h, --help  Show this help

Exit codes:
  0  Every required check passed (warnings are allowed)
  1  At least one required check failed
  2  Invalid command line

This script only checks. It does not install packages, create .env, or start
containers. See wiki/Deployment.md for the deployment paths.
EOF
}

cleanup() {
    if [ -n "$CHECKS_FILE" ] && [ -f "$CHECKS_FILE" ]; then
        rm -f "$CHECKS_FILE"
    fi
}
trap cleanup 0 HUP INT TERM

json_escape() {
    printf '%s' "$1" | tr '\n\r\t' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

record() {
    name=$1
    status=$2
    detail=$3

    case $status in
        fail) FAILS=$((FAILS + 1)) ;;
        warn) WARNINGS=$((WARNINGS + 1)) ;;
    esac

    if [ "$JSON" -eq 1 ]; then
        printf '{"name":"%s","status":"%s","detail":"%s"}\n' \
            "$(json_escape "$name")" "$status" "$(json_escape "$detail")" >> "$CHECKS_FILE"
        return
    fi

    case $status in
        ok) printf '  [ok]   %s: %s\n' "$name" "$detail" ;;
        warn) printf '  [warn] %s: %s\n' "$name" "$detail" ;;
        fail) printf '  [fail] %s: %s\n' "$name" "$detail" ;;
        info) printf '  [info] %s: %s\n' "$name" "$detail" ;;
        skip) printf '  [skip] %s: %s\n' "$name" "$detail" ;;
    esac
}

section() {
    [ "$JSON" -eq 1 ] || printf '\n%s\n' "$1"
}

first_line() {
    printf '%s\n' "$1" | tr -d '\r' | awk 'NF { print; exit }'
}

version_ge() {
    awk -v have="$1" -v want="$2" 'BEGIN {
        sub(/^v/, "", have); sub(/^v/, "", want);
        split(have, h, "."); split(want, w, ".");
        for (i = 1; i <= 3; i++) {
            if ((h[i] + 0) > (w[i] + 0)) exit 0;
            if ((h[i] + 0) < (w[i] + 0)) exit 1;
        }
        exit 0;
    }'
}

version_lt() {
    ! version_ge "$1" "$2"
}

command_ok() {
    label=$1
    cmd=$2
    shift 2

    if ! command -v "$cmd" >/dev/null 2>&1; then
        record "$label" fail "not found; install it first"
        return 1
    fi

    if output=$("$cmd" "$@" 2>&1); then
        detail=$(first_line "$output")
        [ -n "$detail" ] || detail=available
        record "$label" ok "$detail"
        return 0
    fi

    record "$label" fail "command failed; run '$cmd $*' to see why"
    return 1
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

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null || printf '?'
}

file_owner() {
    stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1" 2>/dev/null || printf '?'
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

check_common() {
    section 'Host prerequisites'

    command_ok 'Git' git --version || true
    command_ok 'OpenSSL' openssl version || true
    command_ok 'curl' curl --version || true

    if command -v df >/dev/null 2>&1; then
        available_kb=$(df -Pk . 2>/dev/null | awk 'NR == 2 { print $4 }')
        case $available_kb in
            ''|*[!0-9]*) record 'disk space' warn 'could not determine free space in the current directory' ;;
            *)
                if [ "$available_kb" -lt 1048576 ]; then
                    record 'disk space' warn "${available_kb} KiB free; 1 GiB or more is recommended"
                else
                    record 'disk space' ok "${available_kb} KiB free"
                fi
                ;;
        esac
    fi

    if command -v free >/dev/null 2>&1; then
        total_mb=$(free -m 2>/dev/null | awk '/^Mem:/ { print $2 }')
        case $total_mb in
            ''|*[!0-9]*) ;;
            *)
                if [ "$total_mb" -lt 1024 ]; then
                    record 'memory' warn "${total_mb} MiB total; 1 GiB or more is recommended"
                else
                    record 'memory' ok "${total_mb} MiB total"
                fi
                ;;
        esac
    fi

}

check_vps_tools() {
    if command -v node >/dev/null 2>&1; then
        node_version=$(node --version 2>/dev/null || true)
        case $node_version in
            v*) ;;
            *) node_version="v$node_version" ;;
        esac
        if version_ge "$node_version" 'v22.23.4'; then
            record 'node' ok "Node.js $node_version >= v22.23.4"
        else
            record 'node' fail "Node.js $node_version is older than v22.23.4"
        fi
    else
        record 'node' fail 'Node.js is not installed; install v22.23.4 or newer'
    fi

    command_ok 'npm' npm --version || true

    if command -v make >/dev/null 2>&1; then
        command_ok 'make' make --version || true
    else
        record 'make' warn 'not found; needed when native modules must be compiled'
    fi
    if command -v g++ >/dev/null 2>&1; then
        command_ok 'g++' g++ --version || true
    else
        record 'g++' warn 'not found; needed when native modules must be compiled'
    fi
    if command -v python3 >/dev/null 2>&1; then
        command_ok 'python3' python3 --version || true
    else
        record 'python3' warn 'not found; needed when native modules must be compiled'
    fi
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

container_publishes_port() {
    port=$1
    docker port "$CONTAINER_NAME" '8787/tcp' 2>/dev/null | grep -q ":$port\$"
}

check_port() {
    if [ "$PORT_CHECKED" -eq 1 ]; then
        return
    fi
    PORT_CHECKED=1

    port_status=0
    port_in_use "$CHECK_PORT" || port_status=$?
    if [ "$port_status" -eq 0 ]; then
        if container_is_ours && container_publishes_port "$CHECK_PORT"; then
            record "port $CHECK_PORT" ok 'used by the existing hrt-tracker container'
        else
            record "port $CHECK_PORT" fail 'already in use; stop the other service or choose another host port'
        fi
    elif [ "$port_status" -eq 2 ]; then
        record "port $CHECK_PORT" warn 'neither ss nor netstat is available; cannot check the port'
    else
        record "port $CHECK_PORT" ok 'free on the host'
    fi
}

check_vps() {
    section 'VPS native checks'
    check_vps_tools

    os=$(uname -s 2>/dev/null || printf 'unknown')
    if [ "$os" = 'Linux' ]; then
        record 'operating system' ok 'Linux'
    else
        record 'operating system' fail "$os is not supported by the native VPS path"
    fi

    if command -v systemctl >/dev/null 2>&1 && [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = 'systemd' ]; then
        record 'systemd' ok 'PID 1 is systemd'
    else
        record 'systemd' fail 'systemd is not running; use the Docker path or a systemd host'
    fi

    arch=$(uname -m 2>/dev/null || printf 'unknown')
    case $arch in
        x86_64|aarch64|arm64) record 'architecture' ok "$arch" ;;
        *) record 'architecture' warn "$arch is not a tested architecture" ;;
    esac

    if [ -w /opt ] 2>/dev/null; then
        record '/opt' ok 'writable by the current user'
    else
        record '/opt' warn 'not writable by the current user; installation will need sudo'
    fi

    data_dir=/var/lib/hrt-tracker
    if [ -d "$data_dir" ]; then
        owner=$(file_owner "$data_dir")
        if [ "$owner" = '1000' ]; then
            record 'data directory' ok "$data_dir is owned by uid 1000"
        else
            record 'data directory' warn "$data_dir is owned by uid $owner; the service needs uid 1000"
        fi
    else
        record 'data directory' info "$data_dir does not exist yet; create it during install"
    fi

    if [ -f .dev.vars ]; then
        mode=$(file_mode .dev.vars)
        if [ "$mode" = '600' ]; then
            record '.dev.vars' ok 'mode 600'
        else
            record '.dev.vars' fail "mode $mode; run chmod 600 .dev.vars"
        fi
        secret=$(strip_quotes "$(env_value JWT_SECRET .dev.vars)")
        if [ -n "$secret" ]; then
            problem=$(secret_problem "$secret" || true)
            if [ -n "$problem" ]; then
                record '.dev.vars JWT_SECRET' fail "$problem"
            else
                record '.dev.vars JWT_SECRET' ok 'set and meets the length/entropy floor'
            fi
        else
            record '.dev.vars JWT_SECRET' warn 'empty; the service will reject it'
        fi
    else
        record '.dev.vars' info 'not present yet; create it mode 600 during install'
    fi

    if command -v caddy >/dev/null 2>&1; then
        command_ok 'reverse proxy' caddy version || true
    elif command -v nginx >/dev/null 2>&1; then
        nginx_output=$(nginx -v 2>&1 || true)
        nginx_version=$(printf '%s\n' "$nginx_output" | sed -n 's|.*nginx/\([0-9][0-9.]*\).*|\1|p' | head -n 1)
        case $nginx_version in
            '')
                record 'reverse proxy' warn 'nginx is installed but its version could not be read'
                ;;
            *)
                if version_ge "$nginx_version" '1.31.7' || { version_ge "$nginx_version" '1.30.6' && version_lt "$nginx_version" '1.31.0'; }; then
                    record 'reverse proxy' ok "nginx $nginx_version"
                else
                    record 'reverse proxy' fail "nginx $nginx_version is older than 1.30.6/1.31.7"
                fi
                ;;
        esac
    else
        record 'reverse proxy' warn 'no Caddy or nginx found; fine for loopback or Tor/I2P, required for public HTTPS'
    fi

    check_port
}

check_docker() {
    section 'Docker checks'

    if ! command -v docker >/dev/null 2>&1; then
        record 'Docker CLI' fail 'not found; install Docker Engine first'
    else
        if docker --version >/dev/null 2>&1; then
            record 'Docker CLI' ok "$(docker --version 2>/dev/null)"
        else
            record 'Docker CLI' fail 'docker --version failed'
        fi

        if docker compose version >/dev/null 2>&1; then
            record 'Docker Compose' ok "$(docker compose version 2>/dev/null)"
        else
            record 'Docker Compose' fail 'docker compose is unavailable; install the Compose v2 plugin'
        fi

        if docker info >/dev/null 2>&1; then
            record 'Docker daemon' ok 'reachable'
        else
            record 'Docker daemon' fail 'not reachable; start Docker or fix access to /var/run/docker.sock'
        fi

        if docker inspect hrt-tracker >/dev/null 2>&1; then
            project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' hrt-tracker 2>/dev/null || true)
            if [ "$project" = 'oyama-hrt' ]; then
                record 'container hrt-tracker' ok 'belongs to the oyama-hrt Compose project'
            else
                record 'container hrt-tracker' fail "already exists in Compose project '${project:-unknown}'; refusing to reuse it"
            fi
        else
            record 'container hrt-tracker' ok 'no existing container with that name'
        fi
    fi

    if [ -f .env ]; then
        mode=$(file_mode .env)
        if [ "$mode" = '600' ]; then
            record '.env' ok 'mode 600'
        else
            record '.env' warn "mode $mode; run chmod 600 .env"
        fi
        secret=$(strip_quotes "$(env_value JWT_SECRET .env)")
        if [ -n "$secret" ]; then
            problem=$(secret_problem "$secret" || true)
            if [ -n "$problem" ]; then
                record '.env JWT_SECRET' fail "$problem; docker-install.sh will not rotate it automatically"
            else
                record '.env JWT_SECRET' ok 'set and meets the length/entropy floor'
            fi
        else
            record '.env JWT_SECRET' warn 'empty; docker-install.sh will generate one'
        fi
    else
        record '.env' warn 'not present yet; docker-install.sh will create it'
    fi

    if [ -d data ]; then
        owner=$(file_owner data)
        if [ "$owner" = '1000' ]; then
            record 'data directory' ok './data is owned by uid 1000'
        else
            record 'data directory' warn "./data is owned by uid $owner; docker-install.sh will try to fix it"
        fi
    else
        record 'data directory' info './data does not exist yet; docker-install.sh will create it'
    fi

    check_port
}

if [ "$#" -gt 0 ]; then
    while [ "$#" -gt 0 ]; do
        case $1 in
            --vps) MODE=vps ;;
            --docker) MODE=docker ;;
            --all) MODE=all ;;
            --port)
                [ "$#" -ge 2 ] || { printf '--port requires a value\n' >&2; exit 2; }
                CHECK_PORT_ARG=$2
                shift
                ;;
            --json) JSON=1 ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                printf 'Unknown option: %s\n\n' "$1" >&2
                usage >&2
                exit 2
                ;;
        esac
        shift
    done
fi

CHECK_PORT=8787
if [ -n "$CHECK_PORT_ARG" ]; then
    CHECK_PORT=$CHECK_PORT_ARG
elif [ -n "${HRT_PORT:-}" ]; then
    CHECK_PORT=$HRT_PORT
elif [ -f .env ]; then
    configured_port=$(strip_quotes "$(env_value HRT_PORT .env)")
    case $configured_port in
        ''|*[!0-9]*) ;;
        *) CHECK_PORT=$configured_port ;;
    esac
fi
case $CHECK_PORT in
    ''|*[!0-9]*) printf 'Invalid port: %s\n' "$CHECK_PORT" >&2; exit 2 ;;
esac
if [ "$CHECK_PORT" -lt 1 ] || [ "$CHECK_PORT" -gt 65535 ]; then
    printf 'Port must be between 1 and 65535: %s\n' "$CHECK_PORT" >&2
    exit 2
fi

CHECKS_FILE=$(mktemp "${TMPDIR:-/tmp}/hrt-dependency-check.XXXXXX")
[ "$JSON" -eq 1 ] || printf 'HRT deployment prerequisite check (mode: %s)\n' "$MODE"

case $MODE in
    vps)
        check_common
        check_vps
        ;;
    docker)
        check_common
        check_docker
        ;;
    all)
        check_common
        check_vps
        check_docker
        ;;
esac

if [ "$JSON" -eq 1 ]; then
    printf '{"mode":"%s","ok":%s,"checks":[' \
        "$MODE" "$([ "$FAILS" -eq 0 ] && printf 'true' || printf 'false')"
    first=1
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        [ "$first" -eq 1 ] || printf ','
        printf '%s' "$line"
        first=0
    done < "$CHECKS_FILE"
    printf ']}\n'
else
    if [ "$FAILS" -eq 0 ]; then
        printf '\nResult: ready'
        if [ "$WARNINGS" -gt 0 ]; then
            printf ' with %s warning(s)' "$WARNINGS"
        fi
        printf '.\n'
    else
        printf '\nResult: %s required check(s) failed.\n' "$FAILS"
    fi
fi

[ "$FAILS" -eq 0 ]
