"""Reusable prompt template persistence for PromptMaster Engine.

Stores templates as individual JSON files in ~/.promptmaster/templates/.
Templates are shareable — they live outside the per-browser session scope.
"""

import json
import logging
from pathlib import Path
from .schemas import PromptTemplate

logger = logging.getLogger(__name__)

DEFAULT_DIR = Path.home() / ".promptmaster" / "templates"


class TemplateStore:
    """File-based template storage."""

    def __init__(self, directory: Path = DEFAULT_DIR):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, template_id: str) -> Path:
        return self.directory / f"{template_id}.json"

    def save(self, template: PromptTemplate) -> None:
        self._path(template.template_id).write_text(
            template.model_dump_json(indent=2), encoding="utf-8"
        )
        logger.info(f"Template saved: {template.template_id} ({template.name})")

    def load(self, template_id: str) -> PromptTemplate | None:
        path = self._path(template_id)
        if not path.exists():
            return None
        try:
            return PromptTemplate.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"Failed to load template {template_id}: {e}")
            return None

    def list_templates(self, limit: int = 50) -> list[dict]:
        """Return summaries of saved templates, newest first."""
        entries = []
        for path in sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                entries.append({
                    "template_id": data.get("template_id", path.stem),
                    "name": data.get("name", "Untitled"),
                    "mode": data.get("mode", ""),
                    "audience": data.get("audience", "General"),
                    "created_at": data.get("created_at", ""),
                })
            except Exception:
                continue
            if len(entries) >= limit:
                break
        return entries

    def delete(self, template_id: str) -> None:
        path = self._path(template_id)
        if path.exists():
            path.unlink()
            logger.info(f"Template deleted: {template_id}")

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
