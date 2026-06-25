#!/usr/bin/env python3
"""
run_onVM.py — Cloud / VM deployment launcher for QueueStorm (Docker).

Builds and runs the full stack with Docker Compose:
    • backend  (Express + SQLite)  →  http://<vm>:8787        (direct API base)
    • frontend (nginx + SPA)       →  http://<vm>:<QS_PORT>   (proxies /api → backend)

The frontend talks to the backend through nginx at /api, so there is no CORS
to configure and only one public port is strictly required for the UI.

Examples
--------
    python run_onVM.py                 # build + start the stack (detached)
    python run_onVM.py --port 80       # serve the UI on port 80
    python run_onVM.py --seed          # also load sample tickets after start
    python run_onVM.py --no-cache      # clean rebuild of images
    python run_onVM.py --llm --ollama-host http://host.docker.internal:11434
    python run_onVM.py --status        # show container status
    python run_onVM.py --logs          # follow logs
    python run_onVM.py --down          # stop the stack   (--volumes also wipes the DB)
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def _c(code): return "" if IS_WIN and not os.environ.get("WT_SESSION") else code
RESET, BOLD = _c("\033[0m"), _c("\033[1m")
CYAN, MAGENTA, GREEN, RED, DIM = (_c(f"\033[{n}m") for n in (36, 35, 32, 31, 2))

def say(m): print(f"{BOLD}{CYAN}>> {m}{RESET}", flush=True)
def ok(m):  print(f"{GREEN}[ok] {m}{RESET}", flush=True)
def err(m): print(f"{RED}[!!] {m}{RESET}", flush=True)


def detect_compose():
    """Return the compose invocation as a list, preferring v2 (`docker compose`)."""
    if shutil.which("docker"):
        try:
            subprocess.run(["docker", "compose", "version"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            return ["docker", "compose"]
        except Exception:
            pass
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    err("Docker Compose not found. Install Docker (Engine + Compose v2) first:")
    print(f"{DIM}  https://docs.docker.com/engine/install/{RESET}")
    sys.exit(1)


def compose(args, base, extra_env=None, check=True):
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    cmd = base + ["-f", str(ROOT / "docker-compose.yml")] + args
    print(f"{DIM}$ {' '.join(cmd)}{RESET}", flush=True)
    return subprocess.run(cmd, cwd=str(ROOT), env=env, check=check)


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def wait_health(url, timeout=120):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(2)
    return False


def main():
    ap = argparse.ArgumentParser(description="Deploy QueueStorm on a VM with Docker Compose.")
    ap.add_argument("--port", type=int, default=int(os.environ.get("QS_PORT", 8080)),
                    help="public port for the web UI (default 8080)")
    ap.add_argument("--no-cache", action="store_true", help="rebuild images without cache")
    ap.add_argument("--seed", action="store_true", help="load sample tickets after start")
    ap.add_argument("--llm", action="store_true", help="enable Gemma 4 (needs a reachable Ollama)")
    ap.add_argument("--ollama-host", default=os.environ.get("OLLAMA_HOST", "http://host.docker.internal:11434"))
    ap.add_argument("--down", action="store_true", help="stop and remove the stack")
    ap.add_argument("--volumes", action="store_true", help="with --down, also remove the DB volume")
    ap.add_argument("--logs", action="store_true", help="follow container logs")
    ap.add_argument("--status", action="store_true", help="show container status")
    args = ap.parse_args()

    base = detect_compose()
    env = {
        "QS_PORT": str(args.port),
        "LLM_ENABLED": "true" if args.llm else "false",
        "OLLAMA_HOST": args.ollama_host,
    }

    # ── subcommands ────────────────────────────────────────────────────────
    if args.down:
        say("Stopping stack…")
        compose(["down"] + (["-v"] if args.volumes else []), base, env)
        ok("Stack stopped." + (" Volumes removed." if args.volumes else ""))
        return
    if args.status:
        compose(["ps"], base, env); return
    if args.logs:
        try: compose(["logs", "-f", "--tail", "100"], base, env, check=False)
        except KeyboardInterrupt: pass
        return

    # ── up ─────────────────────────────────────────────────────────────────
    print(f"{BOLD}{MAGENTA}\n  QueueStorm — VM deployment (Docker){RESET}")
    print(f"{DIM}  ui port {args.port}   api port 8787   LLM {'on' if args.llm else 'off (rules-only)'}{RESET}\n")

    if not Path(shutil.which("docker") or "").name:
        err("Docker engine not found on PATH."); sys.exit(1)

    if args.no_cache:
        say("Building images (no cache)…")
        compose(["build", "--no-cache"], base, env)
        say("Starting stack…")
        compose(["up", "-d"], base, env)
    else:
        say("Building & starting stack…")
        compose(["up", "-d", "--build"], base, env)

    # ── health ─────────────────────────────────────────────────────────────
    say("Waiting for the API to become healthy…")
    api_direct = "http://localhost:8787/health"
    ui_proxy = f"http://localhost:{args.port}/api/health"
    if wait_health(api_direct):
        ok(f"Backend healthy ({api_direct})")
    else:
        err("Backend did not become healthy. Check: python run_onVM.py --logs")
        sys.exit(1)
    if wait_health(ui_proxy, timeout=30):
        ok(f"Frontend proxy healthy ({ui_proxy})")
    else:
        err("Frontend proxy not responding yet — it may need a few more seconds.")

    # ── seed ───────────────────────────────────────────────────────────────
    if args.seed:
        say("Seeding sample tickets…")
        compose(["exec", "-T", "backend", "node", "src/seed.js"], base, env, check=False)

    ip = lan_ip()
    print()
    ok("QueueStorm is live:")
    print(f"   {BOLD}Web UI{RESET}      -> http://{ip}:{args.port}        (and http://localhost:{args.port})")
    print(f"   {BOLD}API base{RESET}    -> http://{ip}:8787             (health: /health)")
    print(f"   {BOLD}API via UI{RESET}  -> http://{ip}:{args.port}/api      (health: /api/health)")
    print(f"\n{DIM}  Submit the API base URL (use HTTPS behind your VM's reverse proxy / TLS).{RESET}")
    print(f"{DIM}  Manage:  --status | --logs | --down [--volumes]{RESET}\n")


if __name__ == "__main__":
    main()
