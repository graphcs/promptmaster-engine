"""Session persistence for PromptMaster Engine.

Stores sessions in Supabase PostgreSQL, scoped per user via RLS.
"""

import json
import logging
from .schemas import Session
from .db import get_supabase

logger = logging.getLogger(__name__)


class SessionStore:
    """Supabase-backed session storage, scoped per user."""

    def __init__(self, user_id: str, access_token: str):
        self.user_id = user_id
        self.access_token = access_token

    def _client(self):
        sb = get_supabase()
        sb.postgrest.auth(self.access_token)
        return sb

    def save(self, session: Session) -> None:
        try:
            data = {
                "user_id": self.user_id,
                "session_id": session.session_id,
                "objective": session.objective[:500],
                "mode": session.mode,
                "audience": session.audience,
                "iterations": len(session.iterations),
                "finalized": session.finalized,
                "data": json.loads(session.model_dump_json()),
            }
            self._client().table("sessions").upsert(
                data, on_conflict="user_id,session_id"
            ).execute()
            logger.info(f"Session saved: {session.session_id}")
        except Exception as e:
            logger.error(f"Failed to save session {session.session_id}: {e}")

    def load(self, session_id: str) -> Session | None:
        try:
            result = (
                self._client()
                .table("sessions")
                .select("data")
                .eq("user_id", self.user_id)
                .eq("session_id", session_id)
                .single()
                .execute()
            )
            if result.data:
                return Session.model_validate(result.data["data"])
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
        return None

    def list_sessions(self, limit: int = 20) -> list[dict]:
        """Return summaries of saved sessions, newest first."""
        try:
            result = (
                self._client()
                .table("sessions")
                .select("session_id, objective, mode, iterations, created_at, finalized")
                .eq("user_id", self.user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return [
                {
                    "session_id": row["session_id"],
                    "objective": (row.get("objective") or "")[:80],
                    "mode": row.get("mode", ""),
                    "iterations": row.get("iterations", 0),
                    "created_at": row.get("created_at", ""),
                    "finalized": row.get("finalized", False),
                }
                for row in (result.data or [])
            ]
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return []

    def delete(self, session_id: str) -> None:
        try:
            self._client().table("sessions").delete().eq(
                "user_id", self.user_id
            ).eq("session_id", session_id).execute()
            logger.info(f"Session deleted: {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
