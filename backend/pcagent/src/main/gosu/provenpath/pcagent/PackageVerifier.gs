package provenpath.pcagent

uses java.io.ByteArrayInputStream
uses java.nio.charset.StandardCharsets
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.zip.ZipInputStream
uses provenpath.contracts.Json
uses provenpath.contracts.PcManifest
uses provenpath.contracts.Signing

/**
 * Re-checks a package on the PolicyCenter side before anything is written. A package is accepted only if:
 *   - the manifest HMAC verifies with the shared gate secret (no field was changed after the backend built it),
 *   - the gate token recomputes from runId|proposalHash|rulesetHash (it came from a PASSED gate run),
 *   - every file matches its manifest sha256 and there is no file the manifest does not list, and
 *   - every path is a relative product-model path (no traversal, no code, no other PolicyCenter config).
 */
class PackageVerifier {

  public static final var FRAGMENT : String = "config/locale/productmodel.display.properties.smcyber-fragment"
  public static final var PC_EDITS : String = "pc-edits.json"
  public static final var REPORT : String = "provenpath-report.json"
  static final var PRODUCT_MODEL : String = "config/resources/productmodel/"
  static final var MAX_ENTRIES : int = 200
  static final var MAX_BYTES : long = 20L * 1024 * 1024

  static function verify(zipBytes : byte[], secret : String) : VerifiedPackage {
    var entries = unzip(zipBytes)
    var manifestBytes = entries.remove(Signing.MANIFEST_ENTRY)
    if (manifestBytes == null) throw new PackageRejected("no " + Signing.MANIFEST_ENTRY + " in the package")
    var m : PcManifest
    try {
      m = Json.parse(new String(manifestBytes, StandardCharsets.UTF_8), PcManifest)
    } catch (e : Exception) {
      throw new PackageRejected("manifest is not valid JSON")
    }
    if (!Signing.verifySignature(m, secret)) {
      throw new PackageRejected("manifest signature does not verify")
    }
    if (m.RunId == null or !Signing.constantTimeEquals(m.GateToken, Signing.gateToken(m.RunId, m.ProposalHash, m.RulesetHash, secret))) {
      throw new PackageRejected("gate token does not verify")
    }
    if (m.ProductCode != "SMCyber") {
      throw new PackageRejected("unexpected product " + m.ProductCode)
    }
    var listed = new LinkedHashMap<String, byte[]>()
    for (f in m.Files ?: new java.util.ArrayList<provenpath.contracts.PcFile>()) {
      checkPath(f.Path)
      var bytes = entries.remove(f.Path)
      if (bytes == null) throw new PackageRejected("file listed in the manifest is missing: " + f.Path)
      if (!Signing.constantTimeEquals(f.Sha256, Signing.sha256Hex(bytes))) {
        throw new PackageRejected("sha256 mismatch for " + f.Path)
      }
      listed.put(f.Path, bytes)
    }
    if (!entries.Empty) {
      throw new PackageRejected("file not listed in the manifest: " + entries.keySet().first())
    }
    return new VerifiedPackage(m, listed)
  }

  static function checkPath(path : String) {
    var ok = path != null and !path.contains("..") and !path.contains("\\") and !path.contains(":")
        and !path.startsWith("/") and (path.startsWith(PRODUCT_MODEL) or path == FRAGMENT or path == PC_EDITS or path == REPORT)
    if (!ok) throw new PackageRejected("path not allowed in a ProvenPath package: " + path)
  }

  private static function unzip(bytes : byte[]) : Map<String, byte[]> {
    var result = new LinkedHashMap<String, byte[]>()
    var total = 0L
    try {
      using (var zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
        var e = zis.NextEntry
        while (e != null) {
          if (e.Directory) {
            e = zis.NextEntry
            continue
          }
          if (result.containsKey(e.Name)) throw new PackageRejected("duplicate entry " + e.Name)
          var data = zis.readAllBytes()
          total += data.length
          if (result.size() >= MAX_ENTRIES or total > MAX_BYTES) throw new PackageRejected("package too large")
          result.put(e.Name, data)
          e = zis.NextEntry
        }
      }
    } catch (e : PackageRejected) {
      throw e
    } catch (e : Exception) {
      throw new PackageRejected("not a valid zip: " + e.Message)
    }
    if (result.Empty) throw new PackageRejected("empty package")
    return result
  }
}

