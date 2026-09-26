package provenpath.contracts

uses java.util.Map
uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class Event {
  var _executionId : String as ExecutionId
  var _seq : int as Seq
  var _ts : String as Ts
  var _type : String as Type
  var _payload : Map<String, Object> as Payload

  construct() {}

  construct(executionId : String, seq : int, ts : String, type : String, payload : Map<String, Object>) {
    _executionId = executionId
    _seq = seq
    _ts = ts
    _type = type
    _payload = payload
  }
}
