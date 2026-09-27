# comms/: GitHub mailbox between the laptop orchestrator and the agent on the Guidewire VM

GitHub is the only link between our laptops and the Guidewire VM, so tasks and reports travel as files in this folder.

```
comms/to-vm/NNN-<topic>.md          task for the VM agent   (written by the laptop side)
comms/from-vm/NNN-<topic>-report.md report for that task    (written by the VM agent)
```

## Loop for the VM agent
1. `git -C C:\ProvenPath pull --rebase`
2. Find the **lowest-numbered** `comms/to-vm/NNN-*.md` with **no** matching `comms/from-vm/NNN-*-report.md`, and do exactly that task.
3. Write the report to `comms/from-vm/NNN-<topic>-report.md`. Start it with `Status: DONE | PARTIAL | BLOCKED`, then results, exact errors, and open questions for the laptop side.
4. Stage **only** the files the task allows, then run the safety check. **It must print OK before you commit:**
   `C:\Guidewire\Apps\Git\bin\bash.exe scripts/vm-check-staged.sh`
5. `git commit -m "vm: NNN <topic> report"`, then `git pull --rebase` and `git push`.
   No AI co-author lines in commits.
6. If you're waiting for the next task, poll with `git pull` every few minutes. Don't invent work.

## Rules that never change
- **The repo is PUBLIC.** Never commit anything from `C:\GW10`, PolicyCenter jars or config files, `.env` / `agent.env`, credentials, the backup, the hostname or IPs.
  - When describing Guidewire file formats, write **your own summary** and quote at most a few lines of element or attribute names. Never copy whole Guidewire files.
- Change nothing under `C:\GW10` unless the task explicitly says so, and only after checking that the backup exists (`C:\ProvenPath-backup\configuration-20260926-1918`).
- Never change the global `JAVA_HOME` (PolicyCenter uses Corretto). Use Temurin 11 in-session only.
- No logins, no reboots.
- The VM agent commits **only** under `comms/from-vm/`, plus `policycenter/` when a task explicitly asks for files we author there. `scripts/vm-check-staged.sh` enforces this.
