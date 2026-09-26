package provenpath.core.gate

uses java.nio.charset.StandardCharsets
uses javax.crypto.Mac
uses javax.crypto.spec.SecretKeySpec
uses java.security.MessageDigest

class GateToken {

  static function getSecret() : String {
    var secret = System.getenv("PROVENPATH_GATE_SECRET")
    if (secret == null || secret.length() == 0) {
      // In test context, allow a default
      var testMode = System.getProperty("provenpath.test", "false")
      if (testMode == "true" || System.getenv("PROVENPATH_TEST") != null) {
        return "test-secret-for-dev-only"
      }
      throw new IllegalStateException("PROVENPATH_GATE_SECRET environment variable not set")
    }
    return secret
  }

  static function issue(runId : String, proposalHash : String, rulesetHash : String) : String {
    var data = runId + "|" + proposalHash + "|" + rulesetHash
    return hmacSha256(data, getSecret())
  }

  static function verify(token : String, runId : String, proposalHash : String, rulesetHash : String) : boolean {
    var expected = issue(runId, proposalHash, rulesetHash)
    return constantTimeEquals(token, expected)
  }

  static function hmacSha256(data : String, secret : String) : String {
    var mac = Mac.getInstance("HmacSHA256")
    var keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    mac.init(keySpec)
    var hashBytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8))
    var sb = new StringBuilder()
    for (var b in hashBytes) {
      sb.append(Integer.toHexString((b & 0xFF) | 0x100).substring(1))
    }
    return sb.toString()
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  static function constantTimeEquals(a : String, b : String) : boolean {
    if (a == null || b == null) return false
    var aBytes = a.getBytes(StandardCharsets.UTF_8)
    var bBytes = b.getBytes(StandardCharsets.UTF_8)
    return MessageDigest.isEqual(aBytes, bBytes)
  }
}
