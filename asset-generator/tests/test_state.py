from assetgen.state import State


def test_state_survives_reopening(tmp_path):
    db = tmp_path / "state.db"
    s = State(db)
    s.ensure_asset("table", "validation")
    cid = s.add_candidate("table", 1, 1, 1, 42)
    s.update_candidate(cid, "generating", meta={"seed": 42})
    s.close()

    s = State(db)
    cand = s.candidate(cid)
    assert cand["status"] == "generating" and cand["seed"] == 42
    assert [e["to_status"] for e in s.history("table")] == ["pending", "pending", "generating"]


def test_reset_in_flight_requeues_interrupted_work(tmp_path):
    s = State(tmp_path / "state.db")
    s.ensure_asset("table", "validation")
    a = s.add_candidate("table", 1, 1, 1, 1)
    b = s.add_candidate("table", 1, 2, 1, 2)
    c = s.add_candidate("table", 1, 3, 1, 3)
    s.update_candidate(a, "generating")
    s.update_candidate(b, "processing")
    s.update_candidate(c, "validated")
    assert s.reset_in_flight() == 2
    assert [x["status"] for x in s.candidates("table")] == ["pending", "pending", "validated"]


def test_review_log_folds_to_latest_decision(tmp_path):
    s = State(tmp_path / "state.db")
    s.ensure_asset("table", "validation")
    a, b = s.add_candidate("table", 1, 1, 1, 1), s.add_candidate("table", 1, 2, 1, 2)
    s.add_review("table", a, "selected")
    s.add_review("table", b, "rejected", "legs too thin")
    s.add_review("table", b, "selected")
    summary = s.review_summary("table")
    assert summary["selected"] == b and summary["rejected"] == []
    assert summary["notes"][0]["note"] == "legs too thin"
    s.add_review("table", b, "rejected")
    assert s.review_summary("table")["selected"] is None


def test_asset_status_changes_are_logged(tmp_path):
    s = State(tmp_path / "state.db")
    s.ensure_asset("table", "validation")
    s.set_asset_status("table", "generating")
    s.set_asset_status("table", "validated")
    assert [e["to_status"] for e in s.history("table")] == ["pending", "generating", "validated"]
