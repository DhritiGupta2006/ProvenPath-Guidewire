package provenpath.contracts

/** An overlay package: the signed manifest plus the zip with the overlay files. */
class PcPackage {
  var _manifest : PcManifest as Manifest
  var _zipBytes : byte[] as ZipBytes

  construct() {}

  construct(manifest : PcManifest, zipBytes : byte[]) {
    _manifest = manifest
    _zipBytes = zipBytes
  }
}
