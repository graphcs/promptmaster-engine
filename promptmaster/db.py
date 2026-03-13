"""Supabase client singleton for PromptMaster Engine.

Reads SUPABASE_URL and SUPABASE_KEY from environment / Streamlit secrets.
"""

import os
import logging
from functools import lru_cache
from supabase import create_client, Client

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a cached Supabase client instance."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")  # anon/public key
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY must be set. "
            "Add them to .env or Streamlit secrets."
        )
    return create_client(url, key)


def get_supabase_admin() -> Client:
    """Return a Supabase client with the service-role key (for server-side ops)."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    return create_client(url, key)
