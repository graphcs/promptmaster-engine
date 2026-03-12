"""Session persistence for PromptMaster Engine.

Stores sessions as individual JSON files in ~/.promptmaster/sessions/.
Ephemeral on Streamlit Cloud but functional within a deploy cycle.
"""

import json
import logging
from pathlib import Path
from .schemas import Session

logger = logging.getLogger(__name__)

DEFAULT_DIR = Path.home() / ".promptmaster" / "sessions"


class SessionStore:
    """File-based session storage, scoped per browser via subdirectory."""

    def __init__(self, directory: Path = DEFAULT_DIR, subdirectory: str | None = None):
        self.directory = directory / subdirectory if subdirectory else directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return self.directory / f"{session_id}.json"

    def save(self, session: Session) -> None:
        self._path(session.session_id).write_text(
            session.model_dump_json(indent=2), encoding="utf-8"
        )
        logger.info(f"Session saved: {session.session_id}")

    def load(self, session_id: str) -> Session | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            return Session.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
            return None

    def list_sessions(self, limit: int = 20) -> list[dict]:
        """Return summaries of saved sessions, newest first."""
        entries = []
        for path in sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                entries.append({
                    "session_id": data.get("session_id", path.stem),
                    "objective": data.get("objective", "")[:80],
                    "mode": data.get("mode", ""),
                    "iterations": len(data.get("iterations", [])),
                    "created_at": data.get("created_at", ""),
                    "finalized": data.get("finalized", False),
                })
            except Exception:
                continue
            if len(entries) >= limit:
                break
        return entries

    def delete(self, session_id: str) -> None:
        path = self._path(session_id)
        if path.exists():
            path.unlink()
            logger.info(f"Session deleted: {session_id}")
