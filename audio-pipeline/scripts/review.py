"""Servidor local da revisão: serve review/index.html, os áudios de output/ e grava as decisões
em manifests/review.json. Só escuta em 127.0.0.1 e não usa nada externo.

    python scripts/review.py              # http://127.0.0.1:8765
    python scripts/review.py --port 9000
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUTPUT, ROOT, SELECTED, characters, load_lines, load_review, rel, save_review  # noqa: E402

ROOTS = {"candidates": "Biblioteca", "phase_b": "Fase B (estilos)", "smoke": "Teste (voz embutida)"}
STATUSES = {"pending", "approved", "rejected"}


def catalog() -> dict:
    lines = load_lines()
    review = load_review()["takes"]
    cast = characters()
    takes = []
    for root, label in ROOTS.items():
        base = OUTPUT / root
        for meta_path in sorted(base.glob("*/*/*.json")):
            wav = meta_path.with_suffix(".wav")
            if not wav.exists():
                continue
            meta = json.loads(meta_path.read_text())
            path = rel(wav)
            processed = SELECTED / wav.relative_to(OUTPUT / "candidates") if root == "candidates" \
                else SELECTED / root / wav.relative_to(base)
            state = review.get(path, {})
            takes.append({
                "path": path,
                "root": root,
                "character": meta["character"],
                "line_id": meta["line_id"],
                "category": meta["category"],
                "style": meta.get("style"),
                "variant": meta["variant"],
                "text": meta["text"],
                "spoken_text": meta["spoken_text"],
                "params": meta["params"],
                "seed": meta["seed"],
                "model": meta["model"],
                "reference": meta["reference"],
                "duration_s": meta["duration_s"],
                "warnings": meta.get("warnings", []),
                "asr": meta.get("asr"),
                "processed": rel(processed) if processed.exists() else None,
                "status": state.get("status", "pending"),
                "best": state.get("best", False),
                "note": state.get("note", ""),
            })
    names = {cid: c["name"] for cid, c in cast.items()} | {"padrao": "Voz embutida"}
    return {"roots": ROOTS, "characters": names, "categories": lines["categories"],
            "lines": [{k: l[k] for k in ("id", "category", "text", "number")} for l in lines["lines"]],
            "takes": takes}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # silencioso
        pass

    def send_json(self, data, status=200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path in ("/", "/index.html"):
            self.serve_file(ROOT / "review" / "index.html", "text/html; charset=utf-8")
        elif url.path == "/api/catalog":
            self.send_json(catalog())
        elif url.path.startswith("/audio/"):
            target = (ROOT / unquote(url.path[len("/audio/"):])).resolve()
            if OUTPUT.resolve() not in target.parents or target.suffix not in (".wav", ".ogg", ".mp3"):
                self.send_error(404)
                return
            kind = {".wav": "audio/wav", ".ogg": "audio/ogg", ".mp3": "audio/mpeg"}[target.suffix]
            self.serve_file(target, kind)
        else:
            self.send_error(404)

    def serve_file(self, path: Path, kind: str) -> None:
        if not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/review":
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        path = body["path"]
        if not (ROOT / path).is_file() or not path.startswith("output/"):
            self.send_json({"error": "tomada desconhecida"}, 400)
            return
        review = load_review()
        entry = review["takes"].setdefault(path, {})
        if "status" in body:
            if body["status"] not in STATUSES:
                self.send_json({"error": "status inválido"}, 400)
                return
            entry["status"] = body["status"]
            if body["status"] == "rejected":
                entry["best"] = False
        if "note" in body:
            entry["note"] = body["note"]
        if body.get("best"):
            # Só uma melhor por personagem, fala e pasta (estilo ou categoria).
            folder = str(Path(path).parent)
            prefix = Path(path).stem.rsplit("_", 1)[0]
            for other, state in review["takes"].items():
                if str(Path(other).parent) == folder and Path(other).stem.rsplit("_", 1)[0] == prefix:
                    state["best"] = False
            entry["best"] = True
            entry["status"] = "approved"
        elif body.get("best") is False:
            entry["best"] = False
        entry["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        save_review(review)
        self.send_json({"ok": True, "take": entry})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"revisão em http://127.0.0.1:{args.port}  (Ctrl+C para sair)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
