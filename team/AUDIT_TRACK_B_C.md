# Audit: Track C (Dhriti) and Track B (Chinmay), 2026-09-29

## Track C: Dhriti (PR #2, merged into `main` at `d714a6d`)

Delivered: `:planner` (Gemini planner + repair loop + fixture fallback), 30 new eval corpus files (`scripts/gen_corpus.ps1`), the 4 tool schemas in `shared/tools/`, and the MCP bridge `web/app/api/mcp/route.ts`.

**Verified on a laptop against the real backend**
- All 47 backend tests pass. The planner module has no tests of its own.
- Eval on the new corpus: 40 items, false pass **0/20**, false block **0/20**.
- `LLM_MODE=live`: the backend loads `provenpath.planner.Planner` by class name. Without `GEMINI_API_KEY` it falls back to the fixture, with correct events.
- MCP after the fixes below: `initialize` → `tools/list` (4 tools) → `propose_product` → `add_coverage` (10 clauses) → `verify_compliance` **PASSED** → `deploy_product` correctly refused with `409 not_approved`.

**Fixed in this audit**
1. **`main` did not build.** `route.ts` passed Next `Request`/`Response` objects into the SDK's Node-only `StreamableHTTPServerTransport`, and used zod v3's `z.record(z.number())` while zod 4 is installed. `npm run build` failed. It now uses `WebStandardStreamableHTTPServerTransport` in stateless mode (a new server per request, no session map).
2. **`planner.repair` did not follow `docs/events.md`.** It sent `failures` + `note` but not `failedRule`, `clauseId`, `expected`, `actual`, `reason`, so the UI showed "Repairing undefined". It now sends both.
3. **A re-propose during repair lost state.** A `propose_product` call inside the repair loop reset the iteration to 1, gave the proposal a new id and dropped the clauses. It now keeps all three.
4. **Gemini request details.** The model is overridable with `GEMINI_MODEL` (default stays `gemini-2.0-flash`). The API key now goes in the `x-goog-api-key` header instead of the URL, so it can't leak into logs.

**Not yet verified (needs `GEMINI_API_KEY`)**
- **The live Gemini path has never run here.** Specific risk: the repair turn appends a plain user text right after the model's `functionCall` turn, with no `functionResponse` parts. If Gemini rejects that, the exception handler falls back to the fixture in the middle of the run, and iteration numbering starts again at 1.
- **Check the model name still exists.** Confirm `gemini-2.0-flash` is still served, or set `GEMINI_MODEL`.
- **Silent fallback.** A missing key in `LLM_MODE=live` silently becomes the fixture. `/health` still says `live`, and only the `planner.step` event says "fallback".

**Asks for Dhriti**
- Run one live execution with a key and paste the event log into `comms/` or the PR.
- Add a planner unit test with a stubbed `GeminiClient`: proposal → blocked → repair → passed.

## Track B: Chinmay (`track-b/spike`, **do not merge**)

Contents: a `:pcmock` module (a Javalin server that answers `{"status":"success"}` to every `/pc/*` call) on port **8180**, a `policycenter-mock` service in docker-compose, and a `web` service.

**Why it can't go in**
- **It is a mock PolicyCenter.** The brief says: "No mock PolicyCenter in the product". The real PolicyCenter 10.2.1 is on the VM and SMCyber is already installed there.
- **Port clash.** It takes 8180, the real PolicyCenter port.
- **Conflicts with `main`.** It is branched from before PR #2 (`settings.gradle`, `build.gradle`).
- **No deliverable work yet.** None of the assigned items exist: `:pcexport` (`provenpath.pcexport.PackageBuilder`, which is why deploy returns 503), `:pcagent`, and the `vm\` scripts.

**Next for Chinmay, in order** (details in `team/CHINMAY.md`)
1. `backend/pcexport`: `PackageBuilder implements PackageBuilderPort`. Proposal + PASSED verdict + approval → overlay zip + `provenpath-manifest.json`. Golden test from `fixtures/proposal_demo_fixed.json`. The backend already loads it by class name, so deploy stops returning 503 as soon as it exists.
2. `backend/pcagent`: long-poll `/pc-agent/next`, verify the gate token and file hashes, write into `PC_HOME`, restart, confirm via ProductModelAPI (pc1000). Test the loop on a laptop with a temp `PC_HOME` and small test scripts; that is test config, not a product mock.
3. `vm\start-all.cmd`, reusing `scripts/run-local.cmd`.

Delete `track-b/spike` once `:pcexport` lands.
