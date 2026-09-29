# policycenter/

Everything that ends up inside, or runs next to, the real Guidewire PolicyCenter 10.2.1 on the VM.

| Path | What it is |
|---|---|
| `overlay-template/` | The SMCyber product-model files we authored (product + 3 coverage patterns on `GLLine`, display names, one PCF edit). Installed by hand as "v0" (VM task 003); since then the package builder fills it from each approved proposal. Install/uninstall by hand: [`overlay-template/INSTALL.md`](overlay-template/INSTALL.md) |
| `agent/` | Configuration for the PC agent (`agent.env.example`). See [`agent/README.md`](agent/README.md) |

## How a product gets into PolicyCenter
1. The backend's package builder (`backend/pcexport`) copies the template and writes, from the verified proposal, each coverage's `existence` and each cov term's `minVal`/`maxVal` (e.g. `SMCyberExtortionLimit` max = 50% of the aggregate, CYB-RNG-002). PolicyCenter then enforces those caps natively (`CovTermDirectInputSetHelper.validate`).
2. The zip carries a signed `provenpath-manifest.json` (file SHA-256s, term ranges, gate token, reviewer) and `provenpath-report.json` (clauses installed vs. clauses with no PolicyCenter pattern).
3. The PC agent verifies it, backs up, writes into `C:\GW10\PolicyCenter\modules\configuration`, restarts PolicyCenter and confirms the codes via ProductModelAPI.

The PC-side check asked for in the plan ("reject out-of-range SMCyber terms inside PolicyCenter") is done with PolicyCenter's own term limits rather than custom Gosu in PolicyCenter: nothing is compiled into PolicyCenter, and a values-only change restarts in about 4 minutes instead of a 22-minute full compile.

Never commit Guidewire files: only files we author live here.
