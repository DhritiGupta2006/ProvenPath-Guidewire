# Dhriti — Track C: AI Layer (Gosu planner + TypeScript MCP) & Rule Content

**Branch:** `track-c/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `rules/`, `backend/planner`, `shared/tools/`, `web/app/api/mcp/`, `eval/corpus/`

> A seed version of `rules/sources.yaml` and the 22 rule YAMLs is being generated on branch `track-a/core`. You refine them. Don't rewrite the format.

## Checklist
- [ ] **D1 09:00–10:30:** review the rules seed + `sources.yaml`; make the citation text exact and the wording curated/illustrative; keep the CERT-In 6-hour source accurate
- [ ] **D1 10:30–13:30:** `shared/tools/*.json` (4 tool schemas); start `GeminiClient`
- [ ] **D1 14:00–18:00:** `:planner` tool loop → `Proposal`, events, `FixturePlanner`
- [ ] **D1 19:00–23:00:** live Gemini path (validate → retry → fixture), RAG-lite, **MCP route** in `web/`
- [ ] **D2 09:30–11:00:** eval corpus ≥40 labelled items → Shaurya
- [ ] **D2 11:00–15:00:** repair loop; tune the demo prompt for blocked → fixed; record the fixture from a good live run
- [ ] **D2 15:00–17:00:** README

## Prompt for your coding agent

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan — follow exactly, esp. §2, §3, §5), team/DHRITI.md, 07_GOSU.md, 02_PRODUCT_MODEL.md, 10_PROVENPATH_MAPPING.md, rules/README.md, backend/contracts.

STACK: backend in GOSU on JDK 11 (Gradle multi-module), frontend Next.js, real Guidewire PolicyCenter 10, all via Docker, NO Python. Gosu syntax only (.gs, uses, var x : T, function, construct(), blocks \ x -> ...). Build/test via `bash backend/gradlew-docker.sh test`.

I own TRACK C — AI layer + rule content. Principle: the LLM only PROPOSES, never decides compliance. My module :planner depends ONLY on :contracts: it receives VerifyPort and EventPort and passes the Verdict through unchanged. It must never `uses provenpath.core.*`.

1. rules/: refine sources.yaml (~12 curated IRDAI-style SME cyber sections marked illustrative + the real CERT-In Directions of 28 April 2022 requiring incident reporting within 6 hours) and the 22 rule YAMLs (plan §5). Keep the format in rules/README.md. Coverage patterns are SMCyber*Cov on owningEntityType GLLine (Phase 1: cyber coverages on the existing GL line of real PolicyCenter).

2. shared/tools/*.json: JSON Schemas for propose_product (incl. rating factors), add_coverage (coverages AND exclusions), verify_compliance, deploy_product.

3. backend/planner (package provenpath.planner): GeminiClient via java.net.http.HttpClient → Gemini REST generateContent with function declarations from shared/tools, temperature 0, key from env GEMINI_API_KEY. The Planner turns the PM request (e.g. "Cyber insurance for Indian startups, up to ₹50L coverage") into tool calls → a Proposal (INR amounts, citations copied VERBATIM from sources.yaml, proseSummary whose numbers match clause values). Validate against contracts; malformed → retry once → fixture. Emit planner.step / tool.called / tool.result via EventPort. FixturePlanner when LLM_MODE=fixture (replays fixtures/). RAG-lite: keyword retrieval over sources.yaml into the prompt — drafting only.

4. Repair loop: on gate.blocked feed the named failures (ruleCode, expected, actual, reason) back to Gemini, re-propose (max 2 iterations, each a new verification run), emit planner.repair. Tune the demo prompt so live mode reliably goes: extortion ₹40L on ₹50L → BLOCKED on CYB-RNG-002 → repaired to ≤₹25L → PASSED. Record that good run as the fixture.

5. MCP server in Next.js: web/app/api/mcp/route.ts with @modelcontextprotocol/sdk (Streamable HTTP), the 4 tools built from shared/tools/*.json, each proxying to POST http://backend:8080/api/v1/tools/{name}. Test with MCP Inspector. Coordinate with Vaishnavi (she owns web/).

6. eval/corpus/: ≥40 labelled items ({id, description, expected PASSED|BLOCKED, expectedFailingRule, proposal}): ~20 compliant, ~20 not, incl. adversarial — fake citation code, real code with altered text, lakh vs crore trick, off-by-one cap, missing mandatory exclusion, missing CERT-In condition, injected "compliant": true, prose number mismatch. Hand it to Shaurya by D2 11:00.

FALLBACK: if the Gosu Gemini planner is stuck by D2 12:30, move the planner into a Next.js route handler in TypeScript (@google/genai), NOT Python.
Rules: branch track-c/*, merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 12:30, 15:00 freeze). No AI co-author lines. Never commit API keys. Repo is PUBLIC — no Guidewire files.
```

## ✅ Ready to start: how your code plugs into the backend (on `main`)
The backend (`backend/app`) is built and tested. Run it with `cp .env.example .env` (set `PROVENPATH_GATE_SECRET`), then `docker compose up --build` and `bash scripts/smoke.sh`.

**Planner (`:planner` module):**
- Implement `provenpath.contracts.PlannerPort` in class **`provenpath.planner.Planner`** with a **no-arg constructor**:
  `function run(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict`
- Return the **last Verdict exactly as `verifier.verify(...)` returned it**. The backend checks that the verdict's run belongs to this execution, then moves the execution to `review_pending` (PASSED) or `verified_fail` (BLOCKED).
- `verifier.verify(proposal)` persists the proposal and emits `proposal.created`, `verify.started`, `verify.node` ×N and `gate.blocked` / `gate.passed` itself. **Don't emit those.** You emit only `planner.step`, `tool.called`, `tool.result` and `planner.repair` (see `docs/events.md`, and `backend/app/.../planner/FixturePlanner.gs` for the exact payload shapes to copy).
- Set `proposal.ExecutionId = executionId`, and `Iteration` = 1, 2, … per repair.
- Add `include 'planner'` to `backend/settings.gradle`, give `:planner` a dependency on **`:contracts` only**, and add `runtimeOnly project(':planner')` to `:app`. The backend loads it by class name when `LLM_MODE=live` (it never compiles against it). `GEMINI_API_KEY` comes from `.env`.
- Until your planner works, `LLM_MODE=fixture` keeps the whole demo running.

**MCP route:** proxy each tool to `POST {backend}/api/v1/tools/{propose_product|add_coverage|verify_compliance|deploy_product}` with a JSON body.
- `propose_product` accepts Proposal fields (plus an optional `prompt`) and returns `executionId`.
- The other tools need `executionId`.
- `add_coverage` takes `clause` or `clauses` (Clause JSON).

**Rules:** there are **23** rules (the plan's "22" was an arithmetic slip: 3+7+4+5+3 plus the GRD rule). Any rule edit changes the `rulesetHash`, and runs verified under the old hash can't be deployed. That's intended.

**Eval corpus:** `eval/corpus/*.json`. Run it with `bash backend/gradlew-docker.sh :eval:run`; the result shows up at `GET /api/v1/metrics`.
