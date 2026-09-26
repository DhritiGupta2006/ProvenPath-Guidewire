package provenpath.core.gate

uses java.nio.charset.StandardCharsets
uses java.security.MessageDigest
uses provenpath.contracts.Json

class Hashing {
  static function sha256Hex(input : String) : String {
    var digest = MessageDigest.getInstance("SHA-256")
    var hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8))
    var sb = new StringBuilder()
    for (var b in hashBytes) {
      var hex = Integer.toHexString((b & 0xFF) | 0x100).substring(1)
      sb.append(hex)
    }
    return sb.toString()
  }

  static function hashObject(obj : Object) : String {
    return sha256Hex(Json.canonical(obj))
  }
}
