# ProvenPath — Complete Database Architecture

> Scoped to: **Cyber Insurance for SMEs** | **~15–25 IRDAI-style rules** | **All-or-nothing compliance**

---

## Database Selection: PostgreSQL 16+

**Why PostgreSQL:**
- JSONB columns for flexible LLM proposal storage and rule metadata
- Strong referential integrity (critical for compliance audit trail)
- Native ENUM support for status/type columns
- Row-level security for multi-tenant compliance reviewer access
- Excellent indexing (GIN for JSONB, B-tree for FKs, partial indexes for active records)

---

## Entity-Relationship Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   pp_user    │────>│  pp_proposal     │────>│ pp_proposal_coverage│
└──────────────┘     │                  │     └─────────────────────┘
                     │                  │────>│ pp_proposal_exclusion│
                     │                  │     └─────────────────────┘
                     │                  │────>│ pp_proposal_rating   │
                     │                  │     └──────────────────────┘
                     │                  │────>│ pp_proposal_uw_rule  │
                     └────────┬─────────┘     └──────────────────────┘
                              │
                              ▼
                     ┌──────────────────┐     ┌─────────────────────┐
                     │ pp_verification  │────>│pp_verification_node │
                     │    _run          │     │  (rule-graph nodes) │
                     └────────┬─────────┘     └──────────┬──────────┘
                              │                          │
                              ▼                          ▼
                     ┌──────────────────┐     ┌─────────────────────┐
                     │ pp_compliance    │     │pp_verification_edge │
                     │   _review        │     │  (rule-graph DAG)   │
                     └────────┬─────────┘     └─────────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ pp_deployment    │
                     └──────────────────┘

      ┌──────────────────┐     ┌──────────────────────┐
      │ pp_rule          │────>│ pp_rule_parameter    │
      │ (curated IRDAI)  │     └──────────────────────┘
      └──────────────────┘
            │
            ▼
      ┌──────────────────┐
      │pp_rule_dependency│
      │  (DAG edges)     │
      └──────────────────┘

      ┌──────────────────┐
      │ pp_audit_log     │  (immutable append-only)
      └──────────────────┘

      ┌──────────────────┐
      │pp_regulatory_src │  (IRDAI source citations)
      └──────────────────┘
```

---

## Table Definitions — Complete Column Spec

---

### 1. `pp_user` — System Users (Proposers, Reviewers, Admins)

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique user ID |
| `email` | `VARCHAR(255)` | NO | — | UNIQUE, NOT NULL | Login email |
| `full_name` | `VARCHAR(200)` | NO | — | NOT NULL | Display name |
| `role` | `VARCHAR(20)` | NO | — | CHECK (role IN ('proposer', 'reviewer', 'admin')) | System role |
| `is_active` | `BOOLEAN` | NO | `TRUE` | NOT NULL | Soft-delete flag |
| `password_hash` | `VARCHAR(255)` | NO | — | NOT NULL | bcrypt hash |
| `last_login_at` | `TIMESTAMPTZ` | YES | — | — | Last login timestamp |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Last update |

**Indexes:**
- `idx_pp_user_email` — UNIQUE on `email`
- `idx_pp_user_role` — B-tree on `role`

---

### 2. `pp_regulatory_source` — IRDAI Regulatory Source Citations

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique source ID |
| `source_code` | `VARCHAR(50)` | NO | — | UNIQUE, NOT NULL | Short code (e.g., `IRDAI-CYBER-2024-SEC4.2`) |
| `title` | `VARCHAR(500)` | NO | — | NOT NULL | Source document title |
| `section` | `VARCHAR(100)` | YES | — | — | Section/clause number |
| `full_text` | `TEXT` | NO | — | NOT NULL | Full regulatory text |
| `document_url` | `VARCHAR(1000)` | YES | — | — | URL to source document |
| `effective_date` | `DATE` | NO | — | NOT NULL | When this regulation became effective |
| `expiry_date` | `DATE` | YES | — | — | NULL if still active |
| `jurisdiction` | `VARCHAR(10)` | NO | `'IN'` | NOT NULL | Country/state code |
| `is_active` | `BOOLEAN` | NO | `TRUE` | NOT NULL | Currently enforceable |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Last update |

**Indexes:**
- `idx_pp_regsrc_code` — UNIQUE on `source_code`
- `idx_pp_regsrc_active` — Partial index WHERE `is_active = TRUE`
- `idx_pp_regsrc_jurisdiction` — B-tree on `jurisdiction`

---

### 3. `pp_rule` — Curated IRDAI Compliance Rules (~15–25 rules)

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique rule ID |
| `rule_code` | `VARCHAR(50)` | NO | — | UNIQUE, NOT NULL | Human-readable code (e.g., `CYBER-COV-001`) |
| `rule_name` | `VARCHAR(200)` | NO | — | NOT NULL | Descriptive name |
| `description` | `TEXT` | NO | — | NOT NULL | What this rule checks |
| `category` | `VARCHAR(30)` | NO | — | CHECK (category IN ('coverage', 'exclusion', 'rating', 'underwriting', 'general')) | Rule domain |
| `check_type` | `VARCHAR(20)` | NO | — | CHECK (check_type IN ('type', 'range', 'consistency', 'rule_match', 'source_citation')) | Which of the 5 verification dimensions |
| `severity` | `VARCHAR(10)` | NO | `'blocker'` | CHECK (severity IN ('blocker', 'warning')) | Blocker = all-or-nothing block |
| `rule_logic` | `JSONB` | NO | — | NOT NULL | Deterministic rule definition (see schema below) |
| `expected_value_schema` | `JSONB` | YES | — | — | JSON Schema defining valid values |
| `error_message_template` | `TEXT` | NO | — | NOT NULL | Human-readable failure message (supports `{variable}` placeholders) |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | Linked IRDAI regulation |
| `pc_concept_mapping` | `VARCHAR(200)` | YES | — | — | Maps to PolicyCenter concept (e.g., `CoveragePattern.PAComprehensiveCov`) |
| `version` | `INTEGER` | NO | `1` | NOT NULL | Rule version number |
| `is_active` | `BOOLEAN` | NO | `TRUE` | NOT NULL | Currently enforced |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Last update |

**`rule_logic` JSONB Schema:**
```json
{
  "operator": "AND | OR | NOT | GT | GTE | LT | LTE | EQ | NEQ | IN | REGEX | EXISTS | TYPE_IS",
  "field": "coverage.limit_amount",
  "value": 5000000,
  "children": [ /* nested conditions for AND/OR/NOT */ ]
}
```

**Indexes:**
- `idx_pp_rule_code` — UNIQUE on `rule_code`
- `idx_pp_rule_category` — B-tree on `category`
- `idx_pp_rule_check_type` — B-tree on `check_type`
- `idx_pp_rule_active` — Partial index WHERE `is_active = TRUE`
- `idx_pp_rule_logic` — GIN on `rule_logic`

---

### 4. `pp_rule_parameter` — Parameters for Parameterized Rules

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique param ID |
| `rule_id` | `UUID` | NO | — | FK → `pp_rule.id` ON DELETE CASCADE | Parent rule |
| `param_name` | `VARCHAR(100)` | NO | — | NOT NULL | Parameter name (e.g., `min_limit`, `max_deductible`) |
| `param_type` | `VARCHAR(20)` | NO | — | CHECK (param_type IN ('integer', 'decimal', 'string', 'boolean', 'date', 'enum')) | Data type |
| `param_value` | `TEXT` | NO | — | NOT NULL | Value (stored as text, cast by type) |
| `unit` | `VARCHAR(20)` | YES | — | — | Unit (e.g., `INR`, `days`, `percent`) |
| `description` | `TEXT` | YES | — | — | What this parameter controls |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_rule_param_rule` — B-tree on `rule_id`
- `uk_pp_rule_param` — UNIQUE on (`rule_id`, `param_name`)

---

### 5. `pp_rule_dependency` — Rule-Graph DAG Edges

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique edge ID |
| `rule_id` | `UUID` | NO | — | FK → `pp_rule.id` ON DELETE CASCADE | The rule that DEPENDS ON another |
| `depends_on_rule_id` | `UUID` | NO | — | FK → `pp_rule.id` ON DELETE RESTRICT | The rule that must pass FIRST |
| `dependency_type` | `VARCHAR(20)` | NO | `'requires'` | CHECK (dependency_type IN ('requires', 'conflicts', 'enhances')) | Relationship type |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Constraints:**
- UNIQUE on (`rule_id`, `depends_on_rule_id`) — no duplicate edges
- CHECK (`rule_id != depends_on_rule_id`) — no self-loops

**Indexes:**
- `idx_pp_ruledep_rule` — B-tree on `rule_id`
- `idx_pp_ruledep_depends` — B-tree on `depends_on_rule_id`

---

### 6. `pp_proposal` — LLM-Generated Configuration Proposals

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique proposal ID |
| `proposal_number` | `VARCHAR(30)` | NO | — | UNIQUE, NOT NULL | Human-readable (e.g., `PP-2026-0042`) |
| `status` | `VARCHAR(30)` | NO | `'draft'` | CHECK (status IN ('draft', 'submitted', 'verifying', 'verified_pass', 'verified_fail', 'review_pending', 'approved', 'rejected', 'deployed', 'expired')) | Lifecycle status |
| `product_line` | `VARCHAR(100)` | NO | `'CyberInsuranceSME'` | NOT NULL | Target product line |
| `plain_language_input` | `TEXT` | NO | — | NOT NULL | Product manager's original request |
| `llm_model_used` | `VARCHAR(100)` | YES | — | — | Which LLM generated the proposal (e.g., `gpt-4o-2026-05`) |
| `llm_raw_response` | `JSONB` | YES | — | — | Raw LLM output for audit |
| `llm_prompt_used` | `TEXT` | YES | — | — | Exact prompt sent to LLM |
| `llm_temperature` | `DECIMAL(3,2)` | YES | — | CHECK (llm_temperature >= 0 AND llm_temperature <= 2) | LLM temperature setting |
| `target_jurisdiction` | `VARCHAR(10)` | NO | `'IN'` | NOT NULL | Target regulatory jurisdiction |
| `target_effective_date` | `DATE` | NO | — | NOT NULL | When the product should go live |
| `target_pc_product_code` | `VARCHAR(50)` | YES | — | — | PolicyCenter ProductCode target |
| `proposed_by_user_id` | `UUID` | NO | — | FK → `pp_user.id` | Who initiated this proposal |
| `total_coverages` | `INTEGER` | NO | `0` | NOT NULL | Count of proposed coverages |
| `total_exclusions` | `INTEGER` | NO | `0` | NOT NULL | Count of proposed exclusions |
| `total_rating_rules` | `INTEGER` | NO | `0` | NOT NULL | Count of proposed rating rules |
| `total_uw_rules` | `INTEGER` | NO | `0` | NOT NULL | Count of proposed UW rules |
| `submitted_at` | `TIMESTAMPTZ` | YES | — | — | When submitted for verification |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Last update |

**Indexes:**
- `idx_pp_proposal_number` — UNIQUE on `proposal_number`
- `idx_pp_proposal_status` — B-tree on `status`
- `idx_pp_proposal_user` — B-tree on `proposed_by_user_id`
- `idx_pp_proposal_product` — B-tree on `product_line`
- `idx_pp_proposal_created` — B-tree on `created_at DESC`

---

### 7. `pp_proposal_coverage` — Proposed Coverages

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique coverage ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Parent proposal |
| `sequence_order` | `INTEGER` | NO | — | NOT NULL | Display order within proposal |
| `coverage_code` | `VARCHAR(100)` | NO | — | NOT NULL | Coverage identifier (e.g., `CYBER_DATA_BREACH`) |
| `coverage_name` | `VARCHAR(300)` | NO | — | NOT NULL | Human-readable name |
| `coverage_description` | `TEXT` | YES | — | — | Detailed description |
| `coverage_category` | `VARCHAR(100)` | NO | — | NOT NULL | Category (e.g., `CyberFirstParty`, `CyberThirdParty`) |
| `owning_entity_type` | `VARCHAR(100)` | NO | — | NOT NULL | PolicyCenter owningEntityType (e.g., `CyberLine`, `CyberExposure`) |
| `existence_type` | `VARCHAR(20)` | NO | `'Suggested'` | CHECK (existence_type IN ('Required', 'Suggested', 'Electable', 'Preset')) | Auto-add behavior |
| `limit_type` | `VARCHAR(20)` | YES | — | CHECK (limit_type IN ('per_occurrence', 'aggregate', 'combined_single', 'split')) | Limit structure |
| `limit_amount_min` | `DECIMAL(15,2)` | YES | — | CHECK (limit_amount_min >= 0) | Minimum allowed limit (INR) |
| `limit_amount_max` | `DECIMAL(15,2)` | YES | — | CHECK (limit_amount_max >= limit_amount_min) | Maximum allowed limit (INR) |
| `limit_amount_default` | `DECIMAL(15,2)` | YES | — | — | Default limit (INR) |
| `deductible_type` | `VARCHAR(20)` | YES | — | CHECK (deductible_type IN ('flat', 'percentage', 'waiting_period')) | Deductible structure |
| `deductible_amount_min` | `DECIMAL(15,2)` | YES | — | CHECK (deductible_amount_min >= 0) | Minimum deductible |
| `deductible_amount_max` | `DECIMAL(15,2)` | YES | — | CHECK (deductible_amount_max >= deductible_amount_min) | Maximum deductible |
| `deductible_amount_default` | `DECIMAL(15,2)` | YES | — | — | Default deductible |
| `deductible_unit` | `VARCHAR(20)` | YES | `'INR'` | — | Unit: INR, percent, days |
| `is_mandatory` | `BOOLEAN` | NO | `FALSE` | NOT NULL | Regulatory mandate |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | IRDAI citation for this coverage |
| `pc_coverage_pattern` | `VARCHAR(200)` | YES | — | — | Maps to PC CoveragePattern XML (e.g., `CyberDataBreachCov`) |
| `pc_cov_term_pattern` | `VARCHAR(200)` | YES | — | — | Maps to PC CovTermPattern |
| `raw_llm_clause` | `TEXT` | YES | — | — | Original LLM-generated text for this coverage |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_propcov_proposal` — B-tree on `proposal_id`
- `idx_pp_propcov_code` — B-tree on `coverage_code`
- `idx_pp_propcov_category` — B-tree on `coverage_category`

---

### 8. `pp_proposal_exclusion` — Proposed Exclusions

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique exclusion ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Parent proposal |
| `sequence_order` | `INTEGER` | NO | — | NOT NULL | Display order |
| `exclusion_code` | `VARCHAR(100)` | NO | — | NOT NULL | Exclusion identifier (e.g., `EXCL_WAR_TERRORISM`) |
| `exclusion_name` | `VARCHAR(300)` | NO | — | NOT NULL | Human-readable name |
| `exclusion_description` | `TEXT` | NO | — | NOT NULL | What is excluded and why |
| `exclusion_category` | `VARCHAR(100)` | NO | — | NOT NULL | Category (e.g., `WarAndTerrorism`, `PriorKnowledge`) |
| `applies_to_coverage_id` | `UUID` | YES | — | FK → `pp_proposal_coverage.id` ON DELETE SET NULL | Specific coverage this exclusion modifies (NULL = applies to all) |
| `is_mandatory` | `BOOLEAN` | NO | `FALSE` | NOT NULL | IRDAI-mandated exclusion |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | IRDAI citation |
| `pc_exclusion_pattern` | `VARCHAR(200)` | YES | — | — | Maps to PC ExclusionPattern |
| `raw_llm_clause` | `TEXT` | YES | — | — | Original LLM text |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_propexcl_proposal` — B-tree on `proposal_id`
- `idx_pp_propexcl_coverage` — B-tree on `applies_to_coverage_id`

---

### 9. `pp_proposal_rating_rule` — Proposed Rating Rules

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique rating rule ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Parent proposal |
| `sequence_order` | `INTEGER` | NO | — | NOT NULL | Execution order |
| `rule_code` | `VARCHAR(100)` | NO | — | NOT NULL | Rule identifier (e.g., `RATE_CYBER_BASE_PREMIUM`) |
| `rule_name` | `VARCHAR(300)` | NO | — | NOT NULL | Human-readable name |
| `rule_description` | `TEXT` | YES | — | — | What this rating rule calculates |
| `applies_to_coverage_id` | `UUID` | YES | — | FK → `pp_proposal_coverage.id` ON DELETE SET NULL | Which coverage this rates |
| `rating_method` | `VARCHAR(30)` | NO | — | CHECK (rating_method IN ('base_rate', 'factor', 'table_lookup', 'formula', 'flat_charge', 'minimum_premium')) | How the rate is applied |
| `base_rate_value` | `DECIMAL(15,4)` | YES | — | — | Base rate (if applicable) |
| `rate_factor_name` | `VARCHAR(100)` | YES | — | — | Factor name (e.g., `IndustryCodeFactor`) |
| `rate_factor_min` | `DECIMAL(10,4)` | YES | — | — | Minimum factor multiplier |
| `rate_factor_max` | `DECIMAL(10,4)` | YES | — | — | Maximum factor multiplier |
| `rate_factor_default` | `DECIMAL(10,4)` | YES | — | — | Default factor value |
| `rate_table_definition` | `JSONB` | YES | — | — | Table lookup dimensions and values |
| `formula_expression` | `TEXT` | YES | — | — | Rating formula (e.g., `base_rate * revenue_factor * industry_factor`) |
| `minimum_premium` | `DECIMAL(15,2)` | YES | — | CHECK (minimum_premium >= 0) | Floor premium (INR) |
| `maximum_premium` | `DECIMAL(15,2)` | YES | — | — | Ceiling premium (INR) |
| `currency` | `VARCHAR(3)` | NO | `'INR'` | NOT NULL | Currency code |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | IRDAI citation |
| `pc_rate_routine_mapping` | `VARCHAR(200)` | YES | — | — | Maps to PC CalcRoutineDefinition |
| `pc_rate_table_mapping` | `VARCHAR(200)` | YES | — | — | Maps to PC RateTableDefinition |
| `raw_llm_clause` | `TEXT` | YES | — | — | Original LLM text |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_proprate_proposal` — B-tree on `proposal_id`
- `idx_pp_proprate_coverage` — B-tree on `applies_to_coverage_id`
- `idx_pp_proprate_method` — B-tree on `rating_method`

---

### 10. `pp_proposal_uw_rule` — Proposed Underwriting Rules

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique UW rule ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Parent proposal |
| `sequence_order` | `INTEGER` | NO | — | NOT NULL | Evaluation order |
| `uw_rule_code` | `VARCHAR(100)` | NO | — | NOT NULL | Rule identifier (e.g., `UW_CYBER_REVENUE_CAP`) |
| `uw_rule_name` | `VARCHAR(300)` | NO | — | NOT NULL | Human-readable name |
| `uw_rule_description` | `TEXT` | NO | — | NOT NULL | What this UW rule evaluates |
| `condition_expression` | `TEXT` | NO | — | NOT NULL | Condition in structured format (e.g., `applicant.annual_revenue > 500000000`) |
| `condition_logic` | `JSONB` | NO | — | NOT NULL | Machine-readable condition tree |
| `issue_type` | `VARCHAR(100)` | NO | — | NOT NULL | UW issue type (maps to PC UWIssueType) |
| `blocking_point` | `VARCHAR(30)` | NO | — | CHECK (blocking_point IN ('blocks_quote', 'blocks_bind', 'blocks_issuance', 'non_blocking')) | When this blocks the workflow |
| `approval_duration_type` | `VARCHAR(20)` | YES | `'term'` | CHECK (approval_duration_type IN ('term', 'permanent', 'job')) | How long approval lasts |
| `auto_approvable` | `BOOLEAN` | NO | `FALSE` | NOT NULL | Can be auto-approved by authority match |
| `authority_value_min` | `DECIMAL(15,2)` | YES | — | — | Minimum authority grant needed |
| `authority_value_max` | `DECIMAL(15,2)` | YES | — | — | Maximum authority grant needed |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | IRDAI citation |
| `pc_uw_issue_type` | `VARCHAR(200)` | YES | — | — | Maps to PC UWIssueType entity |
| `pc_uw_rule_mapping` | `VARCHAR(200)` | YES | — | — | Maps to PC UWRule entity |
| `raw_llm_clause` | `TEXT` | YES | — | — | Original LLM text |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_propuw_proposal` — B-tree on `proposal_id`
- `idx_pp_propuw_blocking` — B-tree on `blocking_point`

---

### 11. `pp_verification_run` — A Complete Verification Execution

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique run ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Proposal being verified |
| `run_number` | `INTEGER` | NO | — | NOT NULL | Run sequence (1, 2, 3... for retries) |
| `status` | `VARCHAR(20)` | NO | `'running'` | CHECK (status IN ('running', 'passed', 'failed', 'error', 'cancelled')) | Overall run result |
| `total_rules_evaluated` | `INTEGER` | NO | `0` | NOT NULL | How many rules were checked |
| `total_rules_passed` | `INTEGER` | NO | `0` | NOT NULL | How many passed |
| `total_rules_failed` | `INTEGER` | NO | `0` | NOT NULL | How many failed (any >0 = overall FAIL) |
| `total_rules_skipped` | `INTEGER` | NO | `0` | NOT NULL | Skipped (dependency not met) |
| `total_rules_error` | `INTEGER` | NO | `0` | NOT NULL | Errored during execution |
| `execution_order` | `JSONB` | YES | — | — | Topological sort order of rule-graph traversal |
| `started_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Run start time |
| `completed_at` | `TIMESTAMPTZ` | YES | — | — | Run end time |
| `duration_ms` | `INTEGER` | YES | — | — | Total execution time in milliseconds |
| `error_message` | `TEXT` | YES | — | — | System error (not rule failure) |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Constraints:**
- UNIQUE on (`proposal_id`, `run_number`)

**Indexes:**
- `idx_pp_vrun_proposal` — B-tree on `proposal_id`
- `idx_pp_vrun_status` — B-tree on `status`
- `idx_pp_vrun_started` — B-tree on `started_at DESC`

---

### 12. `pp_verification_node` — Individual Rule Check Results

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique node result ID |
| `verification_run_id` | `UUID` | NO | — | FK → `pp_verification_run.id` ON DELETE CASCADE | Parent run |
| `rule_id` | `UUID` | NO | — | FK → `pp_rule.id` | Which rule was evaluated |
| `execution_order` | `INTEGER` | NO | — | NOT NULL | Position in topological sort |
| `target_entity_type` | `VARCHAR(30)` | NO | — | CHECK (target_entity_type IN ('coverage', 'exclusion', 'rating_rule', 'uw_rule', 'proposal')) | What was checked |
| `target_entity_id` | `UUID` | YES | — | — | FK to specific coverage/exclusion/rating/uw row |
| `check_type` | `VARCHAR(20)` | NO | — | CHECK (check_type IN ('type', 'range', 'consistency', 'rule_match', 'source_citation')) | Verification dimension |
| `result` | `VARCHAR(15)` | NO | — | CHECK (result IN ('passed', 'failed', 'skipped', 'error')) | Check result |
| `actual_value` | `TEXT` | YES | — | — | What value was found |
| `expected_value` | `TEXT` | YES | — | — | What value was expected |
| `failure_reason` | `TEXT` | YES | — | — | Human-readable failure explanation |
| `rule_logic_snapshot` | `JSONB` | YES | — | — | Snapshot of rule_logic at time of execution |
| `regulatory_source_id` | `UUID` | YES | — | FK → `pp_regulatory_source.id` | Source citation for this check |
| `execution_duration_ms` | `INTEGER` | YES | — | — | Time to execute this single check |
| `executed_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | When this check ran |

**Indexes:**
- `idx_pp_vnode_run` — B-tree on `verification_run_id`
- `idx_pp_vnode_rule` — B-tree on `rule_id`
- `idx_pp_vnode_result` — B-tree on `result`
- `idx_pp_vnode_check` — B-tree on `check_type`
- `idx_pp_vnode_target` — B-tree on (`target_entity_type`, `target_entity_id`)

---

### 13. `pp_verification_edge` — Rule-Graph DAG Execution Trace

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique edge ID |
| `verification_run_id` | `UUID` | NO | — | FK → `pp_verification_run.id` ON DELETE CASCADE | Parent run |
| `from_node_id` | `UUID` | NO | — | FK → `pp_verification_node.id` | Dependency (must pass first) |
| `to_node_id` | `UUID` | NO | — | FK → `pp_verification_node.id` | Dependent (runs after from_node) |
| `edge_type` | `VARCHAR(20)` | NO | `'requires'` | CHECK (edge_type IN ('requires', 'conflicts', 'enhances')) | Relationship type |
| `was_satisfied` | `BOOLEAN` | NO | — | NOT NULL | Did the dependency pass? |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_vedge_run` — B-tree on `verification_run_id`
- `idx_pp_vedge_from` — B-tree on `from_node_id`
- `idx_pp_vedge_to` — B-tree on `to_node_id`

---

### 14. `pp_compliance_review` — Human Reviewer Decisions

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique review ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Proposal under review |
| `verification_run_id` | `UUID` | NO | — | FK → `pp_verification_run.id` | Which verification run was reviewed |
| `reviewer_user_id` | `UUID` | NO | — | FK → `pp_user.id` | Who reviewed |
| `decision` | `VARCHAR(20)` | NO | — | CHECK (decision IN ('approved', 'rejected', 'returned_for_revision')) | Review decision |
| `comments` | `TEXT` | YES | — | — | Reviewer notes |
| `conditions` | `TEXT` | YES | — | — | Approval conditions (if any) |
| `risk_assessment` | `VARCHAR(10)` | YES | — | CHECK (risk_assessment IN ('low', 'medium', 'high')) | Reviewer's risk rating |
| `reviewed_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | When decision was made |
| `digital_signature` | `VARCHAR(500)` | YES | — | — | Cryptographic signature for audit |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_review_proposal` — B-tree on `proposal_id`
- `idx_pp_review_reviewer` — B-tree on `reviewer_user_id`
- `idx_pp_review_decision` — B-tree on `decision`

---

### 15. `pp_deployment` — Deployment to PolicyCenter

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `UUID` | NO | `gen_random_uuid()` | PRIMARY KEY | Unique deployment ID |
| `proposal_id` | `UUID` | NO | — | FK → `pp_proposal.id` ON DELETE CASCADE | Source proposal |
| `compliance_review_id` | `UUID` | NO | — | FK → `pp_compliance_review.id` | Approving review |
| `status` | `VARCHAR(20)` | NO | `'pending'` | CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'rolled_back')) | Deployment status |
| `deployment_type` | `VARCHAR(30)` | NO | — | CHECK (deployment_type IN ('product_model_xml', 'rate_book', 'api_call', 'full_bundle')) | What type of deployment |
| `target_pc_environment` | `VARCHAR(50)` | NO | — | NOT NULL | Target PC environment (e.g., `dev`, `staging`, `production`) |
| `target_pc_url` | `VARCHAR(500)` | NO | — | NOT NULL | PolicyCenter base URL |
| `artifact_manifest` | `JSONB` | NO | — | NOT NULL | List of files/configs deployed |
| `diff_manifest` | `JSONB` | YES | — | — | What changed vs. current PC config |
| `pc_response_code` | `INTEGER` | YES | — | — | PolicyCenter HTTP response code |
| `pc_response_body` | `TEXT` | YES | — | — | PolicyCenter response |
| `rollback_artifact` | `JSONB` | YES | — | — | Snapshot for rollback if needed |
| `deployed_by_user_id` | `UUID` | NO | — | FK → `pp_user.id` | Who triggered deployment |
| `started_at` | `TIMESTAMPTZ` | YES | — | — | Deployment start |
| `completed_at` | `TIMESTAMPTZ` | YES | — | — | Deployment end |
| `error_message` | `TEXT` | YES | — | — | Error details if failed |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Record creation |

**Indexes:**
- `idx_pp_deploy_proposal` — B-tree on `proposal_id`
- `idx_pp_deploy_status` — B-tree on `status`
- `idx_pp_deploy_env` — B-tree on `target_pc_environment`

---

### 16. `pp_audit_log` — Immutable Append-Only Audit Trail

| Column | Type | Nullable | Default | Constraint | Description |
|--------|------|----------|---------|------------|-------------|
| `id` | `BIGSERIAL` | NO | auto-increment | PRIMARY KEY | Sequential audit ID |
| `event_id` | `UUID` | NO | `gen_random_uuid()` | UNIQUE, NOT NULL | Unique event identifier |
| `event_type` | `VARCHAR(50)` | NO | — | NOT NULL | Event type (see enum below) |
| `entity_type` | `VARCHAR(50)` | NO | — | NOT NULL | Which table was affected |
| `entity_id` | `UUID` | NO | — | NOT NULL | Which row was affected |
| `actor_user_id` | `UUID` | YES | — | FK → `pp_user.id` | Who performed the action (NULL = system) |
| `actor_type` | `VARCHAR(20)` | NO | `'user'` | CHECK (actor_type IN ('user', 'system', 'llm', 'scheduler')) | Who/what performed |
| `action` | `VARCHAR(20)` | NO | — | CHECK (action IN ('create', 'update', 'delete', 'submit', 'verify', 'approve', 'reject', 'deploy', 'rollback')) | What happened |
| `old_value` | `JSONB` | YES | — | — | Previous state (for updates) |
| `new_value` | `JSONB` | YES | — | — | New state |
| `metadata` | `JSONB` | YES | — | — | Additional context (IP, session, etc.) |
| `ip_address` | `INET` | YES | — | — | Client IP address |
| `user_agent` | `VARCHAR(500)` | YES | — | — | Client user agent |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | NOT NULL | Immutable timestamp |

**Event Types:**
- `proposal.created`, `proposal.submitted`, `proposal.updated`
- `verification.started`, `verification.completed`, `verification.failed`
- `rule.evaluated`, `rule.passed`, `rule.failed`
- `review.assigned`, `review.approved`, `review.rejected`
- `deployment.started`, `deployment.completed`, `deployment.failed`, `deployment.rolled_back`
- `user.login`, `user.logout`

**Indexes:**
- `idx_pp_audit_entity` — B-tree on (`entity_type`, `entity_id`)
- `idx_pp_audit_actor` — B-tree on `actor_user_id`
- `idx_pp_audit_event_type` — B-tree on `event_type`
- `idx_pp_audit_created` — B-tree on `created_at DESC`
- `idx_pp_audit_action` — B-tree on `action`

**Table Properties:**
- This table should NEVER have UPDATE or DELETE operations
- Use table partitioning by month on `created_at` for performance
- Consider archiving partitions older than 7 years to cold storage

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Tables** | 16 |
| **Total Columns** | ~180 |
| **Foreign Keys** | 25 |
| **Unique Constraints** | 12 |
| **Check Constraints** | 28 |
| **Indexes** | 45+ |
| **JSONB Columns** | 12 (for flexible rule logic, LLM responses, manifests) |

---

## Key Design Decisions

1. **UUIDs everywhere** — No sequential IDs exposed to users. Prevents enumeration attacks.
2. **JSONB for rule logic** — Rules need nested boolean logic (AND/OR/NOT trees). JSONB with GIN indexes enables this without a separate tree table.
3. **Immutable audit log** — `pp_audit_log` is append-only with no UPDATE/DELETE. Partitioned by month for query performance.
4. **Soft deletes** — `is_active` flags instead of hard deletes on users, rules, and regulatory sources.
5. **All-or-nothing in schema** — `pp_verification_run.status` is `passed` ONLY if `total_rules_failed = 0`. Application layer enforces this.
6. **Snapshot rule logic** — `pp_verification_node.rule_logic_snapshot` captures the exact rule definition at execution time, so historical audits remain valid even if rules change later.
7. **Deployment rollback** — `pp_deployment.rollback_artifact` stores the pre-deployment state for emergency rollback.
8. **TIMESTAMPTZ everywhere** — All timestamps are timezone-aware. Critical for multi-jurisdiction compliance.
