package provenpath.pcexport

uses java.io.ByteArrayOutputStream
uses java.io.File
uses java.math.BigDecimal
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.time.Instant
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.TreeMap
uses java.util.regex.Matcher
uses java.util.regex.Pattern
uses java.util.zip.ZipEntry
uses java.util.zip.ZipOutputStream
uses provenpath.contracts.Clause
uses provenpath.contracts.Json
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PackageBuilderPort
uses provenpath.contracts.PcFile
uses provenpath.contracts.PcManifest
uses provenpath.contracts.PcPackage
uses provenpath.contracts.PcTermRange
uses provenpath.contracts.Proposal
uses provenpath.contracts.Signing
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus

/**
 * Turns an approved, PASSED proposal into a PolicyCenter overlay package (Track B).
 *
 * Starts from policycenter/overlay-template (the SMCyber v0 set that is installed on the VM) and fills it from
 * the verified proposal: each coverage pattern's existence, and each cov term's minVal/maxVal from the RANGE and
 * CONSISTENCY rules that PASSED. PolicyCenter then enforces the verified caps natively
 * (CovTermDirectInputSetHelper.validate), so a quote above the cap is refused inside PolicyCenter too.
 *
 * Only product-model XML, the marked display-name block and the one-line PCF edit are ever packaged; clauses
 * that have no pattern in the overlay (exclusions, rating, extra coverages) are listed in provenpath-report.json.
 * The manifest is HMAC-signed with PROVENPATH_GATE_SECRET so the PC agent can refuse any altered package.
 */
class PackageBuilder implements PackageBuilderPort {

  public static final var PRODUCT_CODE : String = "SMCyber"
  public static final var PRODUCT_DIR : String = "config/resources/productmodel/products/SMCyber/"
  public static final var COVERAGE_DIR : String = "config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/"
  public static final var FRAGMENT : String = "config/locale/productmodel.display.properties.smcyber-fragment"
  public static final var PC_EDITS : String = "pc-edits.json"
  public static final var REPORT : String = "provenpath-report.json"
  /** Fixed zip entry time so identical content gives an identical zip. */
  static final var ZIP_TIME : long = 315532800000L
  static final var EXISTENCE : List<String> = {"Required", "Suggested", "Electable"}

  var _templateDir : File
  var _secret : String

  /** No-arg constructor: the backend loads this by class name (PACKAGE_BUILDER_CLASS). */
  construct() {
    this(resolveTemplateDir(), null)
  }

  construct(templateDir : File, secret : String) {
    _templateDir = templateDir
    _secret = secret
  }

  override function build(proposal : Proposal, verdict : Verdict, reviewId : String, reviewer : String) : PcPackage {
    if (verdict == null or verdict.Status != VerdictStatus.PASSED or verdict.GateToken == null) {
      throw new IllegalStateException("refusing to package: the verdict is not PASSED with a gate token")
    }
    if (!new File(_templateDir, PRODUCT_DIR + PRODUCT_CODE + ".xml").File) {
      throw new IllegalStateException("overlay template not found at " + _templateDir.AbsolutePath + " (set PROVENPATH_PC_TEMPLATE_DIR)")
    }

    var files = new TreeMap<String, byte[]>()
    var ranges = new ArrayList<PcTermRange>()
    var installed = new ArrayList<Map<String, Object>>()
    var templateOnly = new ArrayList<String>()

    files.put(PRODUCT_DIR + "SMCyber.xml", read(PRODUCT_DIR + "SMCyber.xml"))
    files.put(PRODUCT_DIR + "SMCyber-lookups.xml", read(PRODUCT_DIR + "SMCyber-lookups.xml"))

    var covFiles = new File(_templateDir, COVERAGE_DIR).listFiles()
        .where(\ f -> f.Name.endsWith(".xml") and !f.Name.endsWith("-lookups.xml"))
        .orderBy(\ f -> f.Name)
    for (f in covFiles) {
      var code = f.Name.substring(0, f.Name.length() - 4)
      var clause = proposal.Clauses?.firstWhere(\ c -> c.PatternCode == code)
      if (clause == null) {
        templateOnly.add(code)
        continue
      }
      var xml = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)
      if (clause.Existence != null and EXISTENCE.contains(clause.Existence)) {
        xml = setRootAttr(xml, "CoveragePattern", "existence", clause.Existence)
      }
      for (r in termRangesFor(code, proposal, verdict)) {
        xml = setTermLimits(xml, r.TermCode, r.Min.toPlainString(), r.Max.toPlainString())
        ranges.add(r)
      }
      files.put(COVERAGE_DIR + f.Name, xml.getBytes(StandardCharsets.UTF_8))
      files.put(COVERAGE_DIR + code + "-lookups.xml", read(COVERAGE_DIR + code + "-lookups.xml"))
      installed.add(map({"patternCode" -> code, "clauseId" -> clause.ClauseId, "existence" -> clause.Existence,
          "limitMaxInr" -> clause.LimitMaxInr, "deductibleInr" -> clause.DeductibleInr, "waitingHours" -> clause.WaitingHours}))
    }
    if (installed.Empty) {
      throw new IllegalStateException("the proposal contains none of the overlay's coverage patterns; nothing to install")
    }

    files.put(FRAGMENT, read(FRAGMENT))
    files.put(PC_EDITS, read(PC_EDITS))

    var installedCodes = installed.map(\ m -> m.get("patternCode") as String)
    var notInPc = new ArrayList<Map<String, Object>>()
    for (c in proposal.Clauses ?: new ArrayList<Clause>()) {
      if (!installedCodes.contains(c.PatternCode)) {
        notInPc.add(map({"patternCode" -> c.PatternCode, "clauseId" -> c.ClauseId, "kind" -> c.Kind?.name(),
            "reason" -> "no PolicyCenter pattern for it in the SMCyber overlay; verified by the gate, not installed"}))
      }
    }
    var report = map({
        "productCode" -> PRODUCT_CODE, "proposalId" -> proposal.ProposalId, "iteration" -> proposal.Iteration,
        "aggregateLimitInr" -> proposal.AggregateLimitInr, "installedCoverages" -> installed,
        "notInPolicyCenter" -> notInPc, "templateCoveragesNotInProposal" -> templateOnly,
        "currency" -> "PolicyCenter 10 has no INR currency: INR amounts are carried in the usd cov term limits"})
    files.put(REPORT, Json.toJson(report).getBytes(StandardCharsets.UTF_8))

    var m = new PcManifest()
    m.ProductCode = PRODUCT_CODE
    m.Files = files.entrySet().map(\ e -> new PcFile(e.Key, Signing.sha256Hex(e.Value))).toList()
    m.VerdictHash = verdict.VerdictHash
    m.GateToken = verdict.GateToken
    m.RunId = verdict.RunId
    m.ProposalHash = verdict.ProposalHash
    m.RulesetHash = verdict.RulesetHash
    m.ReviewId = reviewId
    m.Reviewer = reviewer
    m.TermRanges = ranges
    m.GeneratedAt = Instant.now().toString()
    Signing.sign(m, _secret ?: Signing.secretFromEnv())

    return new PcPackage(m, zip(files, Json.toJson(m).getBytes(StandardCharsets.UTF_8)))
  }

  /**
   * The verified range for each PolicyCenter cov term, mirroring the rule YAMLs. A range is only emitted when
   * every result of its rule PASSED in this verdict. Deductible caps are 10% of the coverage's limit cap
   * because PolicyCenter validates each term on its own.
   */
  static function termRangesFor(code : String, p : Proposal, v : Verdict) : List<PcTermRange> {
    var agg = BigDecimal.valueOf(p.AggregateLimitInr)
    var half = floor(agg.multiply(new BigDecimal("0.5")))
    var ranges = new ArrayList<PcTermRange>()
    switch (code) {
      case "SMCyberExtortionCov":
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberExtortionLimit", BigDecimal.ZERO, half, "CYB-RNG-002"))
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberExtortionDeductible", BigDecimal.ZERO, floor(half.multiply(new BigDecimal("0.10"))), "CYB-RNG-003"))
        break
      case "SMCyberDataBreachCov":
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberDataBreachLimit", BigDecimal.ZERO, agg, "CYB-CON-001"))
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberDataBreachDeductible", BigDecimal.ZERO, floor(agg.multiply(new BigDecimal("0.10"))), "CYB-RNG-003"))
        break
      case "SMCyberBusinessInterruptionCov":
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberBILimit", BigDecimal.ZERO, agg, "CYB-CON-001"))
        addIfPassed(ranges, v, new PcTermRange(code, "SMCyberBIWaitingHours", BigDecimal.valueOf(8), BigDecimal.valueOf(72), "CYB-RNG-004"))
        break
    }
    return ranges
  }

  private static function addIfPassed(target : List<PcTermRange>, v : Verdict, r : PcTermRange) {
    var results = v.Nodes?.where(\ n -> n.RuleCode == r.RuleCode)
    if (results != null and !results.Empty and results.allMatch(\ n -> n.Result == NodeStatus.PASSED)) {
      target.add(r)
    }
  }

  private static function floor(x : BigDecimal) : BigDecimal {
    return x.setScale(0, java.math.RoundingMode.FLOOR)
  }

  /** Sets an attribute on the first <tag ...> element, keeping the whitespace in front of it. */
  static function setRootAttr(xml : String, tag : String, name : String, value : String) : String {
    var start = xml.indexOf("<" + tag)
    if (start < 0) throw new IllegalStateException("template has no <" + tag + ">")
    var end = xml.indexOf(">", start) + 1
    return xml.substring(0, start) + setAttr(xml.substring(start, end), name, value) + xml.substring(end)
  }

  /** Sets minVal/maxVal on the CovTermLimits of the DirectCovTermPattern whose codeIdentifier is termCode. */
  static function setTermLimits(xml : String, termCode : String, min : String, max : String) : String {
    var at = xml.indexOf("codeIdentifier=\"" + termCode + "\"")
    var blockEnd = at < 0 ? -1 : xml.indexOf("</DirectCovTermPattern>", at)
    var limits = blockEnd < 0 ? -1 : xml.indexOf("<CovTermLimits", at)
    if (limits < 0 or limits > blockEnd) {
      throw new IllegalStateException("template has no CovTermLimits for cov term " + termCode)
    }
    var end = xml.indexOf("/>", limits) + 2
    var tag = setAttr(setAttr(xml.substring(limits, end), "maxVal", max), "minVal", min)
    return xml.substring(0, limits) + tag + xml.substring(end)
  }

  static function setAttr(tag : String, name : String, value : String) : String {
    var m = Pattern.compile("(\\s+)" + name + "=\"[^\"]*\"").matcher(tag)
    if (m.find()) {
      return tag.substring(0, m.start()) + m.group(1) + name + "=\"" + value + "\"" + tag.substring(m.end())
    }
    var close = tag.endsWith("/>") ? tag.length() - 2 : tag.length() - 1
    return tag.substring(0, close) + " " + name + "=\"" + value + "\"" + tag.substring(close)
  }

  private function read(rel : String) : byte[] {
    var f = new File(_templateDir, rel)
    if (!f.File) throw new IllegalStateException("overlay template file missing: " + rel)
    return Files.readAllBytes(f.toPath())
  }

  private static function zip(files : Map<String, byte[]>, manifest : byte[]) : byte[] {
    var bos = new ByteArrayOutputStream()
    using (var zos = new ZipOutputStream(bos)) {
      for (e in files.entrySet()) {
        putEntry(zos, e.Key, e.Value)
      }
      putEntry(zos, Signing.MANIFEST_ENTRY, manifest)
    }
    return bos.toByteArray()
  }

  private static function putEntry(zos : ZipOutputStream, name : String, bytes : byte[]) {
    var entry = new ZipEntry(name)
    entry.setTime(ZIP_TIME)
    zos.putNextEntry(entry)
    zos.write(bytes)
    zos.closeEntry()
  }

  private static function map(kv : Map<String, Object>) : Map<String, Object> {
    return new LinkedHashMap<String, Object>(kv)
  }

  /** PROVENPATH_PC_TEMPLATE_DIR, else policycenter/overlay-template next to the rules dir or the working dir. */
  static function resolveTemplateDir() : File {
    var fromEnv = System.getenv("PROVENPATH_PC_TEMPLATE_DIR")
    if (fromEnv != null and !fromEnv.trim().Empty) return new File(fromEnv.trim())
    var candidates = new ArrayList<File>()
    var rules = System.getenv("PROVENPATH_RULES_DIR")
    if (rules != null and !rules.Empty) candidates.add(new File(new File(rules).AbsoluteFile.ParentFile, "policycenter/overlay-template"))
    for (prefix in {"", "../", "../../", "../../../"}) {
      candidates.add(new File(prefix + "policycenter/overlay-template"))
    }
    return candidates.firstWhere(\ f -> f.Directory) ?: candidates.first()
  }
}
