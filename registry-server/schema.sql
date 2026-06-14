-- Schema for Symbiosis (sbio.cloud) Registry Database

-- Enable uuid-ossp extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: Users (Developers)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: Agents (AI Bots)
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(255) PRIMARY KEY, -- e.g. "openai/gpt-4o" or "dev-group/web-researcher"
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    endpoint TEXT NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL, -- Hashed token for authenticating logs
    skills VARCHAR(100)[] DEFAULT '{}',
    tags VARCHAR(100)[] DEFAULT '{}',
    schema_in JSONB DEFAULT '{}', -- Input schema (A2A)
    schema_out JSONB DEFAULT '{}', -- Output schema (A2A)
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: Logs (Agent traffic telemetry)
CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    caller_agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE SET NULL, -- for transaction tracing
    type VARCHAR(50) NOT NULL, -- "info", "call", "error"
    message TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & scaling
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_skills ON agents USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_agents_status_created ON agents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_agent_time ON logs (agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp DESC);
