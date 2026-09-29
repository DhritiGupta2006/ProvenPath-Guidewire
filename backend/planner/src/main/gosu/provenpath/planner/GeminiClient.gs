package provenpath.planner

uses java.io.File
uses java.math.BigDecimal
uses java.net.URI
uses java.net.http.HttpClient
uses java.net.http.HttpRequest
uses java.net.http.HttpResponse
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.time.Duration
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses com.fasterxml.jackson.databind.ObjectMapper
uses com.fasterxml.jackson.databind.node.ObjectNode
uses com.fasterxml.jackson.databind.node.ArrayNode

/**
 * HTTP client for Gemini REST generateContent API.
 * Sends a system+user prompt with function declarations, returns the first content part.
 * temperature=0, key from env GEMINI_API_KEY.
 */
class GeminiClient {

  /** GEMINI_MODEL overrides the default without a code change (model names get retired). */
  static final var MODEL : String = System.getenv("GEMINI_MODEL") ?: "gemini-3.8-flash"
  static final var API_BASE : String = "https://generativelanguage.googleapis.com/v1beta/models/"
  static final var MAPPER : ObjectMapper = new ObjectMapper()

  var _apiKey : String
  var _http : HttpClient
  var _tools : List<Map<String, Object>>

  construct(apiKey : String, toolsDir : String) {
    _apiKey = apiKey
    _http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build()
    _tools = loadTools(toolsDir)
  }

  private function loadTools(toolsDir : String) : List<Map<String, Object>> {
    var result = new ArrayList<Map<String, Object>>()
    var dir = new File(toolsDir)
    if (!dir.Directory) {
      return result
    }
    var files = dir.listFiles()
    if (files != null) {
      for (f in files.where(\ x -> x.Name.endsWith(".json")).orderBy(\ x -> x.Name)) {
        var json = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)
        var schema = MAPPER.readValue(json, Map) as Map<String, Object>
        // The model only proposes: deployment is a human + gate decision, never an LLM tool call.
        if (schema.get("name") == "deploy_product") continue
        var decl = new LinkedHashMap<String, Object>()
        decl.put("name", schema.get("name"))
        decl.put("description", schema.get("description"))
        var params = schema.get("parameters") as Map<String, Object>
        var cleaned = geminiSchema(params, params.get("definitions") as Map<String, Object>) as Map<String, Object>
        var props = cleaned.get("properties") as Map<String, Object>
        if (props != null and !props.Empty) {
          decl.put("parameters", cleaned)
        }
        result.add(decl)
      }
    }
    return result
  }

  /**
   * Gemini function declarations take an OpenAPI-style schema subset: no $ref/definitions and no
   * additionalProperties (a 400 "Unknown name $ref" otherwise). This inlines the refs from the shared
   * JSON Schemas in shared/tools (which MCP keeps using as they are), drops unsupported keywords, and hides
   * executionId, which the planner fills in itself.
   */
  static function geminiSchema(node : Object, defs : Map<String, Object>) : Object {
    if (node typeis Map) {
      var m = node as Map<String, Object>
      var ref = m.get("$ref") as String
      if (ref != null and defs != null) {
        var resolved = new LinkedHashMap<String, Object>(defs.get(ref.substring(ref.lastIndexOf("/") + 1)) as Map<String, Object>)
        if (m.containsKey("description")) resolved.put("description", m.get("description"))
        return geminiSchema(resolved, defs)
      }
      var result = new LinkedHashMap<String, Object>()
      for (e in m.entrySet()) {
        if (e.Key == "definitions" or e.Key == "$schema" or e.Key == "additionalProperties" or e.Key == "$ref") continue
        if (e.Key == "properties") {
          var props = new LinkedHashMap<String, Object>()
          for (p in (e.Value as Map<String, Object>).entrySet()) {
            if (p.Key != "executionId") props.put(p.Key, geminiSchema(p.Value, defs))
          }
          result.put("properties", props)
        } else if (e.Key == "required") {
          result.put("required", (e.Value as List<Object>).where(\ r -> r != "executionId").toList())
        } else {
          result.put(e.Key, geminiSchema(e.Value, defs))
        }
      }
      return result
    }
    if (node typeis List) {
      return (node as List<Object>).map(\ x -> geminiSchema(x, defs)).toList()
    }
    return node
  }

  /**
   * Call generateContent with the given conversation turns.
   * Returns the raw JSON response node for the caller to interpret.
   */
  function generate(systemPrompt : String, userPrompt : String) : Object {
    var body = buildRequestBody(systemPrompt, userPrompt)
    var bodyJson = MAPPER.writeValueAsString(body)

    var url = API_BASE + MODEL + ":generateContent"
    var request = HttpRequest.newBuilder().uri(URI.create(url)).header("Content-Type", "application/json").header("x-goog-api-key", _apiKey).timeout(Duration.ofSeconds(120)).POST(HttpRequest.BodyPublishers.ofString(bodyJson, StandardCharsets.UTF_8)).build()

    var response = _http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
    if (response.statusCode() != 200) {
      throw new RuntimeException("Gemini API error " + response.statusCode() + ": " + response.body())
    }
    return MAPPER.readValue(response.body(), Object)
  }

  /**
   * Call generateContent with explicit conversation (multi-turn for repair).
   * contents = list of {role, parts:[{text}]} or {role, parts:[{functionCall}]} or {role, parts:[{functionResponse}]}
   */
  function generateWithHistory(systemPrompt : String, contents : List<Map<String, Object>>) : Object {
    var body = buildRequestBodyWithHistory(systemPrompt, contents)
    var bodyJson = MAPPER.writeValueAsString(body)

    var url = API_BASE + MODEL + ":generateContent"
    var request = HttpRequest.newBuilder().uri(URI.create(url)).header("Content-Type", "application/json").header("x-goog-api-key", _apiKey).timeout(Duration.ofSeconds(120)).POST(HttpRequest.BodyPublishers.ofString(bodyJson, StandardCharsets.UTF_8)).build()

    var response = _http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
    if (response.statusCode() != 200) {
      throw new RuntimeException("Gemini API error " + response.statusCode() + ": " + response.body())
    }
    return MAPPER.readValue(response.body(), Object)
  }

  private function buildRequestBody(systemPrompt : String, userPrompt : String) : Map<String, Object> {
    var body = new LinkedHashMap<String, Object>()
    body.put("system_instruction", map({"parts" -> list(map({"text" -> systemPrompt}))}))
    body.put("contents", list(map({"role" -> "user", "parts" -> list(map({"text" -> userPrompt}))})))
    body.put("tools", list(map({"function_declarations" -> _tools})))
    body.put("tool_config", map({"function_calling_config" -> map({"mode" -> "AUTO"})}))
    body.put("generation_config", map({"temperature" -> 0}))
    return body
  }

  private function buildRequestBodyWithHistory(systemPrompt : String, contents : List<Map<String, Object>>) : Map<String, Object> {
    var body = new LinkedHashMap<String, Object>()
    body.put("system_instruction", map({"parts" -> list(map({"text" -> systemPrompt}))}))
    body.put("contents", contents)
    body.put("tools", list(map({"function_declarations" -> _tools})))
    body.put("tool_config", map({"function_calling_config" -> map({"mode" -> "AUTO"})}))
    body.put("generation_config", map({"temperature" -> 0}))
    return body
  }

  /** Extract function call parts from a generateContent response. Returns empty list if model chose text. */
  static function extractFunctionCalls(response : Object) : List<Map<String, Object>> {
    var result = new ArrayList<Map<String, Object>>()
    var r = response as Map<String, Object>
    var candidates = r.get("candidates") as List<Object>
    if (candidates == null or candidates.isEmpty()) return result
    var content = (candidates.get(0) as Map<String, Object>).get("content") as Map<String, Object>
    if (content == null) return result
    var parts = content.get("parts") as List<Object>
    if (parts == null) return result
    for (part in parts) {
      var p = part as Map<String, Object>
      if (p.containsKey("functionCall")) {
        result.add(p.get("functionCall") as Map<String, Object>)
      }
    }
    return result
  }

  /** Extract text from a generateContent response (when model returns text instead of function calls). */
  static function extractText(response : Object) : String {
    var r = response as Map<String, Object>
    var candidates = r.get("candidates") as List<Object>
    if (candidates == null or candidates.isEmpty()) return ""
    var content = (candidates.get(0) as Map<String, Object>).get("content") as Map<String, Object>
    if (content == null) return ""
    var parts = content.get("parts") as List<Object>
    if (parts == null) return ""
    var sb = new java.lang.StringBuilder()
    for (part in parts) {
      var p = part as Map<String, Object>
      if (p.containsKey("text")) {
        sb.append(p.get("text") as String)
      }
    }
    return sb.toString()
  }

  private static function map(m : Map<String, Object>) : Map<String, Object> {
    return new LinkedHashMap<String, Object>(m)
  }

  private static function list(item : Object) : List<Object> {
    var l = new ArrayList<Object>()
    l.add(item)
    return l
  }

  property get ToolCount() : int { return _tools.size() }
}
