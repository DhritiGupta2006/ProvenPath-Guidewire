package provenpath.contracts

uses com.fasterxml.jackson.annotation.JsonIgnoreProperties
uses com.fasterxml.jackson.databind.ObjectMapper
uses com.fasterxml.jackson.databind.SerializationFeature
uses com.fasterxml.jackson.databind.DeserializationFeature
uses com.fasterxml.jackson.databind.MapperFeature
uses com.fasterxml.jackson.databind.PropertyNamingStrategies
uses com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
uses java.lang.Class

class Json {

  @JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
  static class GosuObjectMixIn {}
  
  static var _MAPPER : ObjectMapper = createMapper()
  static var _CANONICAL_MAPPER : ObjectMapper = createCanonicalMapper()
  
  static property get MAPPER() : ObjectMapper {
    return _MAPPER
  }
  
  private static function createMapper() : ObjectMapper {
    var mapper = new ObjectMapper()
    mapper.registerModule(new JavaTimeModule())
    mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false)
    mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    mapper.setPropertyNamingStrategy(PropertyNamingStrategies.LOWER_CAMEL_CASE)
    mapper.addMixIn(Object, GosuObjectMixIn)
    return mapper
  }
  
  private static function createCanonicalMapper() : ObjectMapper {
    var mapper = new ObjectMapper()
    mapper.registerModule(new JavaTimeModule())
    mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false)
    mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    mapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
    // Map keys too: JSONB and HashMaps reorder keys, and the hash must not depend on that.
    mapper.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
    mapper.setPropertyNamingStrategy(PropertyNamingStrategies.LOWER_CAMEL_CASE)
    mapper.addMixIn(Object, GosuObjectMixIn)
    return mapper
  }
  
  static function canonical(obj : Object) : String {
    return _CANONICAL_MAPPER.writeValueAsString(obj)
  }
  
  static function parse<T>(json : String, type : Class<T>) : T {
    return _MAPPER.readValue(json, type)
  }
  
  static function toJson(obj : Object) : String {
    return _MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(obj)
  }
}
