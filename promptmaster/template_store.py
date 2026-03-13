"""Reusable prompt template persistence for PromptMaster Engine.

Stores templates in Supabase PostgreSQL, scoped per user via RLS.
"""

import json
import logging
from .schemas import PromptTemplate
from .db import get_supabase

logger = logging.getLogger(__name__)


class TemplateStore:
    """Supabase-backed template storage, scoped per user."""

    def __init__(self, user_id: str, access_token: str):
        self.user_id = user_id
        self.access_token = access_token

    def _client(self):
        sb = get_supabase()
        sb.postgrest.auth(self.access_token)
        return sb

    def save(self, template: PromptTemplate) -> None:
        try:
            data = {
                "user_id": self.user_id,
                "template_id": template.template_id,
                "name": template.name,
                "mode": template.mode,
                "audience": template.audience,
                "data": json.loads(template.model_dump_json()),
            }
            self._client().table("templates").upsert(
                data, on_conflict="user_id,template_id"
            ).execute()
            logger.info(f"Template saved: {template.template_id} ({template.name})")
        except Exception as e:
            logger.error(f"Failed to save template {template.template_id}: {e}")

    def load(self, template_id: str) -> PromptTemplate | None:
        try:
            result = (
                self._client()
                .table("templates")
                .select("data")
                .eq("user_id", self.user_id)
                .eq("template_id", template_id)
                .single()
                .execute()
            )
            if result.data:
                return PromptTemplate.model_validate(result.data["data"])
        except Exception as e:
            logger.error(f"Failed to load template {template_id}: {e}")
        return None

    def list_templates(self, limit: int = 50) -> list[dict]:
        """Return summaries of saved templates, newest first."""
        try:
            result = (
                self._client()
                .table("templates")
                .select("template_id, name, mode, audience, created_at")
                .eq("user_id", self.user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return [
                {
                    "template_id": row["template_id"],
                    "name": row.get("name", "Untitled"),
                    "mode": row.get("mode", ""),
                    "audience": row.get("audience", "General"),
                    "created_at": row.get("created_at", ""),
                }
                for row in (result.data or [])
            ]
        except Exception as e:
            logger.error(f"Failed to list templates: {e}")
            return []

    def delete(self, template_id: str) -> None:
        try:
            self._client().table("templates").delete().eq(
                "user_id", self.user_id
            ).eq("template_id", template_id).execute()
            logger.info(f"Template deleted: {template_id}")
        except Exception as e:
            logger.error(f"Failed to delete template {template_id}: {e}")

    def export_json(self, template_id: str) -> str | None:
        """Export a template as a JSON string for sharing."""
        template = self.load(template_id)
        if template:
            return template.model_dump_json(indent=2)
        return None

    def import_json(self, json_str: str) -> PromptTemplate | None:
        """Import a template from a JSON string."""
        try:
            template = PromptTemplate.model_validate_json(json_str)
            self.save(template)
            return template
        except Exception as e:
            logger.error(f"Failed to import template: {e}")
            return None
