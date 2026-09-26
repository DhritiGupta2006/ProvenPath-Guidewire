package provenpath.contracts

uses java.util.Map

interface EventPort {
  function emit(executionId : String, type : String, payload : Map<String, Object>)
}
