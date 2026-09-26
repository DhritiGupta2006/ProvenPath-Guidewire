package provenpath.app

uses java.util.ArrayList
uses provenpath.app.db.Repository
uses provenpath.core.engine.RuleLoader

/** Idempotent startup seed: demo users, regulatory sources and the active rule set from rules/. */
class Seeder {

  static function seed(repo : Repository, loader : RuleLoader) {
    repo.upsertUser("a.mehta@provenpath.demo", "A. Mehta — Compliance Reviewer", "reviewer")
    repo.upsertUser("pm@provenpath.demo", "PM Demo", "proposer")
    for (src in loader.Sources) {
      repo.upsertSource(src)
    }
    var codes = new ArrayList<String>()
    for (rule in loader.Rules) {
      repo.upsertRule(rule, loader.RulesetHash)
      codes.add(rule.RuleCode)
    }
    repo.deactivateRulesNotIn(codes)
  }
}
