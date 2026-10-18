BEGIN;
CREATE TABLE oauth_client (
    client_id VARCHAR(255) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    logo_uri TEXT,
    redirect_uris TEXT[] NOT NULL CHECK (cardinality(redirect_uris) > 0),
    scopes TEXT[] NOT NULL DEFAULT ARRAY['openid', 'profile']::TEXT[],
    active BOOLEAN NOT NULL DEFAULT TRUE,
    development BOOLEAN NOT NULL DEFAULT FALSE,
    confidential BOOLEAN NOT NULL DEFAULT TRUE,
    secret_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT confidential OR secret_hash IS NOT NULL)
);
CREATE TABLE oauth_artifact (
    kind VARCHAR(255) NOT NULL,
    id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    grant_id VARCHAR(255),
    uid VARCHAR(255),
    user_code VARCHAR(255),
    PRIMARY KEY (kind, id)
);
CREATE INDEX oauth_artifact_expiry ON oauth_artifact (expires_at);
CREATE INDEX oauth_artifact_grant ON oauth_artifact (grant_id);
CREATE INDEX oauth_artifact_uid ON oauth_artifact (kind, uid) WHERE uid IS NOT NULL;
CREATE INDEX oauth_artifact_user_code ON oauth_artifact (kind, user_code) WHERE user_code IS NOT NULL;
COMMIT;
