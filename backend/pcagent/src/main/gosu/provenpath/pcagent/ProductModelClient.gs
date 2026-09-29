package provenpath.pcagent

uses java.net.URI
uses java.net.http.HttpClient
uses java.net.http.HttpRequest
uses java.net.http.HttpResponse
uses java.nio.charset.StandardCharsets
uses java.time.Duration
uses java.util.Base64

/**
 * PolicyCenter's ProductModelAPI over SOAP 1.1 (pc1000), with a raw envelope and HTTP Basic auth.
 * getPublicIdForCodeIdentifier returns <return>…</return> when the code exists and an empty response otherwise.
 */
class ProductModelClient {

  public static final var NS : String = "http://guidewire.com/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI"

  var _endpoint : String
  var _auth : String
  var _http : HttpClient

  construct(pcUrl : String, user : String, password : String) {
    _endpoint = pcUrl + "/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI/soap11"
    _auth = "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8))
    _http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
  }

  /** True when PolicyCenter answers the SOAP call at all (used as the "ready" signal after a restart). */
  function isUp() : boolean {
    try {
      exists("SMCyber", "PRODUCT")
      return true
    } catch (e : Exception) {
      return false
    }
  }

  /** Whether the code exists as the given productModelType (PRODUCT, CLAUSEPATTERN, COVTERMPATTERN, …). */
  function exists(code : String, productModelType : String) : boolean {
    var body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
        "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:prod=\"" + NS + "\">" +
        "<soapenv:Body><prod:getPublicIdForCodeIdentifier>" +
        "<prod:codeIdentifier>" + xml(code) + "</prod:codeIdentifier>" +
        "<prod:productModelType>" + xml(productModelType) + "</prod:productModelType>" +
        "</prod:getPublicIdForCodeIdentifier></soapenv:Body></soapenv:Envelope>"
    var req = HttpRequest.newBuilder(URI.create(_endpoint))
        .timeout(Duration.ofSeconds(20))
        .header("Content-Type", "text/xml; charset=utf-8")
        .header("SOAPAction", "\"\"")
        .header("Authorization", _auth)
        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
        .build()
    var res = _http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
    if (res.statusCode() != 200) {
      throw new IllegalStateException("ProductModelAPI HTTP " + res.statusCode())
    }
    var text = res.body()
    if (!text.contains("getPublicIdForCodeIdentifierResponse")) {
      throw new IllegalStateException("unexpected ProductModelAPI response")
    }
    return text.contains("<return>") or text.contains(":return>")
  }

  private static function xml(s : String) : String {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
  }
}
