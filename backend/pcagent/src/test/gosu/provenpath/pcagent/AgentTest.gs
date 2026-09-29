package provenpath.pcagent

uses com.sun.net.httpserver.HttpExchange
uses com.sun.net.httpserver.HttpServer
uses java.io.ByteArrayInputStream
uses java.io.ByteArrayOutputStream
uses java.io.File
uses java.net.InetSocketAddress
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.regex.Pattern
uses java.util.zip.ZipEntry
uses java.util.zip.ZipInputStream
uses java.util.zip.ZipOutputStream
uses org.junit.jupiter.api.AfterEach
uses org.junit.jupiter.api.Assertions
uses org.junit.jupiter.api.BeforeEach
uses org.junit.jupiter.api.Test
uses provenpath.contracts.Json
uses provenpath.contracts.Layer
uses provenpath.contracts.NodeResult
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PcFile
uses provenpath.contracts.PcManifest
uses provenpath.contracts.Proposal
uses provenpath.contracts.Signing
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.pcexport.PackageBuilder

/**
 * The whole agent loop on a laptop: PC_HOME is a temp folder shaped like PolicyCenter's, "restart" flips a flag,
 * and a local HTTP responder answers ProductModelAPI only while "running", and only for codes that are really
 * present in the installed files. Test configuration for the loop, not a PolicyCenter stand-in in the product.
 */
class AgentTest {

  static final var SECRET : String = "agent-test-secret"
  static final var PCF : String = "modules/configuration/config/web/pcf/line/gl/job/LineWizardStepSet.GeneralLiability.pcf"
  static final var DISPLAY : String = "modules/configuration/config/locale/productmodel.display.properties"

  var _pcHome : File
  var _backup : File
  var _server : HttpServer
  var _pc : TestPc
  var _steps : List<String>

  @BeforeEach
  function setUp() {
    _pcHome = Files.createTempDirectory("pchome").toFile()
    _backup = Files.createTempDirectory("pcbackup").toFile()
    write(DISPLAY, "Existing.Key = Existing value\r\nOther.Key = x\r\n")
    write(PCF, "<?xml version=\"1.0\"?>\r\n<PCF>\r\n  <WizardStepSet\r\n    id=\"LineWizardStepSet\"\r\n    mode=\"GeneralLiability\">\r\n  </WizardStepSet>\r\n</PCF>\r\n")
    _pc = new TestPc()
    _server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)
    _server.createContext("/", \ ex -> answer(ex))
    _server.start()
    _steps = new ArrayList<String>()
  }

  @AfterEach
  function tearDown() {
    _server.stop(0)
  }

  // ---- tests

  @Test
  function installsRestartsAndConfirms() {
    var ok = agent(60000).process(demoZip(SECRET), "run-agent-1", "dep-1", reporter())
    Assertions.assertTrue(ok, String.valueOf(_steps))
    Assertions.assertEquals({"write", "write", "restart", "restart", "ready", "verified"}, stepNames())
    Assertions.assertEquals(1, _pc.Stops)
    var ext = read("modules/configuration/config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov.xml")
    Assertions.assertTrue(ext.contains("maxVal=\"2500000\""))
    var display = read(DISPLAY)
    Assertions.assertTrue(display.startsWith("Existing.Key = Existing value\r\nOther.Key = x\r\n"), "existing keys kept")
    Assertions.assertEquals(1, count(display, "# >>> ProvenPath SMCyber >>>"))
    Assertions.assertTrue(display.contains("Product_SMCyber.Name = SME Cyber Insurance\r\n"), "CRLF kept")
    Assertions.assertTrue(read(PCF).contains("mode=\"GeneralLiability|SMCyber\""))
    Assertions.assertTrue(_steps.last().contains("SMCyberExtortionLimit capped at 2500000 (CYB-RNG-002)"), _steps.last())
    // the previous display file is in the backup
    Assertions.assertTrue(_backup.listFiles().first().toPath().resolve("before/" + DISPLAY).toFile().File)
  }

  @Test
  function sameProductAgainChangesNothingAndSkipsTheRestart() {
    Assertions.assertTrue(agent(60000).process(demoZip(SECRET), null, "dep-1", reporter()))
    _steps.clear()
    Assertions.assertTrue(agent(60000).process(demoZip(SECRET), null, "dep-2", reporter()), String.valueOf(_steps))
    Assertions.assertEquals(1, _pc.Stops, "no second restart")
    Assertions.assertTrue(_steps.hasMatch(\ s -> s.contains("restart skipped")))
    Assertions.assertEquals(1, count(read(DISPLAY), "# >>> ProvenPath SMCyber >>>"), "block not duplicated")
    Assertions.assertEquals(1, count(read(PCF), "GeneralLiability|SMCyber"), "PCF edit is idempotent")
  }

  @Test
  function aChangedFileIsRefusedAndNothingIsWritten() {
    var entries = unzip(demoZip(SECRET))
    var path = "config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov.xml"
    entries.put(path, new String(entries.get(path), StandardCharsets.UTF_8).replace("maxVal=\"2500000\"", "maxVal=\"4000000\"").getBytes(StandardCharsets.UTF_8))
    Assertions.assertFalse(agent(60000).process(zip(entries), null, "dep-t", reporter()))
    Assertions.assertTrue(_steps.single().startsWith("failed: Tampered package refused: sha256 mismatch"), String.valueOf(_steps))
    Assertions.assertFalse(new File(_pcHome, "modules/configuration/config/resources/productmodel").exists(), "nothing written")
    Assertions.assertFalse(read(PCF).contains("SMCyber"))
    Assertions.assertEquals(0, _pc.Stops)
  }

  @Test
  function anEditedManifestOrAnotherSecretIsRefused() {
    // a manifest re-written to raise a cap no longer matches its HMAC
    var entries = unzip(demoZip(SECRET))
    var m = Json.parse(new String(entries.get(Signing.MANIFEST_ENTRY), StandardCharsets.UTF_8), PcManifest)
    m.TermRanges.first().Max = new java.math.BigDecimal("4000000")
    entries.put(Signing.MANIFEST_ENTRY, Json.toJson(m).getBytes(StandardCharsets.UTF_8))
    Assertions.assertFalse(agent(60000).process(zip(entries), null, "dep-m", reporter()))
    Assertions.assertTrue(_steps.single().contains("manifest signature does not verify"), String.valueOf(_steps))

    _steps.clear()
    Assertions.assertFalse(agent(60000).process(demoZip("some-other-secret"), null, "dep-s", reporter()))
    Assertions.assertTrue(_steps.single().contains("manifest signature does not verify"))
  }

  @Test
  function pathsOutsideTheProductModelAreRefusedEvenWhenSigned() {
    var entries = new LinkedHashMap<String, byte[]>()
    var evil = "../../Windows/evil.gs".getBytes(StandardCharsets.UTF_8)
    var m = signedManifest({"../../Windows/evil.gs" -> evil})
    entries.put("../../Windows/evil.gs", evil)
    entries.put(Signing.MANIFEST_ENTRY, Json.toJson(m).getBytes(StandardCharsets.UTF_8))
    Assertions.assertFalse(agent(60000).process(zip(entries), null, "dep-p", reporter()))
    Assertions.assertTrue(_steps.single().contains("path not allowed"), String.valueOf(_steps))

    _steps.clear()
    var gsrc = "config/gsrc/provenpath/Backdoor.gs".getBytes(StandardCharsets.UTF_8)
    entries = new LinkedHashMap<String, byte[]>()
    entries.put("config/gsrc/provenpath/Backdoor.gs", gsrc)
    entries.put(Signing.MANIFEST_ENTRY, Json.toJson(signedManifest({"config/gsrc/provenpath/Backdoor.gs" -> gsrc})).getBytes(StandardCharsets.UTF_8))
    Assertions.assertFalse(agent(60000).process(zip(entries), null, "dep-g", reporter()))
    Assertions.assertTrue(_steps.single().contains("path not allowed"))
  }

  @Test
  function aPackageForAnotherRunIsRefused() {
    Assertions.assertFalse(agent(60000).process(demoZip(SECRET), "some-other-run", "dep-r", reporter()))
    Assertions.assertTrue(_steps.single().contains("belongs to run"))
  }

  @Test
  function policyCenterThatNeverComesUpIsReportedAsFailed() {
    _pc.StartsServer = false
    Assertions.assertFalse(agent(400).process(demoZip(SECRET), null, "dep-down", reporter()))
    Assertions.assertTrue(_steps.last().startsWith("failed: PolicyCenter not ready"), _steps.last())
  }

  @Test
  function mergeReplacesTheMarkedBlockInPlace() {
    var current = "A = 1\n# >>> ProvenPath SMCyber >>>\nold = 1\n# <<< ProvenPath SMCyber <<<\nB = 2\n"
    var merged = Installer.mergeFragment(current, "# >>> ProvenPath SMCyber >>>\nnew = 2\n# <<< ProvenPath SMCyber <<<\n")
    Assertions.assertEquals("A = 1\n# >>> ProvenPath SMCyber >>>\nnew = 2\n# <<< ProvenPath SMCyber <<<\nB = 2\n", merged)
  }

  // ---- helpers

  function agent(readyTimeoutMs : long) : Agent {
    var pm = new ProductModelClient("http://127.0.0.1:" + _server.Address.Port + "/pc", "su", "gw")
    return new Agent(SECRET, new Installer(_pcHome, _backup), _pc, pm, readyTimeoutMs, 50, 100000, false)
  }

  function reporter() : Reporter {
    return \ step, detail -> _steps.add(step + ": " + detail)
  }

  function stepNames() : List<String> {
    return _steps.map(\ s -> s.substring(0, s.indexOf(":")))
  }

  static function demoZip(secret : String) : byte[] {
    var f = new File(System.getenv("PROVENPATH_FIXTURES_DIR"), "proposal_demo_fixed.json")
    var proposal = Json.parse(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8), Proposal)
    var v = new Verdict()
    v.RunId = "run-agent-1"
    v.ProposalHash = "ph"
    v.RulesetHash = "rh"
    v.VerdictHash = "vh"
    v.Status = VerdictStatus.PASSED
    v.GateToken = Signing.gateToken(v.RunId, v.ProposalHash, v.RulesetHash, secret)
    v.Nodes = new ArrayList<NodeResult>()
    for (code in {"CYB-RNG-002", "CYB-RNG-003", "CYB-RNG-004", "CYB-CON-001"}) {
      var n = new NodeResult()
      n.RuleCode = code
      n.Layer = Layer.RANGE
      n.Result = NodeStatus.PASSED
      v.Nodes.add(n)
    }
    return new PackageBuilder(new File(System.getenv("PROVENPATH_PC_TEMPLATE_DIR")), secret).build(proposal, v, "review-1", "A. Mehta").ZipBytes
  }

  static function signedManifest(files : Map<String, byte[]>) : PcManifest {
    var m = new PcManifest()
    m.ProductCode = "SMCyber"
    m.RunId = "r"
    m.ProposalHash = "p"
    m.RulesetHash = "h"
    m.GateToken = Signing.gateToken("r", "p", "h", SECRET)
    m.Files = files.entrySet().map(\ e -> new PcFile(e.Key, Signing.sha256Hex(e.Value))).toList()
    m.TermRanges = {}
    Signing.sign(m, SECRET)
    return m
  }

  static function unzip(bytes : byte[]) : Map<String, byte[]> {
    var result = new LinkedHashMap<String, byte[]>()
    using (var zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
      var e = zis.NextEntry
      while (e != null) {
        result.put(e.Name, zis.readAllBytes())
        e = zis.NextEntry
      }
    }
    return result
  }

  static function zip(entries : Map<String, byte[]>) : byte[] {
    var bos = new ByteArrayOutputStream()
    using (var zos = new ZipOutputStream(bos)) {
      for (e in entries.entrySet()) {
        zos.putNextEntry(new ZipEntry(e.Key))
        zos.write(e.Value)
        zos.closeEntry()
      }
    }
    return bos.toByteArray()
  }

  function write(rel : String, text : String) {
    var f = new File(_pcHome, rel)
    f.ParentFile.mkdirs()
    Files.write(f.toPath(), text.getBytes(StandardCharsets.UTF_8))
  }

  function read(rel : String) : String {
    return new String(Files.readAllBytes(new File(_pcHome, rel).toPath()), StandardCharsets.UTF_8)
  }

  static function count(s : String, needle : String) : int {
    var n = 0
    var i = s.indexOf(needle)
    while (i >= 0) {
      n++
      i = s.indexOf(needle, i + needle.length())
    }
    return n
  }

  /** ProductModelAPI answers only while "running", and only for codes present in the installed files. */
  function answer(ex : HttpExchange) {
    var status = 503
    var body = "starting"
    if (_pc.Running) {
      var req = new String(ex.RequestBody.readAllBytes(), StandardCharsets.UTF_8)
      var code = between(req, "codeIdentifier>", "</")
      var type = between(req, "productModelType>", "</")
      var known = type == "PRODUCT"
          ? new File(_pcHome, "modules/configuration/config/resources/productmodel/products/" + code + "/" + code + ".xml").File
          : installedText().contains("codeIdentifier=\"" + code + "\"")
      status = 200
      body = "<tns:Envelope xmlns:tns=\"http://schemas.xmlsoap.org/soap/envelope/\"><tns:Body>" +
          "<getPublicIdForCodeIdentifierResponse xmlns=\"" + ProductModelClient.NS + "\">" +
          (known ? "<return>" + code + "</return>" : "") + "</getPublicIdForCodeIdentifierResponse></tns:Body></tns:Envelope>"
    }
    var bytes = body.getBytes(StandardCharsets.UTF_8)
    ex.sendResponseHeaders(status, bytes.length)
    ex.ResponseBody.write(bytes)
    ex.close()
  }

  function installedText() : String {
    var sb = new StringBuilder()
    var dir = new File(_pcHome, "modules/configuration/config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns")
    if (dir.Directory) {
      for (f in dir.listFiles()) sb.append(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8))
    }
    return sb.toString()
  }

  static function between(s : String, a : String, b : String) : String {
    var m = Pattern.compile(Pattern.quote(a) + "(.*?)" + Pattern.quote(b)).matcher(s)
    return m.find() ? m.group(1) : ""
  }

  /** Test PcControl: stop/start flip the "running" flag (start can be told not to come up). */
  static class TestPc implements PcControl {
    public var Running : boolean = true
    public var StartsServer : boolean = true
    public var Stops : int = 0

    override function stop() {
      Stops++
      Running = false
    }

    override function start() {
      Running = StartsServer
    }

    override function startedProcessAlive() : boolean {
      return true
    }

    override property get LogHint() : String {
      return "(test)"
    }
  }
}
