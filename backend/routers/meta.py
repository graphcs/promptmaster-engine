"""Meta endpoints: modes and model list."""

from fastapi import APIRouter
from promptmaster.modes import MODES
from promptmaster.llm_client import OpenRouterClient, OpenRouterError

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/modes")
async def get_modes():
    """Return available modes with display info only (no scaffolding)."""
    return {
        key: {
            "display_name": mode["display_name"],
            "tagline": mode["tagline"],
            "tone": mode["tone"],
        }
        for key, mode in MODES.items()
    }


@router.get("/models")
async def get_models():
    """Fetch available text models from OpenRouter."""
    try:
        models = await OpenRouterClient.fetch_text_models()
        return {"models": models}
    except OpenRouterError as e:
        return {"models": [], "error": str(e)}
