import argparse

import pytest
import yaml

import generate
from assetgen.approval import ApprovalError, approve, require_approval
from assetgen.generator import Generator
from assetgen.state import State
from conftest import blob_image
from test_generator import FakeBackend, good


def varied(call, graph):
    if graph["13"]["inputs"]["filename_prefix"].endswith("terracotta_floor"):
        return good(call, graph)
    return blob_image(colour=[(120, 72, 40), (40, 120, 60), (60, 80, 160), (160, 40, 40)][call % 4])


def generated(project, behaviour=good):
    state = State(project.path("output", "state.db"))
    assets = project.catalog("validation")
    gen = Generator(project, state, FakeBackend(behaviour), log=lambda *_: None)
    gen.plan(assets)
    gen.run(assets)
    return state, assets


def select_first(state, assets):
    for a in assets:
        state.add_review(a["id"], state.candidates(a["id"])[0]["id"], "selected")


def write_production_catalog(project):
    project.path("catalogs", "furniture.yaml").write_text(yaml.safe_dump({"assets": [{
        "id": "bar_stool", "name": "Stool", "category": "furniture", "style": "world_topdown", "kind": "sprite",
        "description": "d", "prompt": "p", "target_size": {"width": 16, "height": 24}}]}))


def test_production_is_blocked_without_approval(project, monkeypatch, capsys):
    write_production_catalog(project)
    monkeypatch.setattr(generate, "run_generation", lambda *a, **k: pytest.fail("must not generate"))
    assert generate.cmd_production(project, argparse.Namespace()) == 3
    assert "no style approval" in capsys.readouterr().out
    assert generate.cmd_production(project, argparse.Namespace(), only="furniture") == 3


def test_opening_the_preview_or_selecting_is_not_approval(project):
    state, assets = generated(project)
    select_first(state, assets)
    with pytest.raises(ApprovalError, match="no style approval"):
        require_approval(project, state, ["world_topdown"])


def test_approval_needs_a_selection_for_every_asset(project):
    state, assets = generated(project)
    state.add_review(assets[0]["id"], state.candidates(assets[0]["id"])[0]["id"], "selected")
    with pytest.raises(ApprovalError, match="no candidate selected"):
        approve(project, state, assets, None)


def test_approval_freezes_style_and_copies_selections(project):
    state, assets = generated(project)
    select_first(state, assets)
    payload = approve(project, state, assets, "ok")
    assert require_approval(project, state, ["world_topdown"])["selections"] == payload["selections"]
    assert project.path("output", "approved", "sprites", "wooden_truco_table.png").exists()
    assert project.path("output", "approved", "atlas", "validation.json").exists()
    assert project.path("output", "approved", "atlas", "validation_tiles.tsj").exists()
    assert all(state.asset(a["id"])["status"] == "approved" for a in assets)
    with pytest.raises(ApprovalError, match="never approved"):
        require_approval(project, state, ["table_perspective"])


def test_changing_the_style_after_approval_blocks_production(project):
    state, assets = generated(project)
    select_first(state, assets)
    approve(project, state, assets, None)
    path = project.style_path("world_topdown")
    path.write_text(path.read_text() + "\n# tweaked after approval\n")
    with pytest.raises(ApprovalError, match="world_topdown.profile_sha256"):
        require_approval(project, state, ["world_topdown"])


def test_approved_files_are_not_overwritten_by_a_second_approval(project):
    state, assets = generated(project, varied)
    select_first(state, assets)
    approve(project, state, assets, None)
    first = project.path("output", "approved", "sprites", "wooden_truco_table.png").read_bytes()
    state.add_review("wooden_truco_table", state.candidates("wooden_truco_table")[1]["id"], "selected")
    approve(project, state, assets, None)
    assert project.path("output", "approved", "sprites", "wooden_truco_table.png").read_bytes() == first
    assert len(list(project.path("output", "approved", "sprites").glob("wooden_truco_table.*.png"))) >= 1
