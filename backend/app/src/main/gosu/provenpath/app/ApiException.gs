package provenpath.app

/** An error with an HTTP status and a stable machine-readable code, rendered as JSON by the API. */
class ApiException extends RuntimeException {

  var _status : int as readonly Status
  var _code : String as readonly Code

  construct(status : int, code : String, message : String) {
    super(message)
    _status = status
    _code = code
  }
}
