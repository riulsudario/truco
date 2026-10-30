"""Generation environment diagnostics: OS, CPU, RAM, GPU, CUDA, Python, PyTorch, FFmpeg, WSL2.

    python scripts/check_environment.py          # report only
    python scripts/check_environment.py --json   # machine-readable output
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys


def run(cmd: list[str]) -> str | None:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


def meminfo_gb() -> float | None:
    try:
        with open("/proc/meminfo") as f:
            kb = int(next(l for l in f if l.startswith("MemTotal")).split()[1])
        return round(kb / 1024 / 1024, 1)
    except (OSError, StopIteration):
        return None


def cpu_name() -> str:
    try:
        with open("/proc/cpuinfo") as f:
            return next(l.split(":", 1)[1].strip() for l in f if l.startswith("model name"))
    except (OSError, StopIteration):
        return platform.processor() or platform.machine()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    info: dict = {
        "os": f"{platform.system()} {platform.release()}",
        "wsl2": "microsoft" in platform.release().lower() and "wsl2" in platform.release().lower(),
        "cpu": cpu_name(),
        "cpu_threads": os.cpu_count(),
        "ram_gb": meminfo_gb(),
        "python": sys.version.split()[0],
        "ffmpeg": (run(["ffmpeg", "-version"]) or "").split("\n")[0] or None,
        "ffmpeg_encoders": {},
        "torch": None,
        "cuda": None,
        "gpu": None,
        "vram_gb": None,
        "chatterbox": None,
    }
    if shutil.which("ffmpeg"):
        encoders = run(["ffmpeg", "-hide_banner", "-encoders"]) or ""
        info["ffmpeg_encoders"] = {e: e in encoders for e in ("libopus", "libmp3lame")}
    smi = run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
    if smi:
        name, mem, driver = [s.strip() for s in smi.split("\n")[0].split(",")]
        info["gpu"], info["vram_gb"], info["driver"] = name, round(int(mem) / 1024, 1), driver
    try:
        import torch

        info["torch"] = torch.__version__
        info["cuda"] = torch.version.cuda if torch.cuda.is_available() else None
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            info["vram_free_gb"] = round(free / 1024**3, 1)
    except ImportError:
        pass
    try:
        from importlib.metadata import version

        info["chatterbox"] = version("chatterbox-tts")
    except Exception:
        pass

    # Recommendation: the 500M T3 + S3Gen fit comfortably in 6 GB; below that, CPU.
    if info["cuda"] and (info["vram_gb"] or 0) >= 6:
        info["recommended_device"] = "cuda"
    else:
        info["recommended_device"] = "cpu"

    problems = []
    if not info["ffmpeg"]:
        problems.append("FFmpeg missing: install it with the system package manager.")
    elif not all(info["ffmpeg_encoders"].values()):
        problems.append(f"FFmpeg lacks a required encoder: {info['ffmpeg_encoders']}")
    if not info["torch"]:
        problems.append("PyTorch missing: run the README install inside .venv.")
    if not info["chatterbox"]:
        problems.append("chatterbox-tts missing.")
    if info["recommended_device"] == "cpu":
        problems.append("No CUDA GPU with 6 GB+: generation runs on CPU, much slower.")
    info["problems"] = problems

    if args.json:
        print(json.dumps(info, indent=2, ensure_ascii=False))
    else:
        for key, value in info.items():
            if key != "problems":
                print(f"{key:>18}: {value}")
        print("\n" + ("\n".join(f"! {p}" for p in problems) if problems else "All set to generate."))
    return 1 if any("missing" in p for p in problems) else 0


if __name__ == "__main__":
    sys.exit(main())
