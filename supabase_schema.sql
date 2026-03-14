-- PromptMaster Engine — Supabase Schema
-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- 1. Sessions table — stores full session data per user
CREATE TABLE IF NOT EXISTS sessions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id    TEXT NOT NULL,
    objective     TEXT NOT NULL DEFAULT '',
    mode          TEXT NOT NULL DEFAULT 'architect',
    audience      TEXT NOT NULL DEFAULT 'General',
    iterations    INT NOT NULL DEFAULT 0,
    finalized     BOOLEAN NOT NULL DEFAULT FALSE,
    data          JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, session_id)
);

-- 2. Templates table — reusable prompt configurations per user
CREATE TABLE IF NOT EXISTS templates (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id   TEXT NOT NULL,
    name          TEXT NOT NULL,
    mode          TEXT NOT NULL DEFAULT 'architect',
    audience      TEXT NOT NULL DEFAULT 'General',
    data          JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, template_id)
);

-- 3. Usage tracking — for rate limiting (iterations per day)
CREATE TABLE IF NOT EXISTS usage_tracking (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action        TEXT NOT NULL DEFAULT 'iteration',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, created_at);

-- Row Level Security — users can only access their own data
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Sessions RLS policies
CREATE POLICY "Users can read own sessions"
    ON sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
    ON sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
    ON sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
    ON sessions FOR DELETE
    USING (auth.uid() = user_id);

-- Templates RLS policies
CREATE POLICY "Users can read own templates"
    ON templates FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
    ON templates FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
    ON templates FOR DELETE
    USING (auth.uid() = user_id);

-- Usage tracking RLS policies
CREATE POLICY "Users can read own usage"
    ON usage_tracking FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
    ON usage_tracking FOR INSERT
    WITH CHECK (auth.uid() = user_id);
