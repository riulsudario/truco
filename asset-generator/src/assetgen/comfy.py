"""Minimal ComfyUI HTTP client: start the server, queue a graph, fetch images."""
from __future__ import annotations

import io
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from PIL import Image


class ComfyError(RuntimeError):
    pass


class ComfyClient:
    def __init__(self, root: Path, settings: dict):
        cfg = settings["comfyui"]
        self.root = root
        self.dir = root / cfg["dir"]
        self.base = f"http://{cfg['host']}:{cfg['port']}"
        self.cfg = cfg
        self.client_id = uuid.uuid4().hex
        self.process: subprocess.Popen | None = None

    # -- HTTP helpers -----------------------------------------------------
    def _get(self, path: str, timeout: float = 10) -> bytes:
        with urllib.request.urlopen(self.base + path, timeout=timeout) as resp:
            return resp.read()

    def _post(self, path: str, payload: dict, timeout: float = 30) -> bytes:
        req = urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            raise ComfyError(f"{path} -> HTTP {err.code}: {err.read().decode(errors='replace')[:2000]}") from err

    # -- server lifecycle -------------------------------------------------
    def is_up(self) -> bool:
        try:
            self._get("/system_stats", timeout=2)
            return True
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            return False

    def system_stats(self) -> dict:
        return json.loads(self._get("/system_stats"))

    def ensure_server(self, log_path: Path) -> None:
        if self.is_up():
            return
        if not (self.dir / "main.py").exists():
            raise ComfyError(f"ComfyUI not found at {self.dir}; see README (setup)")
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = open(log_path, "ab")
        cmd = [sys.executable, "main.py", "--listen", self.cfg["host"], "--port", str(self.cfg["port"]),
               *self.cfg.get("extra_args", [])]
        self.process = subprocess.Popen(cmd, cwd=self.dir, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.time() + self.cfg["startup_timeout"]
        while time.time() < deadline:
            if self.process.poll() is not None:
                raise ComfyError(f"ComfyUI exited with code {self.process.returncode}; see {log_path}")
            if self.is_up():
                return
            time.sleep(1)
        raise ComfyError(f"ComfyUI did not start in {self.cfg['startup_timeout']}s; see {log_path}")

    def stop_server(self) -> None:
        """Stop the server only if this client started it."""
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None

    def free(self) -> None:
        self._post("/free", {"unload_models": True, "free_memory": True})

    def object_info(self, node: str) -> dict:
        return json.loads(self._get(f"/object_info/{node}"))

    # -- inputs and prompts -----------------------------------------------
    def input_dir(self) -> Path:
        return self.dir / "input"

    def run(self, graph: dict) -> list[Image.Image]:
        """Queue a graph and return the images of every SaveImage node, in node order."""
        resp = json.loads(self._post("/prompt", {"prompt": graph, "client_id": self.client_id}))
        if resp.get("node_errors"):
            raise ComfyError(f"node errors: {json.dumps(resp['node_errors'])[:2000]}")
        prompt_id = resp["prompt_id"]
        deadline = time.time() + self.cfg["prompt_timeout"]
        while time.time() < deadline:
            history = json.loads(self._get(f"/history/{prompt_id}"))
            if prompt_id in history:
                return self._collect(history[prompt_id])
            time.sleep(0.5)
        raise ComfyError(f"prompt {prompt_id} did not finish in {self.cfg['prompt_timeout']}s")

    def _collect(self, entry: dict) -> list[Image.Image]:
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            messages = [m for m in status.get("messages", []) if m[0] == "execution_error"]
            detail = messages[0][1].get("exception_message", "") if messages else "unknown"
            raise ComfyError(f"execution error: {detail.strip()[:2000]}")
        images = []
        for node_id in sorted(entry.get("outputs", {}), key=lambda k: int(k) if k.isdigit() else k):
            for img in entry["outputs"][node_id].get("images", []):
                query = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img["subfolder"],
                                                "type": img["type"]})
                images.append(Image.open(io.BytesIO(self._get(f"/view?{query}", timeout=60))).copy())
        if not images:
            raise ComfyError("prompt finished without images")
        return images
