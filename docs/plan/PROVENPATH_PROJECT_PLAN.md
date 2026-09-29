# ProvenPath Project Plan

## 1. Executive Summary

Launching a new insurance product typically requires translating a product manager's plain-language requirements into technical coverages, exclusions, rating rules, and Guidewire PolicyCenter configuration—a manual, error-prone, weeks-long process. While AI (LLMs) can drastically accelerate this translation, AI **cannot be trusted** to decide compliance; it can only *propose* configurations. 

ProvenPath is a Deterministic Pre-Commit Compliance Gate for Agentic Insurance Product Configuration. It acts as an unbypassable, deterministic firewall. The system intercepts LLM-proposed configurations and subjects them to an independent, deterministic **rule-graph** verification before anything reaches PolicyCenter. 

For this initial rollout, the scope is highly focused:
*   **Single Product Line**: Cyber Insurance for SMEs.
*   **Curated Rule Set**: ~15–25 IRDAI-style deterministic compliance constraints.
*   **Human-in-the-Loop**: A compliance reviewer must provide final approval; there is **no auto-deployment**.
*   **All-or-Nothing Compliance**: Any single verification failure blocks the entire configuration proposal. No partial compliance is permitted.

**Elevator Pitch:** ProvenPath is the deterministic safety net for AI-driven Cyber Insurance product design. By providing a rigorous, graph-based compliance gate, it empowers carriers to use LLM agents to draft product configurations from plain text, while guaranteeing 100% regulatory and architectural compliance through independent verification and mandatory human review before PolicyCenter deployment.

---

## 2. System Architecture

### High-Level Architecture Diagram

```text
┌─────────────────────────┐         JSON/YAML          ┌───────────────────────────────────────────────────┐
│                         │        Proposals           │                   PROVENPATH                      │
│ Product Manager (Text)  │───────────────────────────►│                                                   │
│    + LLM Agent System   │                            │  ┌──────────────┐    ┌─────────────────────────┐  │
│ (Proposer)              │◄───────────────────────────┤  │ LLM Interface│───►│ Schema Validator        │  │
└─────────────────────────┘        Rejection /         │  └──────────────┘    └──────────┬──────────────┘  │
                                   Validation Errors   │                                 │                 │
                                                       │  ┌──────────────────────────────▼──────────────┐  │
                                                       │  │ Rule-Graph Engine (Deterministic DAG)       │  │
                                                       │  │                                             │  │
                                                       │  │  [Rule 1] ──► [Rule 3] ─┐                   │  │
                                                       │  │    │                    ▼                   │  │
                                                       │  │    └────────► [Rule 4] ──► [Rule 5]         │  │
                                                       │  │  [Rule 2] ──────────────┘                   │  │
                                                       │  │                                             │  │
                                                       │  │  5 Dimensions per Clause:                   │  │
                                                       │  │  1. Type 2. Range 3. Consistency            │  │
                                                       │  │  4. Rule-match 5. Source-citation           │  │
                                                       │  └──────────────────────────────┬──────────────┘  │
                                                       │                                 │                 │
                                                       │  ┌──────────────────────────────▼──────────────┐  │
                                                       │  │ All-or-Nothing Gate                         │  │
                                                       │  │ (If ANY failure -> Block & Return)          │  │
                                                       │  └──────────────────────────────┬──────────────┘  │
                                                       │                                 │ PASS            │
                                                       │  ┌──────────────────────────────▼──────────────┐  │
                                                       │  │ Human-in-the-Loop Review Dashboard          │  │
                                                       │  │ (Compliance Reviewer Approval)              │  │
                                                       │  └──────────────────────────────┬──────────────┘  │
                                                       │                                 │ APPROVED        │
                                                       │  ┌──────────────────────────────▼──────────────┐  │
                                                       │  │ PolicyCenter Adapter                        │  │
                                                       │  │ (Transforms specs to XML / APIs)            │  │
                                                       │  └──────────────────────────────┬──────────────┘  │
                                                       └─────────────────────────────────┼─────────────────┘
                                                                                         │ Deploy
                                                                                         ▼
                                                                       ┌────────────────────────────────┐
                                                                       │ Guidewire PolicyCenter 10      │
                                                                       │ - Cyber Insurance Product Line │
                                                                       │ - config/resources/productmodel│
                                                                       └────────────────────────────────┘
```

### Component Breakdown & Data Flow

1. **LLM as Proposer**: The LLM translates plain text to a structured JSON proposal but makes no compliance decisions.
2. **ProvenPath LLM Interface**: Ingests the `ProposalRequest`.
3. **Schema Validator**: Performs initial structural validation against internal models.
4. **Rule-Graph Engine (The Verifier)**: A Directed Acyclic Graph (DAG) executor that evaluates ~15-25 IRDAI-style constraints for Cyber Insurance. It evaluates every clause across five dimensions (Type, Range, Consistency, Rule-match, Source-citation).
5. **All-or-Nothing Gate**: If a single node in the DAG fails, the proposal is rejected completely and sent back to the LLM/PM with error details.
6. **Human-in-the-Loop Dashboard**: Validated, compliant configurations are queued for a human Compliance Reviewer.
7. **PolicyCenter Adapter**: Once human-approved, this module converts the ProvenPath schema into Guidewire XMLs (e.g., `SMCyberLine.xml`, `SMCyberCov.xml`, `RateBook.eti` payloads) and pushes them to PolicyCenter or generates deployment instructions.

---

## 3. Technology Stack Recommendations

*   **Language**: **Python 3.11+**
    *   *Justification*: Best ecosystem for DAG construction (`networkx`), validation, and integrating with AI tooling.
*   **Framework**: **FastAPI**
    *   *Justification*: Native async support, high performance, automatic OpenAPI documentation.
*   **Database**: **PostgreSQL**
    *   *Justification*: Relational integrity is vital for storing the `AuditTrail`, the rule set definitions, and human review states.
*   **Rule Engine**: **Custom DAG Engine using `networkx`**
    *   *Justification*: We specifically need a deterministic, graph-based verification engine where rules have explicit dependencies. Standard sequential engines are insufficient.
*   **Data Validation**: **Pydantic V2**
    *   *Justification*: Strict, type-safe schema validation before the DAG engine even runs.
*   **Deployment**: **Docker + CI/CD (GitHub Actions)**
    *   *Justification*: Containerized execution ensures that the deterministic engine behaves exactly the same across environments.

---

## 4. Data Models / Schema Design

### Internal ProvenPath Models

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict

class Citation(BaseModel):
    sourceName: str # e.g., "IRDAI Cyber Security Guidelines 2023"
    section: str # e.g., "Section 4.1.2"
    textSnippet: str

class LimitSpec(BaseModel):
    codeIdentifier: str
    valueType: Literal['money', 'count', 'percent']
    minValue: float
    maxValue: float
    defaultValue: float
    citations: List[Citation]

class DeductibleSpec(BaseModel):
    codeIdentifier: str
    lookupTableName: str
    availableValues: List[float]
    citations: List[Citation]

class CoverageSpec(BaseModel):
    patternCode: str # e.g., 'CyberRansomwareCov'
    coverageCategory: str # e.g., 'SMCyberLiabilityGrp'
    owningEntityType: str # e.g., 'SMCyberPolicyLine'
    existence: Literal['Required', 'Suggested', 'Electable', 'Preset']
    limits: List[LimitSpec] = []
    deductibles: List[DeductibleSpec] = []
    citations: List[Citation]

class RatingRuleSpec(BaseModel):
    rateBookCode: str
    rateTableCode: str
    factors: List[dict] 
    routineSteps: List[str] 
    citations: List[Citation]

class ProposalRequest(BaseModel):
    proposalId: str
    lineOfBusiness: Literal['SMCyber'] # Scoped purely to Cyber Insurance
    coverages: List[CoverageSpec] = []
    exclusions: List[CoverageSpec] = [] # Exclusions modeled similar to Coverages
    ratingRules: List[RatingRuleSpec] = []
    uwRules: List[dict] = [] # UWRule definitions

class VerificationDimension(BaseModel):
    dimension: Literal['Type', 'Range', 'Consistency', 'RuleMatch', 'SourceCitation']
    passed: bool
    details: str

class VerificationResult(BaseModel):
    ruleNodeId: str
    passed: bool
    dimensions: List[VerificationDimension]

class ComplianceReport(BaseModel):
    proposalId: str
    status: Literal['PENDING_REVIEW', 'REJECTED', 'APPROVED', 'DEPLOYED']
    allOrNothingPassed: bool
    results: List[VerificationResult]
    humanReviewerId: Optional[str] = None
```

### Mapping to PolicyCenter Concepts
*   **SMCyber CoverageSpec** maps to XMLs in `config/resources/productmodel/policylinepatterns/SMCyberLine/coveragepatterns/`.
*   **SMCyber RatingRuleSpec** maps to `RateBook`, `RateTableDefinition`, and `CalcRoutineDefinition` in PC metadata.
*   **UW Rules** map to `UWRule.eti` and `UWIssueType.eti`.

---

## 5. Core Modules (Detailed)

### 5.1 LLM Interface Module
*   **Purpose**: Receive structured SME Cyber proposals from the LLM.
*   **Validation**: Hands off immediately to Schema Validator. Rejects malformed JSON directly.

### 5.2 Schema Validator
*   **Purpose**: Validates basic payload shape. 
*   **Check**: Does it contain Coverages, Limits, Deductibles? Are `patternCode` fields alphanumeric?

### 5.3 Rule-Graph Engine (The Verifier)
*   **Purpose**: The core deterministic DAG. Evaluates the ~15-25 IRDAI rules.
*   **Mechanics**: Uses `networkx` to build a graph of rules. A topological sort defines execution order. If Rule A checks limit boundaries and Rule B checks consistency of limits against deductibles, Rule A must run before Rule B.
*   **Five Dimensions Checked Per Clause**:
    1.  **Type Check**: e.g., Is `RansomwareLimit` of type `money`?
    2.  **Range Check**: e.g., Is `RansomwareLimit` <= $5,000,000 for SMEs?
    3.  **Consistency Check**: e.g., Is Deductible < Limit?
    4.  **Rule-Match Check**: e.g., Does this proposed coverage align with IRDAI mandatory minimum coverage rules?
    5.  **Source-Citation Check**: e.g., Does the proposal include a valid `Citation` pointing to the IRDAI guideline?

### 5.4 All-or-Nothing Gate & Compliance Reporter
*   **Purpose**: Aggregates the results of the DAG.
*   **Logic**: `if any(result.passed == False for result in all_results): return REJECT`
*   **Output**: Generates a rich Markdown `ComplianceReport` highlighting exactly which rule node and dimension failed.

### 5.5 Human-in-the-Loop Dashboard
*   **Purpose**: UI/API for compliance officers.
*   **Action**: Review passed proposals (which have a fully cited audit trail). Officer clicks "Approve" or "Reject".

### 5.6 PolicyCenter Adapter
*   **Purpose**: Takes the human-approved ProvenPath models and converts them into the specific Guidewire XML and API formats for the `SMCyber` product.
*   **Note**: Does not auto-deploy. Generates a deployment artifact (ZIP of XMLs, or staging API pushes) that must be applied to PC via standard CI/CD.

---

## 6. API Design

*   `POST /api/v1/cyber/proposals`: Submit an LLM proposal. Returns a `jobId`.
*   `GET /api/v1/cyber/proposals/{id}/status`: Returns the DAG verification status and full `ComplianceReport`.
*   `POST /api/v1/cyber/proposals/{id}/review`: (Restricted) Human reviewer endpoint to submit `Approve` or `Reject`.
*   `GET /api/v1/cyber/proposals/{id}/artifact`: Download the generated Guidewire PolicyCenter configuration package.

---

## 7. Rule Definition Format (DAG Nodes)

Rules are defined as Python classes or YAML configs that plug into the DAG.

```yaml
rule_id: "IRDAI-CYB-004"
name: "Mandatory Ransomware Sublimit Check"
depends_on: ["IRDAI-CYB-001"] # Must pass basic existence check first
category: "RangeAndConsistency"
target: "CoverageSpec[patternCode='CyberRansomwareCov']"
dimensions:
  type_check: "limit.valueType == 'money'"
  range_check: "limit.maxValue <= 5000000"
  consistency_check: "limit.maxValue <= parent_policy_limit"
  rule_match: "true" # Hardcoded validation against IRDAI directive
  source_citation: "must_have_citation('IRDAI Cyber Guidelines', 'Sec 3.2')"
```

---

## 8. Implementation Phases / Roadmap

*   **Phase 1: Foundation (Weeks 1-3)**
    *   Build Pydantic schemas specifically for SME Cyber Insurance.
    *   Implement the `networkx` DAG execution engine.
*   **Phase 2: Curated Rule Set (Weeks 4-6)**
    *   Translate the 15-25 IRDAI rules into executable graph nodes.
    *   Implement the 5 verification dimensions for each rule.
*   **Phase 3: Integration & Review (Weeks 7-9)**
    *   Build the Human-in-the-Loop review API/UI.
    *   Implement the All-or-Nothing rejection logic.
*   **Phase 4: PolicyCenter Adapter (Weeks 10-12)**
    *   Build the generation of Guidewire XMLs (`config/resources/productmodel/`) specific to the `SMCyber` line.
*   **Phase 5: Hardening & Metrics (Weeks 13-15)**
    *   Setup telemetry to track Success Metrics (Accuracy, False-block, False-pass, Time-to-config).
    *   End-to-end testing with LLM prompts.

---

## 9. Testing Strategy

*   **Graph Unit Testing**: Test individual nodes in isolation across all 5 dimensions.
*   **DAG Execution Testing**: Inject failures to ensure downstream dependent rules are skipped/handled correctly and the All-or-Nothing gate triggers.
*   **Test Data Generation**: Create a robust suite of valid and invalid Cyber Insurance JSON proposals simulating LLM outputs.
*   **Metrics Validation**: Run 1,000 simulated proposals to baseline the False-block and False-pass rates.

---

## 10. Directory Structure

```text
provenpath/
├── api/
│   ├── routes_proposals.py
│   ├── routes_review.py
│   └── main.py
├── core/
│   ├── dag_engine.py      # networkx graph logic
│   ├── gate.py            # All-or-nothing logic
│   └── metrics.py
├── models/
│   ├── cyber_schema.py    # SMCyber specific Pydantic models
│   └── verification.py
├── rules_graph/
│   ├── nodes/             # Python files implementing the 15-25 IRDAI rules
│   │   ├── irdai_cyb_001.py
│   │   └── irdai_cyb_002.py
│   └── registry.py
├── pc_adapter/
│   ├── smcyber_xml_builder.py # Generates PC XMLs
│   └── exporter.py
├── tests/
│   ├── test_dag.py
│   └── test_dimensions.py
└── config.yaml
```

---

## 11. Risk Register

1.  **False-Block Rate Risk**: The DAG rules are too strict, rejecting valid edge-case SME Cyber configs. 
    *   *Mitigation*: Rigorous rule unit testing against historical acceptable configurations.
2.  **LLM Citation Hallucination**: The LLM invents fake IRDAI citations that pass structural checks.
    *   *Mitigation*: The `Source-Citation` check in the DAG must validate against a hardcoded lookup table of acceptable IRDAI sections for the 15-25 curated rules.
3.  **Human Review Bottleneck**: Manual review slows down the AI acceleration.
    *   *Mitigation*: The Compliance Report provides extremely clear diffs and plain-English summaries to optimize review time.

---

## 12. Glossary

*   **Proposer**: The LLM agent that translates PM requirements into a JSON proposal.
*   **Verifier**: ProvenPath's deterministic DAG rule engine.
*   **DAG**: Directed Acyclic Graph, the dependency structure of the 15-25 compliance rules.
*   **Five Dimensions**: Type, Range, Consistency, Rule-match, Citation.
*   **All-or-Nothing**: A zero-tolerance policy where one rule failure rejects the whole proposal.
*   **SMCyber**: The specific Guidewire PolicyCenter line of business (SME Cyber Insurance) this project is scoped to.
