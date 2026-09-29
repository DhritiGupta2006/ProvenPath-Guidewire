package provenpath.contracts

uses java.nio.charset.StandardCharsets
uses java.security.MessageDigest
uses javax.crypto.Mac
uses javax.crypto.spec.SecretKeySpec

/**
 * HMAC helpers shared by the package builder (:pcexport), the backend and the PC agent (:pcagent), so the
 * agent can check a package with nothing but the shared PROVENPATH_GATE_SECRET.
 * The gate token format matches provenpath.core.gate.GateToken: HMAC-SHA256(runId|proposalHash|rulesetHash).
 */
class Signing {

  public static final var MANIFEST_ENTRY : String = "provenpath-manifest.json"

  /** The gate secret from the environment; tests (-Dprovenpath.test=true) get the same default as GateToken. */
  static function secretFromEnv() : String {
    var secret = System.getenv("PROVENPATH_GATE_SECRET")
    if (secret != null and !secret.Empty) {
      return secret
    }
    if (System.getProperty("provenpath.test", "false") == "true" or System.getenv("PROVENPATH_TEST") != null) {
      return "test-secret-for-dev-only"
    }
    throw new IllegalStateException("PROVENPATH_GATE_SECRET environment variable not set")
  }

  static function gateToken(runId : String, proposalHash : String, rulesetHash : String, secret : String) : String {
    return hmacSha256Hex(runId + "|" + proposalHash + "|" + rulesetHash, secret)
  }

  /** HMAC over the canonical manifest JSON with Signature left out. */
  static function manifestSignature(m : PcManifest, secret : String) : String {
    var saved = m.Signature
    m.Signature = null
    try {
      return hmacSha256Hex(Json.canonical(m), secret)
    } finally {
      m.Signature = saved
    }
  }

  static function sign(m : PcManifest, secret : String) {
    m.Signature = manifestSignature(m, secret)
  }

  static function verifySignature(m : PcManifest, secret : String) : boolean {
    return m.Signature != null and constantTimeEquals(m.Signature, manifestSignature(m, secret))
  }

  static function hmacSha256Hex(data : String, secret : String) : String {
    var mac = Mac.getInstance("HmacSHA256")
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
    return hex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)))
  }

  static function sha256Hex(bytes : byte[]) : String {
    return hex(MessageDigest.getInstance("SHA-256").digest(bytes))
  }

  static function constantTimeEquals(a : String, b : String) : boolean {
    if (a == null or b == null) return false
    return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8))
  }

  private static function hex(bytes : byte[]) : String {
    var sb = new StringBuilder()
    for (b in bytes) {
      sb.append(Integer.toHexString((b & 0xFF) | 0x100).substring(1))
    }
    return sb.toString()
  }
}
