"""Authentication module for PromptMaster Engine.

Supports email/password and Google OAuth via Supabase Auth.
"""

import streamlit as st
import logging
from .db import get_supabase

logger = logging.getLogger(__name__)


def _get_redirect_url() -> str:
    """Build the OAuth redirect URL from the current Streamlit app URL."""
    # Streamlit Cloud sets this; locally defaults to localhost
    import os
    return os.getenv("APP_URL", "http://localhost:8501")


def _handle_auth_callback():
    """Check URL query params for Supabase auth callbacks.

    Handles three flows:
    1. PKCE flow (Google OAuth): ?code= query param
    2. Token-hash flow (email confirmation): ?token_hash=&type= query params
    3. Implicit flow fallback: ?access_token=&refresh_token= query params
    """
    params = st.query_params
    code = params.get("code")
    token_hash = params.get("token_hash")
    token_type = params.get("type")
    access_token = params.get("access_token")
    refresh_token = params.get("refresh_token")

    if code:
        try:
            sb = get_supabase()
            # PKCE flow: exchange the code for a session
            response = sb.auth.exchange_code_for_session({"auth_code": code})
            if response and response.user:
                _set_user_session(response)
                st.query_params.clear()
                return True
        except Exception as e:
            logger.error(f"OAuth callback error: {e}")
            st.query_params.clear()
    elif token_hash and token_type:
        try:
            sb = get_supabase()
            # Token-hash flow: verify email OTP and get a session
            response = sb.auth.verify_otp({
                "token_hash": token_hash,
                "type": token_type,
            })
            if response and response.user:
                _set_user_session(response)
                st.query_params.clear()
                return True
        except Exception as e:
            logger.error(f"Email verification error: {e}")
            st.query_params.clear()
    elif access_token and refresh_token:
        try:
            sb = get_supabase()
            # Implicit flow fallback: set session from tokens directly
            response = sb.auth.set_session(access_token, refresh_token)
            if response and response.user:
                _set_user_session(response)
                st.query_params.clear()
                return True
        except Exception as e:
            logger.error(f"Token callback error: {e}")
            st.query_params.clear()
    return False


def _set_user_session(response):
    """Store authenticated user info in Streamlit session state."""
    st.session_state.pm_user = {
        "id": response.user.id,
        "email": response.user.email,
        "name": (response.user.user_metadata or {}).get(
            "full_name", response.user.email
        ),
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
    }


def _restore_session() -> bool:
    """Try to restore an existing session from stored tokens."""
    user = st.session_state.get("pm_user")
    if not user:
        return False

    try:
        sb = get_supabase()
        # Refresh the session to keep it alive
        response = sb.auth.set_session(
            user["access_token"], user["refresh_token"]
        )
        if response and response.user:
            # Update tokens in case they were refreshed
            st.session_state.pm_user["access_token"] = response.session.access_token
            st.session_state.pm_user["refresh_token"] = response.session.refresh_token
            return True
    except Exception as e:
        logger.warning(f"Session restore failed: {e}")
        st.session_state.pop("pm_user", None)
    return False


def get_current_user() -> dict | None:
    """Return the current user dict or None."""
    return st.session_state.get("pm_user")


def logout():
    """Sign out the user."""
    try:
        sb = get_supabase()
        sb.auth.sign_out()
    except Exception:
        pass
    st.session_state.pop("pm_user", None)


def render_auth_page():
    """Render the login/signup page. Returns True if user is authenticated."""
    # Check for auth callback (OAuth code, email token_hash, or implicit tokens)
    if _handle_auth_callback():
        st.rerun()

    # Try restoring existing session
    if _restore_session():
        return True

    # set_page_config must be the first Streamlit command — called by caller
    # if needed. We just style the page here.
    st.markdown("""<style>
    #MainMenu {visibility: hidden !important;}
    footer {visibility: hidden !important;}
    .stDeployButton {display: none !important;}
    [data-testid="stToolbar"] {display: none !important;}
    </style>""", unsafe_allow_html=True)

    st.markdown("# PromptMaster Engine")
    st.caption("Structured interaction for aligned LLM outputs")
    st.divider()

    tab_login, tab_signup = st.tabs(["Sign In", "Create Account"])

    with tab_login:
        email = st.text_input("Email", key="login_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key="login_password")

        if st.button("Sign In", type="primary", use_container_width=True, key="login_btn"):
            if not email or not password:
                st.error("Email and password are required.")
            else:
                try:
                    sb = get_supabase()
                    response = sb.auth.sign_in_with_password({
                        "email": email,
                        "password": password,
                    })
                    if response.user:
                        _set_user_session(response)
                        st.rerun()
                except Exception as e:
                    error_msg = str(e)
                    if "Invalid login" in error_msg or "invalid" in error_msg.lower():
                        st.error("Invalid email or password.")
                    else:
                        st.error(f"Sign-in failed: {error_msg}")

        st.divider()
        st.markdown("**Or sign in with:**")
        # Generate the Google OAuth URL and render as a direct link.
        # Streamlit Cloud sandboxes the app iframe (no allow-top-navigation),
        # so we open Google OAuth in a new tab via target="_blank".
        try:
            sb = get_supabase()
            redirect_url = _get_redirect_url()
            response = sb.auth.sign_in_with_oauth({
                "provider": "google",
                "options": {
                    "redirect_to": redirect_url,
                    "flow_type": "pkce",
                },
            })
            if response and response.url:
                st.markdown(
                    f'<a href="{response.url}" target="_blank" style="'
                    f"display:inline-block;width:100%;padding:0.6em 1em;"
                    f"background:#4285f4;color:white;border-radius:8px;"
                    f"text-decoration:none;font-weight:600;text-align:center;"
                    f'font-size:1em;">Continue with Google</a>',
                    unsafe_allow_html=True,
                )
        except Exception as e:
            st.error(f"Google sign-in failed: {e}")

    with tab_signup:
        new_name = st.text_input("Full Name", key="signup_name", placeholder="John Doe")
        new_email = st.text_input("Email", key="signup_email", placeholder="you@example.com")
        new_password = st.text_input("Password", type="password", key="signup_password",
                                      help="At least 6 characters")
        confirm_password = st.text_input("Confirm Password", type="password", key="signup_confirm")

        if st.button("Create Account", type="primary", use_container_width=True, key="signup_btn"):
            if not new_email or not new_password:
                st.error("Email and password are required.")
            elif new_password != confirm_password:
                st.error("Passwords do not match.")
            elif len(new_password) < 6:
                st.error("Password must be at least 6 characters.")
            else:
                try:
                    sb = get_supabase()
                    response = sb.auth.sign_up({
                        "email": new_email,
                        "password": new_password,
                        "options": {
                            "data": {"full_name": new_name.strip()},
                        },
                    })
                    if response.user:
                        if response.user.email_confirmed_at:
                            # Auto-confirmed (e.g. Supabase has email confirm disabled)
                            _set_user_session(response)
                            st.rerun()
                        else:
                            st.success(
                                "Account created! Check your email for a confirmation link — "
                                "you'll be signed in automatically."
                            )
                except Exception as e:
                    error_msg = str(e)
                    if "already registered" in error_msg.lower():
                        st.error("This email is already registered. Try signing in instead.")
                    else:
                        st.error(f"Sign-up failed: {error_msg}")

    return False
