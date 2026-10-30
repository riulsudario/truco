"""Local review page: candidates, metadata, demo scene, selections and notes.

Reviews are stored in the state database. Selecting a candidate here is not an
approval: approval only happens through `generate.py approve`.
"""
from __future__ import annotations

import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .config import Project, load_yaml
from .scene import build_validation_scene, choose_candidates
from .state import State

SERVED_DIRS = ("output", "references")


def snapshot(project: Project, state: State) -> dict:
    assets = []
    catalog_assets = {}
    for name in project.catalog_names():
        try:
            for a in project.catalog(name):
                catalog_assets[a["id"]] = a
        except Exception:  # noqa: BLE001 - a broken catalog should not hide the others
            continue
    rows = state.assets()
    chosen = choose_candidates(state, [r["id"] for r in rows])
    for row in rows:
        spec = catalog_assets.get(row["id"], {})
        cands = []
        for c in state.candidates(row["id"]):
            meta = json.loads(c["meta"])
            meta.pop("graph", None)
            base = c["sprite_path"][:-4] if c["sprite_path"] else None
            cands.append({
                "id": c["id"], "round": c["round"], "slot": c["slot"], "attempt": c["attempt"],
                "seed": c["seed"], "status": c["status"], "error": c["error"],
                "sprite": c["sprite_path"], "raw": c["raw_path"],
                "x8": f"{base}_x8.png" if base else None,
                "tiled": f"{base}_tiled5x5.png" if base and spec.get("kind") == "tile" else None,
                "qc": json.loads(c["qc"]), "meta": meta,
            })
        assets.append({
            "id": row["id"], "catalog": row["catalog"], "status": row["status"],
            "name": spec.get("name", row["id"]), "kind": spec.get("kind"), "category": spec.get("category"),
            "description": spec.get("description"), "target_size": spec.get("target_size"),
            "style": spec.get("style"), "candidates": cands, "review": state.review_summary(row["id"]),
            "chosen": ({"candidate_id": chosen[row["id"]]["candidate"]["id"], "by": chosen[row["id"]]["by"]}
                       if row["id"] in chosen else None),
            "history": [dict(e) for e in state.history(row["id"])],
        })
    layout_path = project.path("config", "scene_validation.yaml")
    return {
        "assets": assets,
        "scene_layout": load_yaml(layout_path) if layout_path.exists() else None,
        "approval": state.latest_approval("style"),
        "report": _read_json(project.path("output", "reports", "validation_report.json")),
    }


def _read_json(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


def make_handler(project: Project, state_path: Path):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):  # quiet
            pass

        def _json(self, payload, status=HTTPStatus.OK):
            body = json.dumps(payload, default=str).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _file(self, path: Path):
            if not path.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            data = path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = unquote(urlparse(self.path).path)
            if path in ("/", "/index.html"):
                return self._file(project.path("preview", "index.html"))
            if path == "/api/state":
                state = State(state_path)
                try:
                    return self._json(snapshot(project, state))
                finally:
                    state.close()
            if path.startswith("/files/"):
                rel = Path(path[len("/files/"):])
                target = (project.root / rel).resolve()
                allowed = [(project.root / d).resolve() for d in SERVED_DIRS]
                if not any(target.is_relative_to(a) for a in allowed):
                    return self.send_error(HTTPStatus.FORBIDDEN)
                return self._file(target)
            self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self):
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, HTTPStatus.BAD_REQUEST)
            state = State(state_path)
            try:
                if path == "/api/review":
                    decision = body.get("decision")
                    if decision not in ("selected", "rejected", "cleared", "note"):
                        return self._json({"error": "bad decision"}, HTTPStatus.BAD_REQUEST)
                    asset_id = body.get("asset_id")
                    cid = body.get("candidate_id")
                    if state.asset(asset_id) is None:
                        return self._json({"error": "unknown asset"}, HTTPStatus.BAD_REQUEST)
                    if cid is not None and (state.candidate(cid) is None
                                            or state.candidate(cid)["asset_id"] != asset_id):
                        return self._json({"error": "unknown candidate"}, HTTPStatus.BAD_REQUEST)
                    note = (body.get("note") or "").strip()[:2000] or None
                    state.add_review(asset_id, cid, decision, note)
                    return self._json(state.review_summary(asset_id))
                if path == "/api/scene":
                    return self._json(build_validation_scene(project, state))
                self.send_error(HTTPStatus.NOT_FOUND)
            finally:
                state.close()

    return Handler


def serve(project: Project, state_path: Path, host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), make_handler(project, state_path))
    print(f"preview: http://{host}:{port}/  (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
