# ProvenPath roadmap

## v1.0: SME Cyber (done)
One product, end to end: **SMCyber** (SME cyber insurance) on PolicyCenter's General Liability line.
- Gemini planner → 23-rule deterministic gate (6 layers) → named Compliance Reviewer → signed package → PC agent → real PolicyCenter 10, confirmed via ProductModelAPI.
- Rules cite real texts verbatim (IRDAI cyber guidance 2021, CERT-In directions 2022, MSME S.O. 1364(E) 2025, DPDP Act 2023) plus a labelled underwriting guideline for numeric caps no regulator sets.
- 62 backend tests; eval 40 proposals, 0/20 false passes, 0/20 false blocks.

## v2.0: every product line
The engine is already product-agnostic: the gate reads rules from YAML, hashes/tokens/signatures and the agent's install loop don't care what the product is. What is SMCyber-specific today is **data and three hard-coded spots**. v2 turns those into a product registry.

### Platform work (once, before adding lines)
1. **Product registry** (`products/<code>/`): per product a `product.yaml` (code, name, PolicyCenter line pattern + owning entity, coverage patterns, cov-term ↔ rule mapping for term ranges), its rule pack (`rules/*.yaml`), its sources (`sources.yaml`), its PolicyCenter overlay template, fixtures and eval corpus.
2. **Gate per product:** `RuleLoader` loads the pack of the proposal's `line`; the ruleset hash covers only that pack; `/api/v1/rules?product=` for the UI.
3. **Planner:** system prompt, tool schemas (`shared/tools`) and allowed pattern codes come from the product registry instead of the SMCyber text; the user picks or the planner infers the product.
4. **Package builder:** the term-range table (`termRangesFor`) and template directory come from `product.yaml`; the PC agent confirms whatever codes the manifest lists (already generic).
5. **Mission Control:** a product picker in the composer; rule graph columns stay the six layers; landing page lists the available products.
6. **Eval per product:** a labelled corpus per line; metrics reported per product.
7. **Source pipeline:** keep the official PDFs' URLs + a script that re-extracts the verbatim passages (the v1 extraction ran from a scratch folder; move it into `tools/sources/`).

### Candidate lines (each with a real legal basis and a PolicyCenter base line to build on)
| Product | Real basis in India | PolicyCenter line to extend |
|---|---|---|
| Public Liability (Industrial) | Public Liability Insurance Act, 1991: compulsory for owners handling hazardous substances; statutory relief amounts | General Liability (`GLLine`), like SMCyber |
| Fire for micro and small enterprises | IRDAI standard products *Bharat Sookshma Udyam Suraksha* / *Bharat Laghu Udyam Suraksha* (from 1 Apr 2021) | Commercial Property |
| Employees' Compensation | Employees' Compensation Act, 1923 (employer liability for workplace injury) | Workers' Compensation |
| Motor third party (add-on for fleets) | Motor Vehicles Act, 1988, s.146–147: compulsory third-party cover | Commercial / Personal Auto |
| Surety bonds for contractors | IRDAI (Surety Insurance Contracts) Guidelines, 2022 | Inland Marine / a new line |
| Standard health (group) | IRDAI standard product *Arogya Sanjeevani* | out of PolicyCenter's P&C scope: a later phase |

Every new line follows the v1 recipe: verbatim official sources (downloaded, extracted, byte-exact), numeric caps no regulator sets in a labelled underwriting guideline, a golden package test, an eval corpus, and one PolicyCenter install (first install of new pattern files compiles for ~22 min on the VM, values-only changes afterwards ~4 min).

### Order
1. Platform work (registry, per-product gate, planner, builder, picker).
2. Public Liability (same GL line as cyber: the smallest step, proves the registry).
3. Fire (Bharat Sookshma/Laghu: standard wording, real IRDAI products).
4. Employees' Compensation, Motor TP, Surety.

## Later (v3)
Quoting inside PolicyCenter (rate books), SubmissionAPI to create a policy from Mission Control, reviewer login and roles, INR currency typelist in PolicyCenter, multi-reviewer approval for high limits.
