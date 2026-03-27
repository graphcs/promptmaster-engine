"""Dependency injection for FastAPI endpoints."""

import os
from contextlib import asynccontextmanager
from promptmaster.llm_client import OpenRouterClient

_client: OpenRouterClient | None = None


def get_api_key() -> str:
    """Get the OpenRouter API key from environment."""
    key = os.getenv("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is required")
    return key


@asynccontextmanager
async def lifespan_client():
    """Manage a shared OpenRouterClient across the app lifespan."""
    global _client
    _client = OpenRouterClient(api_key=get_api_key())
    yield
    await _client.close()
    _client = None


def get_client() -> OpenRouterClient:
    """FastAPI dependency: return the shared OpenRouterClient."""
    if _client is None:
        raise RuntimeError("OpenRouterClient not initialized")
    return _client
