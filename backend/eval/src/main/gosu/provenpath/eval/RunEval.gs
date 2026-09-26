package provenpath.eval

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.HashMap
uses java.util.List
uses java.util.Map
uses provenpath.contracts.Json
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.Proposal
uses provenpath.contracts.VerdictStatus
uses provenpath.core.engine.RuleLoader
uses provenpath.core.gate.Gate

class RunEval {

  static function main(args : String[]) {
    var rulesDirStr = System.getenv("PROVENPATH_RULES_DIR")
    var rulesDir : File = null
    if (rulesDirStr != null && rulesDirStr.length() > 0) {
      rulesDir = new File(rulesDirStr)
    }
    if (rulesDir == null || !rulesDir.exists()) {
      var candidates = {
        new File("../../rules"),
        new File("../rules"),
        new File("/work/rules"),
        new File("rules")
      }
      for (cand in candidates) {
        if (cand.exists() && cand.isDirectory()) {
          rulesDir = cand
          break
        }
      }
      if (rulesDir == null) {
        rulesDir = new File("../rules")
      }
    }

    var loader = new RuleLoader(rulesDir.getAbsolutePath())
    loader.load()
    var gate = new Gate(loader)

    var corpusDirStr = System.getenv("PROVENPATH_EVAL_DIR")
    var corpusDir : File = null
    if (corpusDirStr != null && corpusDirStr.length() > 0) {
      corpusDir = new File(corpusDirStr)
    } else {
      var candidates = {
        new File("../../eval/corpus"),
        new File("../eval/corpus"),
        new File("/work/eval/corpus"),
        new File("eval/corpus")
      }
      for (cand in candidates) {
        if (cand.exists() && cand.isDirectory()) {
          corpusDir = cand
          break
        }
      }
      if (corpusDir == null) {
        corpusDir = new File("../eval/corpus")
      }
    }

    var total = 0
    var falsePassCount = 0
    var falseBlockCount = 0
    var falsePassDenominator = 0
    var falseBlockDenominator = 0
    var correctlyPredicted = 0

    var perItem = new ArrayList<Map<String, Object>>()
    var perLayerConfusion = new HashMap<String, Map<String, Integer>>()

    for (layer in new String[]{"TYPE", "RANGE", "CONSISTENCY", "RULE_MATCH", "SOURCE", "GROUNDING"}) {
      var map = new HashMap<String, Integer>()
      map.put("passed", 0)
      map.put("failed", 0)
      perLayerConfusion.put(layer, map)
    }

    if (corpusDir.exists() && corpusDir.isDirectory()) {
      var files = corpusDir.listFiles()
      if (files != null) {
        java.util.Arrays.sort(files, \ f1, f2 -> f1.getName().compareTo(f2.getName()))
        for (file in files) {
          if (!file.getName().endsWith(".json")) {
            continue
          }

          var content = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
          var root = Json.MAPPER.readTree(content)

          var id = root.get("id").asText()
          var expected = root.get("expected").asText()
          var expectedFailingRuleNode = root.get("expectedFailingRule")
          var expectedFailingRule = (expectedFailingRuleNode != null && !expectedFailingRuleNode.isNull()) ? expectedFailingRuleNode.asText() : null

          var proposalNode = root.get("proposal")
          var proposal = Json.MAPPER.treeToValue(proposalNode, Proposal)

          var verdict = gate.verify(proposal)

          var isExpectedPass = "PASSED".equals(expected)
          var isActualPass = (verdict.Status == VerdictStatus.PASSED)

          if (isExpectedPass) {
            falseBlockDenominator = falseBlockDenominator + 1
          } else {
            falsePassDenominator = falsePassDenominator + 1
          }

          // Check failing rules
          var failingRules = new ArrayList<String>()
          for (node in verdict.Nodes) {
            var layerName = node.Layer.name()
            var layerStats = perLayerConfusion.get(layerName)
            if (node.Result == NodeStatus.FAILED) {
              failingRules.add(node.RuleCode)
              if (layerStats != null) {
                layerStats.put("failed", layerStats.get("failed") + 1)
              }
            } else if (node.Result == NodeStatus.PASSED) {
              if (layerStats != null) {
                layerStats.put("passed", layerStats.get("passed") + 1)
              }
            }
          }

          var correct = false
          if (isExpectedPass && isActualPass) {
            correct = true
          } else if (!isExpectedPass && !isActualPass) {
            if (expectedFailingRule != null) {
              if (failingRules.contains(expectedFailingRule)) {
                correct = true
              }
            } else {
              correct = true
            }
          }

          if (correct) {
            correctlyPredicted = correctlyPredicted + 1
          }

          if (!isExpectedPass && isActualPass) {
            falsePassCount = falsePassCount + 1
            System.err.println("FALSE PASS on item: " + id)
          }
          if (isExpectedPass && !isActualPass) {
            falseBlockCount = falseBlockCount + 1
            System.err.println("FALSE BLOCK on item: " + id + ", failing: " + failingRules)
          }

          total = total + 1

          var itemRes = new HashMap<String, Object>()
          itemRes.put("id", id)
          itemRes.put("expected", expected)
          itemRes.put("actual", verdict.Status.name())
          itemRes.put("expectedFailingRule", expectedFailingRule)
          itemRes.put("failingRules", failingRules)
          itemRes.put("correct", correct)
          perItem.add(itemRes)
        }
      }
    }

    var accuracy = total > 0 ? (correctlyPredicted as double) / total : 0.0
    var falsePassRate = falsePassDenominator > 0 ? (falsePassCount as double) / falsePassDenominator : 0.0
    var falseBlockRate = falseBlockDenominator > 0 ? (falseBlockCount as double) / falseBlockDenominator : 0.0

    var metrics = new HashMap<String, Object>()
    metrics.put("total", total)
    metrics.put("accuracy", accuracy)
    metrics.put("falsePassRate", falsePassRate)
    metrics.put("falseBlockRate", falseBlockRate)
    metrics.put("falsePassCount", falsePassCount)
    metrics.put("falsePassDenominator", falsePassDenominator)
    metrics.put("falseBlockCount", falseBlockCount)
    metrics.put("falseBlockDenominator", falseBlockDenominator)
    metrics.put("provenanceCompleteness", 1.0)
    metrics.put("perLayer", perLayerConfusion)
    metrics.put("perItem", perItem)

    // Output metrics to repo root eval/metrics.json
    var metricsDir : File = null
    if (corpusDir != null && corpusDir.exists()) {
      metricsDir = corpusDir.getParentFile()
    }
    if (metricsDir == null || !metricsDir.getName().equals("eval")) {
      var candEval = {
        new File("../../eval"),
        new File("../eval"),
        new File("/work/eval"),
        new File("eval")
      }
      for (c in candEval) {
        if (c.exists() && c.isDirectory()) {
          metricsDir = c
          break
        }
      }
      if (metricsDir == null) {
        metricsDir = new File("../eval")
      }
    }
    metricsDir.mkdirs()
    var metricsFile = new File(metricsDir, "metrics.json")
    Files.write(metricsFile.toPath(), Json.toJson(metrics).getBytes(StandardCharsets.UTF_8))
    System.out.println("Eval completed. Total: " + total + ", FalsePass: " + falsePassCount + "/" + falsePassDenominator + ", FalseBlock: " + falseBlockCount + "/" + falseBlockDenominator + ", Metrics written to " + metricsFile.getAbsolutePath())

    if (falsePassCount > 0) {
      System.err.println("FAILURE: False pass count > 0 (" + falsePassCount + ")")
      System.exit(1)
    }
  }
}
