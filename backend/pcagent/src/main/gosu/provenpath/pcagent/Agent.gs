package provenpath.pcagent

uses java.util.ArrayList
uses java.util.LinkedHashSet
uses provenpath.contracts.PcManifest

/**
 * One deployment, end to end, on the PolicyCenter side:
 *   verify (signature, gate token, hashes) → back up + write → restart (only if something changed or PC is down)
 *   → wait until ProductModelAPI answers → confirm the product, coverage and cov-term codes → report.
 * A package that fails verification is refused and nothing is written.
 */
class Agent {

  static final var COVERAGE_DIR : String = "config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/"

  var _secret : String
  var _installer : Installer
  var _control : PcControl
  var _pm : ProductModelClient
  var _readyTimeoutMs : long
  var _pollMs : long
  var _progressMs : long
  var _alwaysRestart : boolean

  construct(secret : String, installer : Installer, control : PcControl, pm : ProductModelClient,
            readyTimeoutMs : long, pollMs : long, progressMs : long, alwaysRestart : boolean) {
    _secret = secret
    _installer = installer
    _control = control
    _pm = pm
    _readyTimeoutMs = readyTimeoutMs
    _pollMs = pollMs
    _progressMs = progressMs
    _alwaysRestart = alwaysRestart
  }

  /** Returns true when PolicyCenter confirmed the product. expectedRunId (from the backend) must match the manifest. */
  function process(zip : byte[], expectedRunId : String, label : String, reporter : Reporter) : boolean {
    var pkg : VerifiedPackage
    try {
      pkg = PackageVerifier.verify(zip, _secret)
      if (expectedRunId != null and expectedRunId != pkg.Manifest.RunId) {
        throw new PackageRejected("package belongs to run " + pkg.Manifest.RunId + ", not " + expectedRunId)
      }
    } catch (e : PackageRejected) {
      reporter.report("failed", "Tampered package refused: " + e.Message + ". Nothing was written to PolicyCenter.")
      return false
    }

    try {
      reporter.report("write", "Package verified (signature, gate token, " + pkg.Files.size() + " file hashes). Writing into modules/configuration")
      var result = _installer.install(pkg, label)
      reporter.report("write", result.Changed.Empty
          ? "All files already match this package; nothing changed (backup: " + result.BackupDir.Name + ")"
          : "Wrote " + result.Changed.size() + " changed file(s); previous versions backed up in " + result.BackupDir.Name)

      var elapsed = restartIfNeeded(!result.Changed.Empty, reporter)
      reporter.report("ready", elapsed < 0 ? "PolicyCenter already running; no restart needed" : "PolicyCenter is up after " + mmss(elapsed))

      var missing = new ArrayList<String>()
      var codes = codesToConfirm(pkg.Manifest, pkg)
      for (c in codes) {
        var parts = c.split(":")
        if (!_pm.exists(parts[1], parts[0])) missing.add(parts[1])
      }
      if (!missing.Empty) {
        reporter.report("failed", "ProductModelAPI does not know: " + missing.join(", "))
        return false
      }
      reporter.report("verified", "ProductModelAPI confirmed " + codes.size() + " codes (SMCyber, "
          + pkg.Files.keySet().where(\ p -> p.startsWith(COVERAGE_DIR) and !p.endsWith("-lookups.xml")).size() + " coverages, "
          + pkg.Manifest.TermRanges.size() + " capped cov terms)" + capsSummary(pkg.Manifest))
      return true
    } catch (e : Exception) {
      reporter.report("failed", String.valueOf(e.Message))
      return false
    }
  }

  /** Restarts PolicyCenter when files changed (or when it is down). Returns elapsed ms, or -1 when not restarted. */
  private function restartIfNeeded(changed : boolean, reporter : Reporter) : long {
    if (!changed and !_alwaysRestart and _pm.isUp()) {
      reporter.report("restart", "No file changed and PolicyCenter is running; restart skipped")
      return -1
    }
    reporter.report("restart", "Stopping PolicyCenter")
    _control.stop()
    reporter.report("restart", "Starting PolicyCenter (a values-only change takes about 4 minutes)")
    _control.start()
    var t0 = System.currentTimeMillis()
    var lastProgress = t0
    while (true) {
      Thread.sleep(_pollMs)
      var now = System.currentTimeMillis()
      if (_pm.isUp()) return now - t0
      if (!_control.startedProcessAlive()) {
        throw new IllegalStateException("PolicyCenter stopped during start-up; see " + _control.LogHint)
      }
      if (now - t0 > _readyTimeoutMs) {
        throw new IllegalStateException("PolicyCenter not ready after " + mmss(now - t0) + "; see " + _control.LogHint)
      }
      if (now - lastProgress >= _progressMs) {
        reporter.report("restart", "PolicyCenter restarting · " + mmss(now - t0))
        lastProgress = now
      }
    }
  }

  /** "TYPE:code" for the product, each installed coverage pattern and each capped cov term. */
  static function codesToConfirm(m : PcManifest, pkg : VerifiedPackage) : java.util.List<String> {
    var codes = new LinkedHashSet<String>()
    codes.add("PRODUCT:" + m.ProductCode)
    for (p in pkg.Files.keySet()) {
      if (p.startsWith(COVERAGE_DIR) and !p.endsWith("-lookups.xml") and p.endsWith(".xml")) {
        codes.add("CLAUSEPATTERN:" + p.substring(COVERAGE_DIR.length(), p.length() - 4))
      }
    }
    for (r in m.TermRanges) {
      codes.add("COVTERMPATTERN:" + r.TermCode)
    }
    return new ArrayList<String>(codes)
  }

  private static function capsSummary(m : PcManifest) : String {
    var caps = m.TermRanges.where(\ r -> r.RuleCode == "CYB-RNG-002")
    if (caps.Empty) return ""
    var r = caps.first()
    return ". " + r.TermCode + " capped at " + r.Max.toPlainString() + " (" + r.RuleCode + ")"
  }

  static function mmss(ms : long) : String {
    var s = ms / 1000
    return (s / 60) + "m " + (s % 60) + "s"
  }
}
