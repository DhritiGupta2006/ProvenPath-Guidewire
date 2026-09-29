package provenpath.pcagent

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.nio.file.StandardCopyOption
uses java.time.LocalDateTime
uses java.time.format.DateTimeFormatter
uses java.util.ArrayList
uses java.util.Arrays
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses provenpath.contracts.Json
uses provenpath.contracts.Signing

/**
 * Writes a verified package into PolicyCenter's modules/configuration:
 *   - product-model XML files are written as they are,
 *   - the display-name fragment replaces the marked ProvenPath block in productmodel.display.properties
 *     (or is appended once), keeping the file's own line endings,
 *   - pc-edits.json edits (replaceAttr) are applied only to PCF files, idempotently.
 * Every file it touches is backed up first; if anything fails, the backup is restored. Files whose bytes do not
 * change are not rewritten, so a repeat deploy of the same product changes nothing.
 */
class Installer {

  static final var MARK_START : String = "# >>> ProvenPath SMCyber >>>"
  static final var MARK_END : String = "# <<< ProvenPath SMCyber <<<"
  static final var DISPLAY : String = "config/locale/productmodel.display.properties"
  static final var PCF_ROOT : String = "modules/configuration/config/web/pcf/"

  var _pcHome : File
  var _backupRoot : File

  construct(pcHome : File, backupRoot : File) {
    _pcHome = pcHome
    _backupRoot = backupRoot
  }

  property get ConfigDir() : File {
    return new File(_pcHome, "modules/configuration")
  }

  function install(pkg : VerifiedPackage, label : String) : InstallResult {
    if (!ConfigDir.Directory) {
      throw new IllegalStateException("not a PolicyCenter home (no modules/configuration): " + _pcHome.AbsolutePath)
    }
    var plan = planWrites(pkg)
    var backup = new File(_backupRoot, safe(label) + "-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")))
    var result = new InstallResult(backup)

    // 1. back up everything we might touch, and keep the package itself next to it
    for (target in plan.keySet()) {
      if (target.File) {
        var copy = new File(backup, "before/" + relative(target))
        copy.ParentFile.mkdirs()
        Files.copy(target.toPath(), copy.toPath(), {StandardCopyOption.REPLACE_EXISTING})
      }
    }
    new File(backup, "package").mkdirs()
    Files.write(new File(backup, "package/" + Signing.MANIFEST_ENTRY).toPath(), Json.toJson(pkg.Manifest).getBytes(StandardCharsets.UTF_8))
    var report = pkg.Files.get(PackageVerifier.REPORT)
    if (report != null) Files.write(new File(backup, "package/" + PackageVerifier.REPORT).toPath(), report)

    // 2. write only what changes; restore on any failure
    try {
      for (e in plan.entrySet()) {
        var target = e.Key
        var existed = target.File
        if (existed and Arrays.equals(Files.readAllBytes(target.toPath()), e.Value)) continue
        target.ParentFile.mkdirs()
        var tmp = new File(target.Path + ".provenpath-tmp")
        Files.write(tmp.toPath(), e.Value)
        Files.move(tmp.toPath(), target.toPath(), {StandardCopyOption.REPLACE_EXISTING})
        result.Changed.add(relative(target))
        if (!existed) result.Created.add(target)
      }
    } catch (e : Exception) {
      rollback(result)
      throw e
    }
    return result
  }

  /** Puts back the backed-up files and removes files this install created. */
  function rollback(result : InstallResult) {
    var before = new File(result.BackupDir, "before")
    for (rel in result.Changed) {
      var target = new File(ConfigDir.ParentFile.ParentFile, rel)
      var saved = new File(before, rel)
      if (saved.File) {
        Files.copy(saved.toPath(), target.toPath(), {StandardCopyOption.REPLACE_EXISTING})
      }
    }
    for (f in result.Created) {
      f.delete()
    }
  }

  /** target file → the bytes it should have after the install. */
  private function planWrites(pkg : VerifiedPackage) : Map<File, byte[]> {
    var plan = new LinkedHashMap<File, byte[]>()
    for (e in pkg.Files.entrySet()) {
      if (e.Key.startsWith("config/resources/productmodel/")) {
        plan.put(new File(ConfigDir, e.Key), e.Value)
      }
    }
    var fragment = pkg.Files.get(PackageVerifier.FRAGMENT)
    if (fragment != null) {
      var display = new File(ConfigDir, DISPLAY)
      var current = display.File ? new String(Files.readAllBytes(display.toPath()), StandardCharsets.ISO_8859_1) : ""
      var merged = mergeFragment(current, new String(fragment, StandardCharsets.ISO_8859_1))
      plan.put(display, merged.getBytes(StandardCharsets.ISO_8859_1))
    }
    var edits = pkg.Files.get(PackageVerifier.PC_EDITS)
    if (edits != null) {
      for (edit in Json.MAPPER.readValue(edits, List) as List<Map<String, Object>>) {
        applyEdit(plan, edit)
      }
    }
    return plan
  }

  private function applyEdit(plan : Map<File, byte[]>, edit : Map<String, Object>) {
    var action = edit.get("action") as String
    var rel = edit.get("file") as String
    var from = edit.get("from") as String
    var to = edit.get("to") as String
    if (action != "replaceAttr" or rel == null or from == null or to == null) {
      throw new IllegalStateException("unsupported pc-edits entry: " + edit)
    }
    if (rel.contains("..") or !rel.startsWith(PCF_ROOT) or !rel.endsWith(".pcf")) {
      throw new IllegalStateException("pc-edits may only touch PCF files under " + PCF_ROOT + ": " + rel)
    }
    var file = new File(_pcHome, rel)
    if (!file.File) throw new IllegalStateException("PCF file to edit not found: " + rel)
    var text = new String(plan.containsKey(file) ? plan.get(file) : Files.readAllBytes(file.toPath()), StandardCharsets.ISO_8859_1)
    if (text.contains(to)) {
      plan.put(file, text.getBytes(StandardCharsets.ISO_8859_1))
      return
    }
    var at = text.indexOf(from)
    if (at < 0) throw new IllegalStateException("PCF edit target '" + from + "' not found in " + rel)
    text = text.substring(0, at) + to + text.substring(at + from.length())
    plan.put(file, text.getBytes(StandardCharsets.ISO_8859_1))
  }

  /** Replaces the marked ProvenPath block, or appends it once. Uses the file's own line ending. */
  static function mergeFragment(current : String, fragment : String) : String {
    var nl = current.contains("\r\n") ? "\r\n" : "\n"
    var section = fragment.replace("\r\n", "\n").trim().replace("\n", nl)
    var start = current.indexOf(MARK_START)
    var end = start < 0 ? -1 : current.indexOf(MARK_END, start)
    if (start >= 0 and end >= 0) {
      return current.substring(0, start) + section + current.substring(end + MARK_END.length())
    }
    var base = current
    if (!base.Empty and !base.endsWith(nl)) base = base + nl
    return base + section + nl
  }

  private function relative(f : File) : String {
    return _pcHome.toPath().toAbsolutePath().normalize().relativize(f.toPath().toAbsolutePath().normalize()).toString().replace('\\', '/')
  }

  private static function safe(s : String) : String {
    return (s ?: "package").replaceAll("[^A-Za-z0-9._-]", "_")
  }
}
