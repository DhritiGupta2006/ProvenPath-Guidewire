package provenpath.core.engine

uses java.io.File
uses java.io.FileInputStream
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.nio.file.Path
uses java.nio.file.Paths
uses java.security.MessageDigest
uses java.util.ArrayList
uses java.util.HashMap
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.TreeMap
uses org.yaml.snakeyaml.Yaml
uses provenpath.contracts.Json
uses provenpath.contracts.Layer
uses provenpath.contracts.RegulatorySource

/**
 * Loads rule YAML files and sources.yaml from a directory.
 * Validates required fields, unknown layers/operators, missing dependencies, unknown source codes.
 * Computes rulesetHash = sha256 of canonical(rules + sources).
 */
class RuleLoader {

  var _rulesDir : String
  var _rules : List<RuleDefinition> as readonly Rules = {}
  var _sources : List<RegulatorySource> as readonly Sources = {}
  var _rulesByCode : Map<String, RuleDefinition> as readonly RulesByCode = new HashMap<String, RuleDefinition>()
  var _sourcesByCode : Map<String, RegulatorySource> as readonly SourcesByCode = new HashMap<String, RegulatorySource>()
  var _rulesetHash : String as readonly RulesetHash

  static final var VALID_LAYERS : List<String> = {"TYPE", "RANGE", "CONSISTENCY", "RULE_MATCH", "SOURCE", "GROUNDING"}
  static final var VALID_OPERATORS : List<String> = {"AND", "OR", "NOT", "GT", "GTE", "LT", "LTE", "EQ", "NEQ", "IN", "REGEX", "EXISTS", "TYPE_IS", "FN"}

  construct(rulesDir : String) {
    _rulesDir = rulesDir
  }

  /**
   * Load all rules and sources. Validates and computes hash.
   */
  function load() {
    loadSources()
    loadRules()
    validate()
    computeHash()
  }

  private function loadSources() {
    var sourcesFile = new File(_rulesDir, "sources.yaml")
    if (!sourcesFile.exists()) {
      throw new IllegalStateException("sources.yaml not found in " + _rulesDir)
    }
    var yaml = new Yaml()
    var content = new String(Files.readAllBytes(sourcesFile.toPath()), StandardCharsets.UTF_8)
    var rawParsed = yaml.load(content)
    var parsed : List<Map<String, Object>>
    if (rawParsed typeis Map) {
      parsed = (rawParsed as Map<String, Object>).get("sources") as List<Map<String, Object>>
    } else {
      parsed = rawParsed as List<Map<String, Object>>
    }
    if (parsed == null) {
      throw new IllegalStateException("sources.yaml is empty or invalid")
    }
    var sourcesList = new ArrayList<RegulatorySource>()
    for (var entry in parsed) {
      var src = new RegulatorySource()
      src.SourceCode = entry.get("source_code") as String
      src.Title = entry.get("title") as String
      src.Section = entry.get("section") as String
      src.FullText = entry.get("full_text") as String
      if (entry.get("effective_date") != null) {
        var ed = entry.get("effective_date")
        if (ed typeis java.util.Date) {
          var cal = java.util.Calendar.getInstance()
          cal.setTime(ed)
          src.EffectiveDate = java.time.LocalDate.of(cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH))
        } else {
          src.EffectiveDate = java.time.LocalDate.parse(ed.toString())
        }
      }
      if (entry.get("expiry_date") != null) {
        var exd = entry.get("expiry_date")
        if (exd typeis java.util.Date) {
          var cal = java.util.Calendar.getInstance()
          cal.setTime(exd)
          src.ExpiryDate = java.time.LocalDate.of(cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH))
        } else {
          src.ExpiryDate = java.time.LocalDate.parse(exd.toString())
        }
      }
      src.Jurisdiction = (entry.get("jurisdiction") as String) ?: "IN"
      src.Kind = entry.get("kind") as String
      src.Issuer = entry.get("issuer") as String
      src.Document = entry.get("document") as String
      src.Url = entry.get("url") as String
      sourcesList.add(src)
      _sourcesByCode.put(src.SourceCode, src)
    }
    _sources = sourcesList
  }

  private function loadRules() {
    var rulesSubDir = new File(_rulesDir, "rules")
    if (!rulesSubDir.exists() || !rulesSubDir.isDirectory()) {
      throw new IllegalStateException("rules/ subdirectory not found in " + _rulesDir)
    }
    var yaml = new Yaml()
    var ruleFiles = rulesSubDir.listFiles()
    if (ruleFiles == null || ruleFiles.length == 0) {
      throw new IllegalStateException("No rule YAML files found in " + rulesSubDir.getAbsolutePath())
    }
    // Sort files for deterministic order
    java.util.Arrays.sort(ruleFiles, \ f1, f2 -> f1.getName().compareTo(f2.getName()))

    var rulesList = new ArrayList<RuleDefinition>()
    for (var ruleFile in ruleFiles) {
      if (!ruleFile.getName().endsWith(".yaml") && !ruleFile.getName().endsWith(".yml")) {
        continue
      }
      var content = new String(Files.readAllBytes(ruleFile.toPath()), StandardCharsets.UTF_8)
      var entry = yaml.load(content) as Map<String, Object>
      if (entry == null) {
        continue
      }
      var rule = new RuleDefinition()
      rule.RuleCode = requireField(entry, "rule_code", ruleFile.getName()) as String
      rule.Name = requireField(entry, "name", ruleFile.getName()) as String
      rule.LayerStr = requireField(entry, "layer", ruleFile.getName()) as String
      rule.AppliesTo = requireField(entry, "applies_to", ruleFile.getName()) as String
      var deps = entry.get("depends_on")
      if (deps != null) {
        rule.DependsOn = deps as List<String>
      } else {
        rule.DependsOn = {}
      }
      var logic = entry.get("logic")
      if (logic != null) {
        rule.Logic = logic as Map<String, Object>
      } else {
        rule.Logic = new HashMap<String, Object>()
      }
      rule.SourceCode = entry.get("source_code") as String
      rule.ErrorTemplate = entry.get("error_template") as String ?: ""
      rule.PcMapping = entry.get("pc_mapping") as String
      rulesList.add(rule)
      _rulesByCode.put(rule.RuleCode, rule)
    }
    _rules = rulesList
  }

  private function requireField(entry : Map<String, Object>, field : String, fileName : String) : Object {
    var value = entry.get(field)
    if (value == null) {
      throw new IllegalStateException("Required field '" + field + "' missing in " + fileName)
    }
    return value
  }

  private function validate() {
    // Validate layers
    for (var rule in _rules) {
      if (!VALID_LAYERS.contains(rule.LayerStr)) {
        throw new IllegalStateException("Rule " + rule.RuleCode + " has unknown layer: " + rule.LayerStr)
      }
    }

    // Validate operators in logic trees
    for (var rule in _rules) {
      if (rule.Logic != null && !rule.Logic.isEmpty()) {
        validateOperators(rule.Logic, rule.RuleCode)
      }
    }

    // Validate dependencies exist
    for (var rule in _rules) {
      for (var dep in rule.DependsOn) {
        if (!_rulesByCode.containsKey(dep)) {
          throw new IllegalStateException("Rule " + rule.RuleCode + " depends on unknown rule: " + dep)
        }
      }
    }

    // Validate source codes
    for (var rule in _rules) {
      if (rule.SourceCode != null && rule.SourceCode.length() > 0) {
        if (!_sourcesByCode.containsKey(rule.SourceCode)) {
          throw new IllegalStateException("Rule " + rule.RuleCode + " references unknown source: " + rule.SourceCode)
        }
      }
    }
  }

  private function validateOperators(logic : Map<String, Object>, ruleCode : String) {
    var op = logic.get("operator") as String
    if (op != null && !VALID_OPERATORS.contains(op)) {
      throw new IllegalStateException("Rule " + ruleCode + " has unknown operator: " + op)
    }
    var children = logic.get("children") as List<Map<String, Object>>
    if (children != null) {
      for (var child in children) {
        validateOperators(child, ruleCode)
      }
    }
  }

  private function computeHash() {
    // Build a canonical representation: sorted rules + sorted sources
    var canonical = new TreeMap<String, Object>()
    var sortedRules = new TreeMap<String, Object>()
    for (var rule in _rules) {
      var ruleMap = new TreeMap<String, Object>()
      ruleMap.put("rule_code", rule.RuleCode)
      ruleMap.put("name", rule.Name)
      ruleMap.put("layer", rule.LayerStr)
      ruleMap.put("applies_to", rule.AppliesTo)
      ruleMap.put("depends_on", rule.DependsOn)
      ruleMap.put("logic", rule.Logic)
      ruleMap.put("source_code", rule.SourceCode)
      sortedRules.put(rule.RuleCode, ruleMap)
    }
    var sortedSources = new TreeMap<String, Object>()
    for (var src in _sources) {
      var srcMap = new TreeMap<String, Object>()
      srcMap.put("source_code", src.SourceCode)
      srcMap.put("title", src.Title)
      srcMap.put("full_text", src.FullText)
      sortedSources.put(src.SourceCode, srcMap)
    }
    canonical.put("rules", sortedRules)
    canonical.put("sources", sortedSources)
    var json = Json.canonical(canonical)
    _rulesetHash = sha256Hex(json)
  }

  static function sha256Hex(input : String) : String {
    var digest = MessageDigest.getInstance("SHA-256")
    var hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8))
    var sb = new StringBuilder()
    for (var b in hashBytes) {
      sb.append(Integer.toHexString((b & 0xFF) | 0x100).substring(1))
    }
    return sb.toString()
  }
}
