package provenpath.pcexport

uses java.io.ByteArrayInputStream
uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.Map
uses java.util.zip.ZipInputStream
uses javax.xml.parsers.DocumentBuilderFactory
uses org.junit.jupiter.api.Assertions
uses org.junit.jupiter.api.Test
uses org.w3c.dom.Element
uses org.w3c.dom.Node
uses provenpath.contracts.Json
uses provenpath.contracts.Layer
uses provenpath.contracts.NodeResult
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PcManifest
uses provenpath.contracts.Proposal
uses provenpath.contracts.Signing
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus

/** Golden tests: fixtures/proposal_demo_fixed.json → a signed package that matches the installed v0 template. */
class PackageBuilderTest {

  static final var SECRET : String = "pcexport-test-secret"
  static final var COV : String = PackageBuilder.COVERAGE_DIR

  static function templateDir() : File {
    return new File(System.getenv("PROVENPATH_PC_TEMPLATE_DIR"))
  }

  static function demoProposal() : Proposal {
    var f = new File(System.getenv("PROVENPATH_FIXTURES_DIR"), "proposal_demo_fixed.json")
    return Json.parse(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8), Proposal)
  }

  /** A PASSED verdict with one PASSED result per rule, carrying a real gate token for the test secret. */
  static function passedVerdict(failRule : String) : Verdict {
    var v = new Verdict()
    v.RunId = "run-test-1"
    v.ProposalHash = "ph-test"
    v.RulesetHash = "rh-test"
    v.VerdictHash = "vh-test"
    v.Status = failRule == null ? VerdictStatus.PASSED : VerdictStatus.BLOCKED
    v.GateToken = Signing.gateToken(v.RunId, v.ProposalHash, v.RulesetHash, SECRET)
    v.Nodes = new ArrayList<NodeResult>()
    for (code in {"CYB-TYPE-001", "CYB-RNG-001", "CYB-RNG-002", "CYB-RNG-003", "CYB-RNG-004", "CYB-CON-001", "CYB-SRC-002"}) {
      var n = new NodeResult()
      n.RuleCode = code
      n.Layer = Layer.RANGE
      n.Result = code == failRule ? NodeStatus.FAILED : NodeStatus.PASSED
      v.Nodes.add(n)
    }
    return v
  }

  static function unzip(bytes : byte[]) : Map<String, byte[]> {
    var out = new LinkedHashMap<String, byte[]>()
    using (var zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
      var e = zis.NextEntry
      while (e != null) {
        out.put(e.Name, zis.readAllBytes())
        e = zis.NextEntry
      }
    }
    return out
  }

  @Test
  function demoProposalBuildsASignedPackage() {
    var pkg = new PackageBuilder(templateDir(), SECRET).build(demoProposal(), passedVerdict(null), "review-1", "A. Mehta")
    var m = pkg.Manifest
    Assertions.assertTrue(Signing.verifySignature(m, SECRET), "manifest signature")
    Assertions.assertFalse(Signing.verifySignature(m, "another-secret"))
    Assertions.assertEquals(Signing.gateToken(m.RunId, m.ProposalHash, m.RulesetHash, SECRET), m.GateToken)

    var entries = unzip(pkg.ZipBytes)
    // 2 product files + 3 coverages x 2 + fragment + pc-edits + report, plus the manifest
    Assertions.assertEquals(11, m.Files.size())
    Assertions.assertEquals(12, entries.size())
    for (f in m.Files) {
      Assertions.assertEquals(f.Sha256, Signing.sha256Hex(entries.get(f.Path)), f.Path)
    }
    // the manifest inside the zip is the same signed manifest
    var inZip = Json.parse(new String(entries.get(Signing.MANIFEST_ENTRY), StandardCharsets.UTF_8), PcManifest)
    Assertions.assertTrue(Signing.verifySignature(inZip, SECRET), "manifest inside the zip verifies")
  }

  @Test
  function termRangesComeFromTheVerifiedRules() {
    var m = new PackageBuilder(templateDir(), SECRET).build(demoProposal(), passedVerdict(null), "r", "A. Mehta").Manifest
    var byTerm = new LinkedHashMap<String, String>()
    for (r in m.TermRanges) {
      byTerm.put(r.TermCode, r.Min.toPlainString() + ".." + r.Max.toPlainString() + " " + r.RuleCode)
    }
    // aggregate ₹50L: extortion ≤ 50% (CYB-RNG-002), deductible cap 10% of that (CYB-RNG-003), BI waiting 8–72 h (CYB-RNG-004)
    Assertions.assertEquals("0..2500000 CYB-RNG-002", byTerm.get("SMCyberExtortionLimit"))
    Assertions.assertEquals("0..250000 CYB-RNG-003", byTerm.get("SMCyberExtortionDeductible"))
    Assertions.assertEquals("0..5000000 CYB-CON-001", byTerm.get("SMCyberDataBreachLimit"))
    Assertions.assertEquals("0..500000 CYB-RNG-003", byTerm.get("SMCyberDataBreachDeductible"))
    Assertions.assertEquals("0..5000000 CYB-CON-001", byTerm.get("SMCyberBILimit"))
    Assertions.assertEquals("8..72 CYB-RNG-004", byTerm.get("SMCyberBIWaitingHours"))
  }

  /** Structurally equal to the installed v0 template: only existence, minVal and maxVal may differ. */
  @Test
  function coverageXmlStaysStructurallyEqualToTheTemplate() {
    var entries = unzip(new PackageBuilder(templateDir(), SECRET).build(demoProposal(), passedVerdict(null), "r", "x").ZipBytes)
    for (code in {"SMCyberDataBreachCov", "SMCyberExtortionCov", "SMCyberBusinessInterruptionCov"}) {
      var built = parse(entries.get(COV + code + ".xml"))
      var tpl = parse(Files.readAllBytes(new File(templateDir(), COV + code + ".xml").toPath()))
      Assertions.assertEquals(shape(tpl), shape(built), code)
      // lookups and product files are copied unchanged
      Assertions.assertArrayEquals(Files.readAllBytes(new File(templateDir(), COV + code + "-lookups.xml").toPath()), entries.get(COV + code + "-lookups.xml"))
    }
    var ext = new String(entries.get(COV + "SMCyberExtortionCov.xml"), StandardCharsets.UTF_8)
    Assertions.assertTrue(ext.contains("maxVal=\"2500000\""), "extortion cap")
    Assertions.assertTrue(ext.contains("existence=\"Suggested\""), "existence from the verified clause")
    var bi = new String(entries.get(COV + "SMCyberBusinessInterruptionCov.xml"), StandardCharsets.UTF_8)
    Assertions.assertTrue(bi.contains("minVal=\"8\"") and bi.contains("maxVal=\"72\""), "BI waiting hours")
  }

  @Test
  function clausesWithoutAPolicyCenterPatternAreReportedNotInstalled() {
    var entries = unzip(new PackageBuilder(templateDir(), SECRET).build(demoProposal(), passedVerdict(null), "r", "x").ZipBytes)
    var report = Json.MAPPER.readValue(entries.get(PackageBuilder.REPORT), Map) as Map<String, Object>
    var notIn = (report.get("notInPolicyCenter") as java.util.List<Map<String, Object>>).map(\ x -> x.get("patternCode"))
    Assertions.assertTrue(notIn.contains("SMCyberPrivacyLiabilityCov"))
    Assertions.assertTrue(notIn.contains("SMCyberWarExcl"))
    Assertions.assertEquals(3, (report.get("installedCoverages") as java.util.List<Object>).size())
  }

  @Test
  function aBlockedVerdictNeverBecomesAPackage() {
    Assertions.assertThrows(IllegalStateException, \ -> {
      new PackageBuilder(templateDir(), SECRET).build(demoProposal(), passedVerdict("CYB-RNG-002"), "r", "x")
    })
  }

  @Test
  function aFailedRuleDropsItsTermRange() {
    var v = passedVerdict(null)
    v.Nodes.firstWhere(\ n -> n.RuleCode == "CYB-RNG-004").Result = NodeStatus.SKIPPED
    var m = new PackageBuilder(templateDir(), SECRET).build(demoProposal(), v, "r", "x").Manifest
    Assertions.assertFalse(m.TermRanges.hasMatch(\ r -> r.TermCode == "SMCyberBIWaitingHours"))
  }

  @Test
  function identicalInputGivesIdenticalFiles() {
    var b = new PackageBuilder(templateDir(), SECRET)
    var a1 = b.build(demoProposal(), passedVerdict(null), "r", "x").Manifest.Files.map(\ f -> f.Path + f.Sha256)
    var a2 = b.build(demoProposal(), passedVerdict(null), "r", "x").Manifest.Files.map(\ f -> f.Path + f.Sha256)
    Assertions.assertEquals(a1, a2)
  }

  private static function parse(bytes : byte[]) : Element {
    return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(bytes)).DocumentElement
  }

  /** Element tree with attributes, ignoring the values the builder is allowed to set. */
  private static function shape(e : Element) : String {
    var sb = new StringBuilder("<" + e.TagName)
    var attrs = e.Attributes
    var names = new ArrayList<String>()
    for (i in 0..|attrs.Length) {
      names.add(attrs.item(i).NodeName)
    }
    for (n in names.orderBy(\ x -> x).where(\ x -> x != "existence" and x != "minVal" and x != "maxVal")) {
      sb.append(" ").append(n).append("=").append(e.getAttribute(n))
    }
    sb.append(">")
    var kids = e.ChildNodes
    for (i in 0..|kids.Length) {
      var k = kids.item(i)
      if (k.NodeType == Node.ELEMENT_NODE) {
        sb.append(shape(k as Element))
      } else if (k.NodeType == Node.CDATA_SECTION_NODE) {
        sb.append(k.NodeValue.trim())
      }
    }
    return sb.append("</").append(e.TagName).append(">").toString()
  }
}
