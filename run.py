#!/usr/bin/env python3
"""
run.py — Local development / testing launcher for QueueStorm.

Starts the backend (Express + SQLite) and the frontend (Vite) together,
streams their logs with [api]/[web] prefixes, and shuts both down cleanly
on Ctrl+C. No Docker required — just Node.js >= 18.

Examples
--------
    python run.py                 # install (if needed), migrate, seed, run dev servers
    python run.py --build         # serve the production build (vite preview) instead of dev
    python run.py --llm           # enable Gemma 4 via Ollama (default: rules-only)
    python run.py --reset         # delete the SQLite DB and re-seed
    python run.py --no-open       # don't open the browser
    python run.py --no-seed       # skip sample data

Flags: --backend-port (8787), --frontend-port (5173), --no-install, --no-seed,
       --reset, --build, --llm, --no-open
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"

# Force UTF-8 stdout so logs (incl. Bangla) never crash on Windows' cp1252 console.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── tiny ANSI helpers ───────────────────────────────────────────────────────
def _c(code): return "" if IS_WIN and not os.environ.get("WT_SESSION") else code
RESET, BOLD = _c("\033[0m"), _c("\033[1m")
CYAN, MAGENTA, GREEN, RED, DIM = (_c(f"\033[{n}m") for n in (36, 35, 32, 31, 2))

def say(msg): print(f"{BOLD}{CYAN}>> {msg}{RESET}", flush=True)
def ok(msg):  print(f"{GREEN}[ok] {msg}{RESET}", flush=True)
def err(msg): print(f"{RED}[!!] {msg}{RESET}", flush=True)

procs = []  # long-running children we must clean up


def which_or_die(exe, hint):
    path = shutil.which(exe)
    if not path:
        err(f"'{exe}' not found on PATH. {hint}")
        sys.exit(1)
    return path


def run_blocking(cmd, cwd, env=None, shell=False):
    """Run a one-shot command to completion, raising on failure."""
    print(f"{DIM}$ {' '.join(cmd) if isinstance(cmd, list) else cmd}{RESET}", flush=True)
    subprocess.run(cmd, cwd=str(cwd), env=env, shell=shell, check=True)


def npm_install(cwd):
    # On Windows, npm is a .cmd shim → run via shell. On POSIX, exec directly.
    if IS_WIN:
        run_blocking("npm install", cwd=cwd, shell=True)
    else:
        run_blocking([which_or_die("npm", "Install Node.js (includes npm)."), "install"], cwd=cwd)


def stream(proc, prefix, color):
    for line in iter(proc.stdout.readline, ""):
        if line == "" and proc.poll() is not None:
            break
        sys.stdout.write(f"{color}{prefix}{RESET} {line}")
        sys.stdout.flush()


def spawn(cmd, cwd, env, prefix, color):
    """Start a long-running node process, piping output to a prefixed stream."""
    kwargs = {}
    if not IS_WIN:
        kwargs["start_new_session"] = True  # own process group for clean kill
    proc = subprocess.Popen(
        cmd, cwd=str(cwd), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, **kwargs,
    )
    procs.append(proc)
    threading.Thread(target=stream, args=(proc, prefix, color), daemon=True).start()
    return proc


def wait_health(url, timeout=40):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def shutdown(*_):
    say("Shutting down…")
    for p in procs:
        if p.poll() is None:
            try:
                if IS_WIN:
                    p.terminate()
                else:
                    os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                pass
    for p in procs:
        try:
            p.wait(timeout=6)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    ok("Stopped.")


def main():
    ap = argparse.ArgumentParser(description="Run QueueStorm locally (backend + frontend).")
    ap.add_argument("--backend-port", type=int, default=8787)
    ap.add_argument("--frontend-port", type=int, default=5173)
    ap.add_argument("--no-install", action="store_true", help="skip npm install")
    ap.add_argument("--no-seed", action="store_true", help="skip seeding sample tickets")
    ap.add_argument("--reset", action="store_true", help="delete the SQLite DB and re-seed")
    ap.add_argument("--build", action="store_true", help="serve the production build (vite preview)")
    ap.add_argument("--llm", action="store_true", help="enable Gemma 4 via Ollama (default: rules-only)")
    ap.add_argument("--no-open", action="store_true", help="do not open the browser")
    args = ap.parse_args()

    node = which_or_die("node", "Install Node.js >= 18 from https://nodejs.org")
    which_or_die("npm", "Install Node.js (includes npm).")

    print(f"{BOLD}{MAGENTA}\n  QueueStorm — local launcher{RESET}")
    print(f"{DIM}  backend :{args.backend_port}   frontend :{args.frontend_port}   "
          f"LLM {'on' if args.llm else 'off (rules-only)'}{RESET}\n")

    # ── env for the backend ────────────────────────────────────────────────
    db_path = BACKEND / "queuestorm.db"
    if args.reset:
        for suffix in ("", "-shm", "-wal"):
            f = Path(str(db_path) + suffix)
            if f.exists():
                f.unlink()
                print(f"{DIM}  removed {f.name}{RESET}")

    be_env = os.environ.copy()
    be_env.update({
        "PORT": str(args.backend_port),
        "LLM_ENABLED": "true" if args.llm else "false",
        "DATABASE_URL": "./queuestorm.db",
    })

    # ── install deps ───────────────────────────────────────────────────────
    if not args.no_install:
        if not (BACKEND / "node_modules").exists():
            say("Installing backend dependencies…"); npm_install(BACKEND)
        if not (FRONTEND / "node_modules").exists():
            say("Installing frontend dependencies…"); npm_install(FRONTEND)

    # ── migrate + seed ─────────────────────────────────────────────────────
    # Decide "fresh" BEFORE migrating — migrate creates the DB file.
    fresh = (not db_path.exists()) or args.reset
    say("Preparing database…")
    run_blocking([node, "src/db.js", "--migrate"], cwd=BACKEND, env=be_env)
    if fresh and not args.no_seed:
        say("Seeding sample tickets…")
        run_blocking([node, "src/seed.js"], cwd=BACKEND, env=be_env)

    # ── start backend ──────────────────────────────────────────────────────
    say("Starting backend…")
    spawn([node, "src/server.js"], cwd=BACKEND, env=be_env, prefix="[api]", color=GREEN)
    health = f"http://localhost:{args.backend_port}/health"
    if wait_health(health):
        ok(f"Backend healthy at {health}")
    else:
        err("Backend did not become healthy in time. Check the [api] logs above.")
        shutdown(); sys.exit(1)

    # ── start frontend ─────────────────────────────────────────────────────
    fe_env = os.environ.copy()
    fe_env["VITE_API_BASE_URL"] = f"http://localhost:{args.backend_port}"
    vite = str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js")
    if not Path(vite).exists():
        err("Vite not found — did npm install run? Try without --no-install.")
        shutdown(); sys.exit(1)

    if args.build:
        say("Building frontend (production)…")
        run_blocking([node, vite, "build"], cwd=FRONTEND, env=fe_env)
        say("Starting frontend preview…")
        spawn([node, vite, "preview", "--port", str(args.frontend_port), "--host"],
              cwd=FRONTEND, env=fe_env, prefix="[web]", color=MAGENTA)
    else:
        say("Starting frontend dev server…")
        spawn([node, vite, "--port", str(args.frontend_port), "--host"],
              cwd=FRONTEND, env=fe_env, prefix="[web]", color=MAGENTA)

    fe_url = f"http://localhost:{args.frontend_port}"
    time.sleep(2.0)
    print()
    ok(f"Frontend  -> {BOLD}{fe_url}{RESET}")
    ok(f"API       -> {BOLD}http://localhost:{args.backend_port}{RESET}")
    print(f"{DIM}  Press Ctrl+C to stop both.{RESET}\n")
    if not args.no_open:
        try: webbrowser.open(fe_url)
        except Exception: pass

    # ── supervise ──────────────────────────────────────────────────────────
    try:
        while True:
            for p in procs:
                if p.poll() is not None:
                    err("A process exited unexpectedly — shutting down.")
                    raise KeyboardInterrupt
            time.sleep(0.8)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    if not IS_WIN:
        signal.signal(signal.SIGTERM, shutdown)
    main()
