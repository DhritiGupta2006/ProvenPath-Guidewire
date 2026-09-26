package provenpath.app

uses java.io.ByteArrayOutputStream
uses java.nio.charset.StandardCharsets
uses java.time.Instant
uses java.util.ArrayList
uses java.util.zip.ZipEntry
uses java.util.zip.ZipOutputStream
uses provenpath.contracts.PackageBuilderPort
uses provenpath.contracts.PcFile
uses provenpath.contracts.PcManifest
uses provenpath.contracts.PcPackage
uses provenpath.contracts.PcTermRange
uses provenpath.contracts.Proposal
uses provenpath.contracts.Verdict
uses provenpath.core.gate.Hashing

/** Test stand-in for Track B's :pcexport builder: one file + a manifest carrying the verified token. */
class TestPackageBuilder implements PackageBuilderPort {

  override function build(proposal : Proposal, verdict : Verdict, reviewId : String, reviewer : String) : PcPackage {
    var path = "config/resources/productmodel/products/SMCyber/SMCyber.xml"
    var content = "<Product code=\"SMCyber\" aggregate=\"" + proposal.AggregateLimitInr + "\"/>"
    var bos = new ByteArrayOutputStream()
    var zos = new ZipOutputStream(bos)
    zos.putNextEntry(new ZipEntry(path))
    zos.write(content.getBytes(StandardCharsets.UTF_8))
    zos.closeEntry()
    zos.close()
    var m = new PcManifest()
    m.ProductCode = "SMCyber"
    var files = new ArrayList<PcFile>()
    files.add(new PcFile(path, Hashing.sha256Hex(content)))
    m.Files = files
    m.VerdictHash = verdict.VerdictHash
    m.GateToken = verdict.GateToken
    m.ReviewId = reviewId
    m.Reviewer = reviewer
    m.TermRanges = new ArrayList<PcTermRange>()
    m.GeneratedAt = Instant.now().toString()
    return new PcPackage(m, bos.toByteArray())
  }
}
