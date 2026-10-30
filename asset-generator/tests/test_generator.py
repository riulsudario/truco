"""Run-loop logic with a fake backend. These prove retries, resume and file
safety; they do NOT prove that real generation works (see tests/integration)."""
import pytest
from PIL import Image

from assetgen.generator import Generator
from assetgen.state import State
from conftest import blob_image


class FakeBackend:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = 0

    def prepare_reference(self, path, crops=None):
        return "ref.png"

    def generate(self, graph):
        self.calls += 1
        return self.behaviour(self.calls, graph)

    def finish(self):
        pass

    def info(self):
        return {"backend": "fake"}


def good(call, graph):
    if graph["13"]["inputs"]["filename_prefix"].endswith("terracotta_floor"):
        return Image.new("RGB", (1024, 1024), (190, 90, 50))
    return blob_image()


def setup(project, backend, ids=("wooden_truco_table",)):
    state = State(project.path("output", "state.db"))
    assets = [a for a in project.catalog("validation") if a["id"] in ids]
    return state, assets, Generator(project, state, backend, log=lambda *_: None)


def test_candidates_are_generated_processed_and_recorded(project):
    state, assets, gen = setup(project, FakeBackend(good), ("wooden_truco_table", "terracotta_floor"))
    gen.plan(assets)
    stats = gen.run(assets)
    assert stats["validated"] == 6 and stats["failed"] == 0
    for c in state.candidates():
        assert c["status"] == "validated"
        assert project.path(c["sprite_path"]).exists() and project.path(c["raw_path"]).exists()
    assert state.asset("terracotta_floor")["status"] == "validated"


def test_retries_stop_at_the_limit(project):
    def broken(call, graph):
        raise RuntimeError("CUDA out of memory")
    backend = FakeBackend(broken)
    state, assets, gen = setup(project, backend)
    assets[0]["generation"] = {"candidates": 2, "max_retries": 2}
    gen.plan(assets)
    stats = gen.run(assets)
    assert backend.calls == 2 * (1 + 2)
    assert stats["failed"] == 6 and stats["retries"] == 4
    assert state.asset("wooden_truco_table")["status"] == "failed"
    assert all("out of memory" in c["error"] for c in state.candidates())


def test_failed_qc_triggers_a_retry_with_a_new_seed(project):
    def first_bad(call, graph):
        return Image.new("RGBA", (1024, 1024)) if call == 1 else blob_image()
    state, assets, gen = setup(project, FakeBackend(first_bad))
    assets[0]["generation"] = {"candidates": 1, "max_retries": 3}
    gen.plan(assets)
    gen.run(assets)
    first, second = state.candidates("wooden_truco_table")
    assert first["status"] == "failed" and second["status"] == "validated"
    assert first["seed"] != second["seed"] and second["attempt"] == 2


def test_interrupted_run_resumes_without_losing_results(project):
    def crash_on_second(call, graph):
        if call == 2:
            raise KeyboardInterrupt
        return blob_image()
    state, assets, gen = setup(project, FakeBackend(crash_on_second))
    gen.plan(assets)
    with pytest.raises(KeyboardInterrupt):
        gen.run(assets)
    assert [c["status"] for c in state.candidates()] == ["validated", "generating", "pending"]
    state.close()

    # A new process: reopen the database, requeue and finish.
    state, assets, gen = setup(project, FakeBackend(good))
    assert state.reset_in_flight() == 1
    gen.run(assets)
    assert [c["status"] for c in state.candidates()] == ["validated"] * 3


def test_new_round_keeps_old_candidates_and_files(project):
    state, assets, gen = setup(project, FakeBackend(good))
    gen.plan(assets)
    gen.run(assets)
    first_files = {c["sprite_path"] for c in state.candidates()}
    gen.plan(assets, new_round=True)
    gen.run(assets)
    rows = state.candidates()
    assert len(rows) == 6 and {c["round"] for c in rows} == {1, 2}
    assert first_files < {c["sprite_path"] for c in rows}
    assert all(project.path(p).exists() for p in first_files)


def test_existing_files_are_never_overwritten(project):
    state, assets, gen = setup(project, FakeBackend(good))
    gen.plan(assets)
    cand = state.candidates()[0]
    out = gen.output_dir(assets[0])
    out.mkdir(parents=True)
    (out / f"r1_s1_a1_{cand['seed']}_raw.png").write_bytes(b"precious")
    with pytest.raises(FileExistsError):
        gen.run_candidate(assets[0], cand)
    assert (out / f"r1_s1_a1_{cand['seed']}_raw.png").read_bytes() == b"precious"


def test_reprocess_redoes_the_downscale_at_the_current_size_and_keeps_old_files(project):
    state, assets, gen = setup(project, FakeBackend(good))
    gen.plan(assets)
    gen.run(assets)
    before = {c["id"]: c["sprite_path"] for c in state.candidates()}
    assets[0]["target_size"] = {"width": 96, "height": 96}
    done = gen.reprocess(assets)
    assert len(done) == 3 and all(d["ok"] for d in done)
    for c in state.candidates():
        assert c["sprite_path"].endswith("_96x96.png") and c["status"] == "validated"
        assert Image.open(project.path(c["sprite_path"])).size == (96, 96)
        assert project.path(c["sprite_path"][:-4] + "_x8.png").exists()
        assert project.path(before[c["id"]]).exists()
    assert any(e["detail"] == "reprocessed at 96x96" for e in state.history("wooden_truco_table"))
    # Already at the current size: nothing to do, and no file is ever overwritten.
    assert gen.reprocess(assets) == []
