package provenpath.app.db

uses java.sql.Connection
uses java.util.ArrayList
uses java.util.List
uses java.util.Map
uses provenpath.contracts.Json
uses provenpath.contracts.NodeResult
uses provenpath.contracts.Proposal
uses provenpath.contracts.RegulatorySource
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.NodeStatus
uses provenpath.core.engine.RuleDefinition
uses provenpath.core.gate.Hashing

/** All SQL lives here. Services never build SQL themselves. */
class Repository {

  var _db : Db as readonly DB

  construct(db : Db) {
    _db = db
  }

  // ---------------------------------------------------------------- seed data

  function upsertUser(email : String, fullName : String, role : String) {
    _db.update("INSERT INTO pp_user (email, full_name, role) VALUES (?, ?, ?) " +
        "ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role",
        {email, fullName, role})
  }

  function users() : List<Map<String, Object>> {
    return _db.query("SELECT id, email, full_name, role FROM pp_user ORDER BY role DESC, full_name", {})
  }

  function user(id : String) : Map<String, Object> {
    if (!isUuid(id)) {
      return null
    }
    return _db.queryOne("SELECT id, email, full_name, role FROM pp_user WHERE id = ?::uuid", {id})
  }

  function upsertSource(src : RegulatorySource) {
    _db.update("INSERT INTO pp_regulatory_source (source_code, title, section, full_text, text_sha256, effective_date, expiry_date, jurisdiction, kind, issuer, document, url) " +
        "VALUES (?, ?, ?, ?, ?, ?::date, ?::date, ?, ?, ?, ?, ?) ON CONFLICT (source_code) DO UPDATE SET title = EXCLUDED.title, " +
        "section = EXCLUDED.section, full_text = EXCLUDED.full_text, text_sha256 = EXCLUDED.text_sha256, " +
        "effective_date = EXCLUDED.effective_date, expiry_date = EXCLUDED.expiry_date, jurisdiction = EXCLUDED.jurisdiction, kind = EXCLUDED.kind, issuer = EXCLUDED.issuer, " +
        "document = EXCLUDED.document, url = EXCLUDED.url, updated_at = NOW()",
        {src.SourceCode, src.Title ?: src.SourceCode, src.Section, src.FullText, Hashing.sha256Hex(src.FullText ?: ""),
         src.EffectiveDate?.toString(), src.ExpiryDate?.toString(), src.Jurisdiction ?: "IN", src.Kind, src.Issuer, src.Document, src.Url})
  }

  function upsertRule(rule : RuleDefinition, rulesetHash : String) {
    _db.inTx(\ conn -> {
      Db.update(conn, "INSERT INTO pp_rule (rule_code, rule_name, layer, applies_to, depends_on, rule_logic, source_code, error_template, pc_mapping, ruleset_hash) " +
          "VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?) ON CONFLICT (rule_code) DO UPDATE SET rule_name = EXCLUDED.rule_name, " +
          "layer = EXCLUDED.layer, applies_to = EXCLUDED.applies_to, depends_on = EXCLUDED.depends_on, rule_logic = EXCLUDED.rule_logic, " +
          "source_code = EXCLUDED.source_code, error_template = EXCLUDED.error_template, pc_mapping = EXCLUDED.pc_mapping, " +
          "ruleset_hash = EXCLUDED.ruleset_hash, is_active = TRUE, updated_at = NOW()",
          {rule.RuleCode, rule.Name ?: rule.RuleCode, rule.LayerStr, rule.AppliesTo, Db.textArray(conn, rule.DependsOn),
           Json.canonical(rule.Logic), rule.SourceCode, rule.ErrorTemplate, rule.PcMapping, rulesetHash})
      return null
    })
  }

  /** Rules that are no longer in the YAML set stay in the table (history) but are marked inactive. */
  function deactivateRulesNotIn(activeCodes : List<String>) {
    _db.inTx(\ conn -> {
      Db.update(conn, "UPDATE pp_rule SET is_active = FALSE, updated_at = NOW() WHERE NOT (rule_code = ANY (?))",
          {Db.textArray(conn, activeCodes)})
      return null
    })
  }

  function source(sourceCode : String) : Map<String, Object> {
    return _db.queryOne("SELECT source_code, title, section, full_text, text_sha256, effective_date, expiry_date, jurisdiction, kind, issuer, document, url " +
        "FROM pp_regulatory_source WHERE source_code = ?", {sourceCode})
  }

  // ---------------------------------------------------------------- executions

  function insertExecution(id : String, prompt : String, mode : String) {
    _db.update("INSERT INTO pp_execution (id, prompt, mode, status) VALUES (?, ?, ?, 'planning')", {id, prompt, mode})
  }

  function setExecutionStatus(id : String, status : String) {
    _db.update("UPDATE pp_execution SET status = ?, updated_at = NOW() WHERE id = ?", {status, id})
  }

  /** Atomically moves an execution between states; returns false if it was not in one of the expected states. */
  function transitionExecution(id : String, fromStates : List<String>, toState : String) : boolean {
    var n = _db.inTx(\ conn -> Db.update(conn,
        "UPDATE pp_execution SET status = ?, updated_at = NOW() WHERE id = ? AND status = ANY (?)",
        {toState, id, Db.textArray(conn, fromStates)})) as int
    return n == 1
  }

  function execution(id : String) : Map<String, Object> {
    return _db.queryOne("SELECT id, prompt, mode, status, created_at, updated_at FROM pp_execution WHERE id = ?", {id})
  }

  function listExecutions(limit : int) : List<Map<String, Object>> {
    return _db.query("SELECT id, prompt, mode, status, created_at, updated_at FROM pp_execution ORDER BY created_at DESC LIMIT ?", {limit})
  }

  // ---------------------------------------------------------------- proposals

  /** Stores (or replaces) the proposal for its (execution, iteration). Returns the row id. */
  function upsertProposal(p : Proposal) : String {
    var row = _db.queryOne("INSERT INTO pp_proposal (proposal_id, execution_id, iteration, proposal, proposal_hash) " +
        "VALUES (?, ?, ?, ?::jsonb, ?) ON CONFLICT (execution_id, iteration) DO UPDATE SET proposal_id = EXCLUDED.proposal_id, " +
        "proposal = EXCLUDED.proposal, proposal_hash = EXCLUDED.proposal_hash, status = 'submitted' RETURNING id",
        {p.ProposalId, p.ExecutionId, p.Iteration, Json.canonical(p), Hashing.hashObject(p)})
    return row.get("id") as String
  }

  function setProposalStatus(rowId : String, status : String) {
    _db.update("UPDATE pp_proposal SET status = ? WHERE id = ?::uuid", {status, rowId})
  }

  function proposalRow(rowId : String) : Map<String, Object> {
    return _db.queryOne("SELECT id, proposal_id, execution_id, iteration, status, proposal, proposal_hash, created_at " +
        "FROM pp_proposal WHERE id = ?::uuid", {rowId})
  }

  function proposalsForExecution(executionId : String) : List<Map<String, Object>> {
    return _db.query("SELECT id, proposal_id, execution_id, iteration, status, proposal_hash, created_at " +
        "FROM pp_proposal WHERE execution_id = ? ORDER BY iteration", {executionId})
  }

  /** The newest stored proposal (JSON) that contains the clause, optionally within one execution. */
  function latestProposalWithClause(clauseId : String, executionId : String) : Map<String, Object> {
    var sql = "SELECT id, proposal_id, execution_id, iteration, proposal FROM pp_proposal " +
        "WHERE proposal -> 'clauses' @> ?::jsonb" + (executionId != null ? " AND execution_id = ?" : "") +
        " ORDER BY created_at DESC LIMIT 1"
    var params = new ArrayList<Object>()
    params.add("[{\"clauseId\": " + Json.canonical(clauseId) + "}]")
    if (executionId != null) {
      params.add(executionId)
    }
    return _db.queryOne(sql, params)
  }

  // ---------------------------------------------------------------- verification runs

  function insertRun(executionId : String, proposalRowId : String, iteration : int, verdict : Verdict,
                     snapshots : Map<String, String>, durationMs : int) {
    var failed = 0
    var skipped = 0
    var review = 0
    for (n in verdict.Nodes) {
      if (n.Result == NodeStatus.FAILED) failed++
      if (n.Result == NodeStatus.SKIPPED) skipped++
      if (n.Result == NodeStatus.NEEDS_REVIEW) review++
    }
    _db.inTx(\ conn -> {
      Db.update(conn, "INSERT INTO pp_verification_run (id, execution_id, proposal_row_id, iteration, status, ruleset_hash, " +
          "proposal_hash, verdict_hash, gate_token, nodes_total, nodes_failed, nodes_skipped, nodes_needs_review, duration_ms) " +
          "VALUES (?, ?, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          {verdict.RunId, executionId, proposalRowId, iteration, verdict.Status.name(), verdict.RulesetHash,
           verdict.ProposalHash, verdict.VerdictHash, verdict.GateToken, verdict.Nodes.size(), failed, skipped, review, durationMs})
      var ps = conn.prepareStatement("INSERT INTO pp_verification_node (run_id, position, rule_code, clause_id, layer, result, " +
          "expected, actual, reason, source_code, rule_logic_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)")
      try {
        var pos = 0
        for (n in verdict.Nodes) {
          ps.setString(1, verdict.RunId)
          ps.setInt(2, pos)
          ps.setString(3, n.RuleCode)
          ps.setString(4, n.ClauseId)
          ps.setString(5, n.Layer?.name())
          ps.setString(6, n.Result.name())
          ps.setString(7, n.Expected)
          ps.setString(8, n.Actual)
          ps.setString(9, n.Reason)
          ps.setString(10, n.SourceCode)
          ps.setString(11, snapshots.get(n.RuleCode))
          ps.addBatch()
          pos++
        }
        ps.executeBatch()
      } finally {
        ps.close()
      }
      return null
    })
  }

  function run(runId : String) : Map<String, Object> {
    return _db.queryOne("SELECT * FROM pp_verification_run WHERE id = ?", {runId})
  }

  function latestRun(executionId : String) : Map<String, Object> {
    return _db.queryOne("SELECT * FROM pp_verification_run WHERE execution_id = ? ORDER BY created_at DESC, iteration DESC LIMIT 1", {executionId})
  }

  function runsForExecution(executionId : String) : List<Map<String, Object>> {
    return _db.query("SELECT id, iteration, status, verdict_hash, ruleset_hash, proposal_hash, nodes_total, nodes_failed, " +
        "nodes_skipped, nodes_needs_review, duration_ms, created_at FROM pp_verification_run WHERE execution_id = ? ORDER BY created_at", {executionId})
  }

  function nodesForRun(runId : String) : List<Map<String, Object>> {
    return _db.query("SELECT position, rule_code, clause_id, layer, result, expected, actual, reason, source_code " +
        "FROM pp_verification_node WHERE run_id = ? ORDER BY position", {runId})
  }

  /** Rebuilds the stored verdict (nodes in their original order) for a run. */
  function verdictForRun(runId : String) : Verdict {
    var r = run(runId)
    if (r == null) {
      return null
    }
    var v = new Verdict()
    v.RunId = runId
    v.Status = VerdictStatus.valueOf(r.get("status") as String)
    v.RulesetHash = r.get("ruleset_hash") as String
    v.ProposalHash = r.get("proposal_hash") as String
    v.VerdictHash = r.get("verdict_hash") as String
    v.GateToken = r.get("gate_token") as String
    var nodes = new ArrayList<NodeResult>()
    for (row in nodesForRun(runId)) {
      var n = new NodeResult()
      n.RuleCode = row.get("rule_code") as String
      n.ClauseId = row.get("clause_id") as String
      n.Layer = row.get("layer") == null ? null : provenpath.contracts.Layer.valueOf(row.get("layer") as String)
      n.Result = NodeStatus.valueOf(row.get("result") as String)
      n.Expected = row.get("expected") as String
      n.Actual = row.get("actual") as String
      n.Reason = row.get("reason") as String
      n.SourceCode = row.get("source_code") as String
      nodes.add(n)
    }
    v.Nodes = nodes
    return v
  }

  // ---------------------------------------------------------------- reviews

  function insertReview(executionId : String, runId : String, reviewerId : String, decision : String, comment : String) : String {
    var row = _db.queryOne("INSERT INTO pp_compliance_review (execution_id, run_id, reviewer_user_id, decision, comment) " +
        "VALUES (?, ?, ?::uuid, ?, ?) RETURNING id", {executionId, runId, reviewerId, decision, comment})
    return row.get("id") as String
  }

  function latestApprovedReview(executionId : String) : Map<String, Object> {
    return _db.queryOne("SELECT r.id, r.run_id, r.reviewer_user_id, r.decision, r.comment, r.reviewed_at, u.full_name AS reviewer " +
        "FROM pp_compliance_review r JOIN pp_user u ON u.id = r.reviewer_user_id " +
        "WHERE r.execution_id = ? AND r.decision = 'approved' ORDER BY r.reviewed_at DESC LIMIT 1", {executionId})
  }

  function reviewsForExecution(executionId : String) : List<Map<String, Object>> {
    return _db.query("SELECT r.id, r.run_id, r.decision, r.comment, r.reviewed_at, u.full_name AS reviewer, u.id AS reviewer_id " +
        "FROM pp_compliance_review r JOIN pp_user u ON u.id = r.reviewer_user_id WHERE r.execution_id = ? ORDER BY r.reviewed_at", {executionId})
  }

  // ---------------------------------------------------------------- deployments

  function insertDeployment(executionId : String, runId : String, reviewId : String, manifestJson : String, zip : byte[]) : String {
    var row = _db.queryOne("INSERT INTO pp_deployment (execution_id, run_id, review_id, status, manifest, package_zip) " +
        "VALUES (?, ?, ?::uuid, 'queued', ?::jsonb, ?) RETURNING id", {executionId, runId, reviewId, manifestJson, zip})
    return row.get("id") as String
  }

  /** Hands the oldest queued deployment to exactly one agent (row lock + SKIP LOCKED). */
  function claimNextQueuedDeployment() : Map<String, Object> {
    return _db.queryOne("UPDATE pp_deployment SET status = 'pulled', pulled_at = NOW(), updated_at = NOW() " +
        "WHERE id = (SELECT id FROM pp_deployment WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) " +
        "RETURNING id, execution_id, run_id, review_id, manifest, package_zip, created_at", {})
  }

  function deployment(id : String) : Map<String, Object> {
    if (!isUuid(id)) {
      return null
    }
    return _db.queryOne("SELECT id, execution_id, run_id, review_id, status, manifest, detail, created_at, pulled_at, " +
        "pc_verified_at, updated_at FROM pp_deployment WHERE id = ?::uuid", {id})
  }

  function deploymentPackage(id : String) : byte[] {
    if (!isUuid(id)) {
      return null
    }
    var row = _db.queryOne("SELECT package_zip FROM pp_deployment WHERE id = ?::uuid", {id})
    return row == null ? null : row.get("package_zip") as byte[]
  }

  function deploymentsForExecution(executionId : String) : List<Map<String, Object>> {
    return _db.query("SELECT id, run_id, review_id, status, detail, created_at, pulled_at, pc_verified_at, updated_at " +
        "FROM pp_deployment WHERE execution_id = ? ORDER BY created_at", {executionId})
  }

  function updateDeploymentStatus(id : String, status : String, detail : String) {
    _db.update("UPDATE pp_deployment SET status = ?, detail = ?, updated_at = NOW(), " +
        "pc_verified_at = CASE WHEN ? = 'verified' THEN NOW() ELSE pc_verified_at END WHERE id = ?::uuid",
        {status, detail, status, id})
  }

  // ---------------------------------------------------------------- events

  /** Appends an event with the next per-execution seq. Callers serialise per execution (EventBus lock). */
  function appendEvent(executionId : String, ts : String, type : String, payloadJson : String) : int {
    var row = _db.queryOne("INSERT INTO pp_event_log (execution_id, seq, ts, type, payload) VALUES (?, " +
        "(SELECT COALESCE(MAX(seq), 0) + 1 FROM pp_event_log WHERE execution_id = ?), ?::timestamptz, ?, ?::jsonb) RETURNING seq",
        {executionId, executionId, ts, type, payloadJson})
    return row.get("seq") as int
  }

  function eventsAfter(executionId : String, afterSeq : int) : List<Map<String, Object>> {
    return _db.query("SELECT execution_id, seq, ts, type, payload FROM pp_event_log WHERE execution_id = ? AND seq > ? ORDER BY seq",
        {executionId, afterSeq})
  }

  static function isUuid(s : String) : boolean {
    return s != null and s.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
  }
}
