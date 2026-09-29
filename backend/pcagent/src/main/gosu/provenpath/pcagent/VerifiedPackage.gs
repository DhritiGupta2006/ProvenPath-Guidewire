package provenpath.pcagent

uses java.util.Map
uses provenpath.contracts.PcManifest

/** A package whose manifest signature, gate token and file hashes all checked out. */
class VerifiedPackage {
  var _manifest : PcManifest as readonly Manifest
  var _files : Map<String, byte[]> as readonly Files

  construct(manifest : PcManifest, files : Map<String, byte[]>) {
    _manifest = manifest
    _files = files
  }
}
