-- ProvenPath MVP schema (plan §4). PostgreSQL 13+ (gen_random_uuid is built in).
-- pp_execution is the one addition to the 8 planned tables: it holds a run's prompt + lifecycle status.

CREATE TABLE pp_user (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL UNIQUE,
  full_name   VARCHAR(200) NOT NULL,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('proposer', 'reviewer', 'admin')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pp_regulatory_source (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code    VARCHAR(80)  NOT NULL UNIQUE,
  title          VARCHAR(500) NOT NULL,
  section        VARCHAR(100),
  full_text      TEXT         NOT NULL,
  text_sha256    CHAR(64)     NOT NULL,
  effective_date DATE,
  expiry_date    DATE,
  jurisdiction   VARCHAR(10)  NOT NULL DEFAULT 'IN',
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pp_rule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code      VARCHAR(50)  NOT NULL UNIQUE,
  rule_name      VARCHAR(300) NOT NULL,
  layer          VARCHAR(20)  NOT NULL CHECK (layer IN ('TYPE', 'RANGE', 'CONSISTENCY', 'RULE_MATCH', 'SOURCE', 'GROUNDING')),
  applies_to     VARCHAR(200),
  depends_on     TEXT[]       NOT NULL DEFAULT '{}',
  rule_logic     JSONB        NOT NULL,
  source_code    VARCHAR(80),
  error_template TEXT,
  pc_mapping     VARCHAR(300),
  ruleset_hash   CHAR(64)     NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pp_execution (
  id          VARCHAR(64)  PRIMARY KEY,
  prompt      TEXT         NOT NULL,
  mode        VARCHAR(20)  NOT NULL,
  status      VARCHAR(30)  NOT NULL CHECK (status IN ('planning', 'verified_fail', 'review_pending', 'approved', 'rejected',
                                                     'deploying', 'deployed', 'deploy_failed', 'error')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pp_execution_created ON pp_execution (created_at DESC);

CREATE TABLE pp_proposal (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   VARCHAR(64)  NOT NULL,
  execution_id  VARCHAR(64)  NOT NULL REFERENCES pp_execution (id),
  iteration     INTEGER      NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'submitted'
                CHECK (status IN ('submitted', 'verified_pass', 'verified_fail', 'approved', 'rejected', 'deployed')),
  proposal      JSONB        NOT NULL,
  proposal_hash CHAR(64)     NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, iteration)
);

CREATE TABLE pp_verification_run (
  id                VARCHAR(64) PRIMARY KEY,               -- Verdict.runId
  execution_id      VARCHAR(64) NOT NULL REFERENCES pp_execution (id),
  proposal_row_id   UUID        NOT NULL REFERENCES pp_proposal (id),
  iteration         INTEGER     NOT NULL,
  status            VARCHAR(10) NOT NULL CHECK (status IN ('PASSED', 'BLOCKED')),
  ruleset_hash      CHAR(64)    NOT NULL,
  proposal_hash     CHAR(64)    NOT NULL,
  verdict_hash      CHAR(64)    NOT NULL,
  gate_token        VARCHAR(128),
  nodes_total       INTEGER     NOT NULL,
  nodes_failed      INTEGER     NOT NULL,
  nodes_skipped     INTEGER     NOT NULL,
  nodes_needs_review INTEGER    NOT NULL,
  duration_ms       INTEGER     NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- all-or-nothing in the schema: PASSED only with zero failures / needs-review, and only PASSED carries a token
  CHECK ((status = 'PASSED') = (nodes_failed = 0 AND nodes_needs_review = 0)),
  CHECK ((status = 'PASSED') = (gate_token IS NOT NULL))
);
CREATE INDEX idx_pp_vrun_execution ON pp_verification_run (execution_id, created_at DESC);

CREATE TABLE pp_verification_node (
  id                  BIGSERIAL PRIMARY KEY,
  run_id              VARCHAR(64) NOT NULL REFERENCES pp_verification_run (id),
  position            INTEGER     NOT NULL,                -- topological execution order
  rule_code           VARCHAR(50) NOT NULL,
  clause_id           VARCHAR(64),
  layer               VARCHAR(20) NOT NULL,
  result              VARCHAR(15) NOT NULL CHECK (result IN ('PASSED', 'FAILED', 'SKIPPED', 'NEEDS_REVIEW')),
  expected            TEXT,
  actual              TEXT,
  reason              TEXT,
  source_code         VARCHAR(80),
  rule_logic_snapshot JSONB
);
CREATE INDEX idx_pp_vnode_run ON pp_verification_node (run_id, position);
CREATE INDEX idx_pp_vnode_clause ON pp_verification_node (clause_id);

CREATE TABLE pp_compliance_review (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id     VARCHAR(64) NOT NULL REFERENCES pp_execution (id),
  run_id           VARCHAR(64) NOT NULL REFERENCES pp_verification_run (id),
  reviewer_user_id UUID        NOT NULL REFERENCES pp_user (id),
  decision         VARCHAR(10) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment          TEXT,
  reviewed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (decision = 'approved' OR (comment IS NOT NULL AND length(trim(comment)) > 0))
);

CREATE TABLE pp_deployment (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id   VARCHAR(64) NOT NULL REFERENCES pp_execution (id),
  run_id         VARCHAR(64) NOT NULL REFERENCES pp_verification_run (id),
  review_id      UUID        NOT NULL REFERENCES pp_compliance_review (id),
  status         VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'pulled', 'write', 'restart', 'ready', 'verified', 'failed')),
  manifest       JSONB       NOT NULL,
  package_zip    BYTEA       NOT NULL,
  detail         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pulled_at      TIMESTAMPTZ,
  pc_verified_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pp_deploy_queue ON pp_deployment (status, created_at);

-- Append-only audit trail + SSE source (invariant 7).
CREATE TABLE pp_event_log (
  id           BIGSERIAL   PRIMARY KEY,
  execution_id VARCHAR(64) NOT NULL REFERENCES pp_execution (id),
  seq          INTEGER     NOT NULL,
  ts           TIMESTAMPTZ NOT NULL,
  type         VARCHAR(40) NOT NULL,
  payload      JSONB       NOT NULL,
  UNIQUE (execution_id, seq)
);

CREATE FUNCTION pp_event_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pp_event_log is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pp_event_log_no_update_delete
  BEFORE UPDATE OR DELETE ON pp_event_log
  FOR EACH ROW EXECUTE FUNCTION pp_event_log_append_only();

CREATE TRIGGER trg_pp_event_log_no_truncate
  BEFORE TRUNCATE ON pp_event_log
  FOR EACH STATEMENT EXECUTE FUNCTION pp_event_log_append_only();
