package provenpath.contracts

class PcFile {
  var _path : String as Path
  var _sha256 : String as Sha256

  construct() {}

  construct(path : String, sha256 : String) {
    _path = path
    _sha256 = sha256
  }
}
