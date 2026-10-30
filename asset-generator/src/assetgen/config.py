"""Load and validate settings, style profiles and catalogs."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
KINDS = {"sprite", "tile"}
ANCHORS = {"bottom_center", "center", "top_left"}
CATEGORIES = {"environment", "furniture", "decorations", "characters", "effects", "table"}


class ConfigError(ValueError):
    pass


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_yaml(path: Path) -> dict:
    try:
        data = yaml.safe_load(path.read_text())
    except FileNotFoundError as err:
        raise ConfigError(f"missing file: {path}") from err
    if not isinstance(data, dict):
        raise ConfigError(f"{path}: expected a mapping at the top level")
    return data


@dataclass
class Project:
    root: Path

    @property
    def settings(self) -> dict:
        return load_yaml(self.root / "config" / "settings.yaml")

    def path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts)

    def style_path(self, style_id: str) -> Path:
        return self.root / "config" / "styles" / f"{style_id}.yaml"

    def style(self, style_id: str) -> dict:
        style = load_yaml(self.style_path(style_id))
        validate_style(style, style_id)
        return style

    def style_ids(self) -> list[str]:
        return sorted(p.stem for p in (self.root / "config" / "styles").glob("*.yaml"))

    def catalog_names(self) -> list[str]:
        return sorted(p.stem for p in (self.root / "catalogs").glob("*.yaml"))

    def catalog(self, name: str) -> list[dict]:
        data = load_yaml(self.root / "catalogs" / f"{name}.yaml")
        return validate_catalog(data, name, set(self.style_ids()))


def validate_style(style: dict, style_id: str) -> None:
    if style.get("id") != style_id:
        raise ConfigError(f"style {style_id}: id field is {style.get('id')!r}")
    for key in ("reference", "prompt", "generation", "palette", "processing"):
        if key not in style:
            raise ConfigError(f"style {style_id}: missing '{key}'")
    for key in ("prefix", "suffix", "negative"):
        if key not in style["prompt"]:
            raise ConfigError(f"style {style_id}: missing prompt.{key}")
    gen = style["generation"]
    for key in ("checkpoint", "vae", "loras", "steps", "cfg", "sampler", "scheduler", "seed_salt"):
        if key not in gen:
            raise ConfigError(f"style {style_id}: missing generation.{key}")


def validate_catalog(data: dict, name: str, styles: set[str]) -> list[dict]:
    assets = data.get("assets")
    if not isinstance(assets, list) or not assets:
        raise ConfigError(f"catalog {name}: 'assets' must be a non-empty list")
    seen: set[str] = set()
    out = []
    for i, asset in enumerate(assets):
        where = f"catalog {name}, asset #{i + 1}"
        if not isinstance(asset, dict):
            raise ConfigError(f"{where}: expected a mapping")
        aid = asset.get("id", "")
        if not ID_RE.match(str(aid)):
            raise ConfigError(f"{where}: id {aid!r} must be snake_case")
        if aid in seen:
            raise ConfigError(f"{where}: duplicate id {aid}")
        seen.add(aid)
        for key in ("name", "category", "style", "kind", "description", "prompt", "target_size"):
            if key not in asset:
                raise ConfigError(f"{where} ({aid}): missing '{key}'")
        if asset["category"] not in CATEGORIES:
            raise ConfigError(f"{where} ({aid}): unknown category {asset['category']!r}")
        if asset["style"] not in styles:
            raise ConfigError(f"{where} ({aid}): unknown style {asset['style']!r}")
        if asset["kind"] not in KINDS:
            raise ConfigError(f"{where} ({aid}): kind must be one of {sorted(KINDS)}")
        size = asset["target_size"]
        if not (isinstance(size, dict) and all(isinstance(size.get(k), int) and size[k] > 0
                                                for k in ("width", "height"))):
            raise ConfigError(f"{where} ({aid}): target_size needs positive integer width/height")
        anchor = asset.setdefault("anchor", "top_left" if asset["kind"] == "tile" else "bottom_center")
        if anchor not in ANCHORS:
            raise ConfigError(f"{where} ({aid}): anchor must be one of {sorted(ANCHORS)}")
        if asset["kind"] == "tile" and asset.get("transparent"):
            raise ConfigError(f"{where} ({aid}): tiles cannot be transparent")
        asset.setdefault("transparent", asset["kind"] == "sprite")
        asset.setdefault("variants", [])
        gen = asset.setdefault("generation", {})
        gen.setdefault("candidates", 3)
        gen.setdefault("max_retries", 3)
        if not (1 <= gen["candidates"] <= 8 and 0 <= gen["max_retries"] <= 10):
            raise ConfigError(f"{where} ({aid}): candidates must be 1-8 and max_retries 0-10")
        asset["catalog"] = name
        out.append(asset)
    return out
