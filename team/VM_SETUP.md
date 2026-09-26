# VM prior setup: prompt for the agent running on the Guidewire cloud VM

**Goal:** prepare the Guidewire-provided PolicyCenter VM to become ProvenPath's integration and demo environment. Docker runs the ProvenPath stack next to PolicyCenter. PolicyCenter itself stays native, exactly as Guidewire provided it. After setup, Claude Code on the VM can start and debug everything.

Paste the block below into Antigravity (or Claude Code) on the VM.

```
You are working on a Windows cloud VM provided by Guidewire for a hackathon. It hosts a licensed Guidewire PolicyCenter 10 install at C:\GW10\PolicyCenter. Your job is PRIOR SETUP ONLY: inventory, backup, feasibility checks, tool installs, and a written report. Our project is ProvenPath (public repo https://github.com/shauryaaojha/ProvenPath-Guidewire). Later its Docker stack (Postgres + a Gosu/JDK 11 backend + a Next.js web app) will run on THIS VM next to PolicyCenter, and a small native Java agent will write product-model files into PolicyCenter and restart it.

HARD RULES
- Do NOT modify anything under C:\GW10 (read-only, except making a backup COPY elsewhere). Do not delete, move, rebuild or reconfigure PolicyCenter.
- Do NOT stop or restart PolicyCenter if it is currently running; just record its state.
- Do NOT reboot the VM. If any step needs a reboot (e.g. enabling WSL2/Hyper-V features), prepare everything up to that point, then STOP and say clearly in the report "REBOOT REQUIRED to continue: <what and why>".
- Do NOT log in to any account (GitHub, Docker Hub, Anthropic). The human does all logins. Do not print, store or copy any passwords, tokens or keys.
- Do NOT copy any Guidewire file into C:\ProvenPath and do not commit or push anything anywhere.
- Use PowerShell. Prefer winget for installs. If an install needs admin rights you don't have, record that and continue.

STEP 1 — Inventory (record every value in the report)
- OS: `Get-ComputerInfo | Select-Object OsName, OsVersion, OsArchitecture, CsTotalPhysicalMemory, CsNumberOfLogicalProcessors`; free disk per drive (`Get-PSDrive -PSProvider FileSystem`).
- Virtualization for Docker: `systeminfo` (the "Hyper-V Requirements" section and "A hypervisor has been detected"), `wsl --status`, `wsl --list --verbose`, `Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux, VirtualMachinePlatform, Microsoft-Hyper-V` (ok if some fail). Conclude clearly: can Linux containers (Docker Desktop with the WSL2 backend) run here — YES / NO / NEEDS REBOOT.
- Existing tools and versions: java (all JDKs: `where.exe java`, `java -version`, JAVA_HOME), git, node, npm, docker, winget, gh, curl.
- PolicyCenter: read C:\GW10\PolicyCenter\project-version.properties (version only); find how it is started and stopped (gwb.bat / gradlew.bat / any .cmd scripts, Windows services, scheduled tasks); which JDK it uses; is it running now (`Get-NetTCPConnection -LocalPort 8180 -State Listen`, and the java processes with their command lines); does http://localhost:8180/pc respond (Invoke-WebRequest, status code only). Is C:\GW10\PolicyCenter a git repo (`git -C C:\GW10\PolicyCenter status` — read-only)?
- Network (outbound): HTTPS reachability of https://github.com, https://registry-1.docker.io/v2/, https://registry.npmjs.org, https://repo1.maven.org/maven2/, https://plugins.gradle.org, https://generativelanguage.googleapis.com, https://api.anthropic.com. Report status codes or errors, and any proxy settings (`netsh winhttp show proxy`, HTTP(S)_PROXY env vars).

STEP 2 — Backup (read-only on source)
- `robocopy C:\GW10\PolicyCenter\modules\configuration C:\ProvenPath-backup\configuration-<yyyyMMdd-HHmm> /E /COPY:DAT /R:1 /W:1 /NFL /NDL` and record the file count and total size of source vs backup (they must match).

STEP 3 — Install tools (only what is missing; record every version)
- Git (`winget install --id Git.Git -e`), Node.js LTS 20+ (`winget install --id OpenJS.NodeJS.LTS -e`), GitHub CLI (`winget install --id GitHub.cli -e`) — do NOT run `gh auth login`.
- Eclipse Temurin JDK 11 for the ProvenPath agent if no JDK 11 exists outside PolicyCenter's own (`winget install --id EclipseAdoptium.Temurin.11.JDK -e`). Do NOT change PolicyCenter's JDK or JAVA_HOME if PolicyCenter depends on it; record where each JDK lives.
- Claude Code: `npm install -g @anthropic-ai/claude-code`, then `claude --version`. Do NOT log in.
- Docker, only if STEP 1 concluded YES or NEEDS REBOOT: `winget install --id Docker.DockerDesktop -e`. If WSL2 features must be enabled, run `wsl --install --no-distribution` (or enable VirtualMachinePlatform + Microsoft-Windows-Subsystem-Linux), then STOP for the reboot per the hard rules. If Docker is already usable: `docker version`, `docker run --rm hello-world`, then pre-pull `postgres:16`, `gradle:8.10-jdk11`, `eclipse-temurin:11-jre`, `node:20-alpine` and record how long each took.
- If STEP 1 concluded NO (no nested virtualization): do NOT install Docker. Record "Docker not possible on this VM" — the team then keeps the stack on laptops, and the agent on this VM will pull packages over the internet instead.

STEP 4 — Clone the project (no auth needed, it is public)
- `git clone https://github.com/shauryaaojha/ProvenPath-Guidewire C:\ProvenPath` (outside C:\GW10). Do not commit or push.

STEP 5 — Resource headroom
- With PolicyCenter in its current state, record the free RAM (`Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory, TotalVisibleMemorySize`) and the PolicyCenter java process working set. Estimate whether another ~6 GB (Postgres + JVM backend + Next.js + Docker/WSL overhead) fits. Say so plainly.

STEP 6 — Report
Write C:\ProvenPath-backup\VM_REPORT.md (NOT inside the git clone) with these sections: Summary verdict (Docker on VM: YES / NO / NEEDS REBOOT; enough RAM: YES / NO; outbound OK: YES / NO) · Inventory table · PolicyCenter (version, start/stop commands, JDK, running state, port, URL) · Network results · Backup location + file counts · Installed tools and versions · Anything that needs a human (logins, reboot, admin rights, blocked domains) · Exact next steps.
Contains NO secrets. Finally print the Summary verdict and the "needs a human" list in your final message.
```

## After it finishes
1. Read `C:\ProvenPath-backup\VM_REPORT.md` on the VM and paste the summary to the team.
2. If it says **REBOOT REQUIRED**, reboot the VM, open Docker Desktop once, then ask the agent to continue from STEP 3 (Docker part).
3. Do the logins yourself:
   - GitHub via `gh auth login` with a **fine-grained token scoped to this repo only**. Revoke it after the hackathon.
   - `claude` login.
4. **Result (Day 0):** Docker is not possible on the VM, and college Wi-Fi blocks tunnels. So we build on laptops and do the final integration natively on the VM; see `team/VM_INTEGRATION.md`.
