"""Persistent state in SQLite: assets, candidates, history, reviews and approvals.

Candidates are never overwritten: a retry or a new round adds a row and new
files. Every status change is appended to `events`, so each asset keeps its
full history across restarts.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

STATUSES = ("pending", "generating", "generated", "processing", "validated", "failed", "approved", "rejected")
# Interrupted work goes back to pending on resume.
IN_FLIGHT = ("generating", "processing")

SCHEMA = """
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  catalog TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  status TEXT NOT NULL,
  raw_path TEXT,
  sprite_path TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  qc TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  UNIQUE (asset_id, round, slot, attempt)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  candidate_id INTEGER,
  from_status TEXT,
  to_status TEXT NOT NULL,
  detail TEXT,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  candidate_id INTEGER,
  decision TEXT NOT NULL CHECK (decision IN ('selected', 'rejected', 'cleared', 'note')),
  note TEXT,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase TEXT NOT NULL,
  payload TEXT NOT NULL,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  started_at REAL NOT NULL,
  finished_at REAL,
  stats TEXT NOT NULL DEFAULT '{}'
);
"""


class State:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=30, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)

    def close(self) -> None:
        self.db.close()

    # -- assets -----------------------------------------------------------
    def ensure_asset(self, asset_id: str, catalog: str) -> None:
        with self.db:
            cur = self.db.execute("INSERT OR IGNORE INTO assets VALUES (?, ?, 'pending', ?)",
                                  (asset_id, catalog, time.time()))
            if cur.rowcount:
                self._event(asset_id, None, None, "pending", "registered")

    def asset(self, asset_id: str) -> sqlite3.Row | None:
        return self.db.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()

    def assets(self, catalog: str | None = None) -> list[sqlite3.Row]:
        if catalog:
            return self.db.execute("SELECT * FROM assets WHERE catalog = ? ORDER BY id", (catalog,)).fetchall()
        return self.db.execute("SELECT * FROM assets ORDER BY catalog, id").fetchall()

    def set_asset_status(self, asset_id: str, status: str, detail: str | None = None) -> None:
        assert status in STATUSES, status
        row = self.asset(asset_id)
        if row is None or row["status"] == status:
            return
        with self.db:
            self.db.execute("UPDATE assets SET status = ?, updated_at = ? WHERE id = ?",
                            (status, time.time(), asset_id))
            self._event(asset_id, None, row["status"], status, detail)

    # -- candidates -------------------------------------------------------
    def current_round(self, asset_id: str) -> int:
        row = self.db.execute("SELECT MAX(round) AS r FROM candidates WHERE asset_id = ?", (asset_id,)).fetchone()
        return row["r"] or 0

    def add_candidate(self, asset_id: str, round_: int, slot: int, attempt: int, seed: int) -> int:
        now = time.time()
        with self.db:
            cur = self.db.execute(
                "INSERT INTO candidates (asset_id, round, slot, attempt, seed, status, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)", (asset_id, round_, slot, attempt, seed, now, now))
            self._event(asset_id, cur.lastrowid, None, "pending", f"round {round_} slot {slot} attempt {attempt}")
        return cur.lastrowid

    def candidate(self, candidate_id: int) -> sqlite3.Row:
        return self.db.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()

    def candidates(self, asset_id: str | None = None, status: str | None = None) -> list[sqlite3.Row]:
        sql, args = "SELECT * FROM candidates WHERE 1=1", []
        if asset_id:
            sql += " AND asset_id = ?"
            args.append(asset_id)
        if status:
            sql += " AND status = ?"
            args.append(status)
        return self.db.execute(sql + " ORDER BY asset_id, round, slot, attempt", args).fetchall()

    def update_candidate(self, candidate_id: int, status: str, detail: str | None = None, **fields) -> None:
        assert status in STATUSES, status
        row = self.candidate(candidate_id)
        for key in ("meta", "qc"):
            if key in fields and not isinstance(fields[key], str):
                fields[key] = json.dumps(fields[key], sort_keys=True)
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self.db:
            self.db.execute(f"UPDATE candidates SET status = ?, updated_at = ?{', ' + cols if cols else ''}"
                            " WHERE id = ?", (status, time.time(), *fields.values(), candidate_id))
            # A detail is worth recording even when the status stays (e.g. a reprocess).
            if row["status"] != status or detail:
                self._event(row["asset_id"], candidate_id, row["status"], status, detail)

    def reset_in_flight(self) -> int:
        """Return candidates interrupted mid-run to pending. Their partial files are left on disk."""
        rows = self.db.execute(
            f"SELECT id FROM candidates WHERE status IN ({','.join('?' * len(IN_FLIGHT))})", IN_FLIGHT).fetchall()
        for row in rows:
            self.update_candidate(row["id"], "pending", "interrupted run, requeued")
        return len(rows)

    # -- history, reviews, approvals ---------------------------------------
    def _event(self, asset_id, candidate_id, from_status, to_status, detail) -> None:
        self.db.execute("INSERT INTO events (asset_id, candidate_id, from_status, to_status, detail, at)"
                        " VALUES (?, ?, ?, ?, ?, ?)", (asset_id, candidate_id, from_status, to_status, detail,
                                                       time.time()))

    def history(self, asset_id: str) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM events WHERE asset_id = ? ORDER BY id", (asset_id,)).fetchall()

    def add_review(self, asset_id: str, candidate_id: int | None, decision: str, note: str | None = None) -> None:
        with self.db:
            self.db.execute("INSERT INTO reviews (asset_id, candidate_id, decision, note, at) VALUES (?, ?, ?, ?, ?)",
                            (asset_id, candidate_id, decision, note, time.time()))

    def review_summary(self, asset_id: str) -> dict:
        """Fold the review log: the latest selection wins, rejections stick until cleared."""
        selected, rejected, notes = None, set(), []
        for row in self.db.execute("SELECT * FROM reviews WHERE asset_id = ? ORDER BY id", (asset_id,)):
            cid = row["candidate_id"]
            if row["decision"] == "selected":
                selected = cid
                rejected.discard(cid)
            elif row["decision"] == "rejected":
                rejected.add(cid)
                if selected == cid:
                    selected = None
            elif row["decision"] == "cleared":
                rejected.discard(cid)
                if selected == cid:
                    selected = None
            if row["note"]:
                notes.append({"candidate_id": cid, "note": row["note"], "at": row["at"]})
        return {"selected": selected, "rejected": sorted(rejected), "notes": notes}

    def add_approval(self, phase: str, payload: dict) -> None:
        with self.db:
            self.db.execute("INSERT INTO approvals (phase, payload, at) VALUES (?, ?, ?)",
                            (phase, json.dumps(payload, sort_keys=True), time.time()))

    def latest_approval(self, phase: str) -> dict | None:
        row = self.db.execute("SELECT * FROM approvals WHERE phase = ? ORDER BY id DESC LIMIT 1", (phase,)).fetchone()
        return json.loads(row["payload"]) | {"at": row["at"]} if row else None

    # -- runs ---------------------------------------------------------------
    def start_run(self, command: str) -> int:
        with self.db:
            return self.db.execute("INSERT INTO runs (command, started_at) VALUES (?, ?)",
                                   (command, time.time())).lastrowid

    def finish_run(self, run_id: int, stats: dict) -> None:
        with self.db:
            self.db.execute("UPDATE runs SET finished_at = ?, stats = ? WHERE id = ?",
                            (time.time(), json.dumps(stats, sort_keys=True), run_id))
