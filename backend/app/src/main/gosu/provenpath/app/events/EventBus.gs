package provenpath.app.events

uses java.time.Instant
uses java.util.ArrayList
uses java.util.List
uses java.util.Map
uses java.util.concurrent.ConcurrentHashMap
uses java.util.concurrent.CopyOnWriteArrayList
uses java.util.concurrent.locks.ReentrantLock
uses provenpath.app.db.Repository
uses provenpath.contracts.Event
uses provenpath.contracts.EventPort
uses provenpath.contracts.Json

/**
 * Append-only event log + live fan-out. Every event is written to pp_event_log with the next
 * per-execution seq BEFORE subscribers see it, so a late SSE client can always replay from seq 0.
 */
class EventBus implements EventPort {

  var _repo : Repository
  var _locks = new ConcurrentHashMap<String, ReentrantLock>()
  var _subscribers = new ConcurrentHashMap<String, CopyOnWriteArrayList<EventSubscriber>>()

  construct(repo : Repository) {
    _repo = repo
  }

  override function emit(executionId : String, type : String, payload : Map<String, Object>) {
    var lock = _locks.computeIfAbsent(executionId, \ k -> new ReentrantLock())
    lock.lock()
    try {
      var ts = Instant.now().toString()
      var body = payload ?: new java.util.LinkedHashMap<String, Object>()
      var seq = _repo.appendEvent(executionId, ts, type, Json.canonical(body))
      var ev = new Event(executionId, seq, ts, type, body)
      // Delivered under the lock so every subscriber sees events in seq order.
      var subs = _subscribers.get(executionId)
      if (subs != null) {
        for (s in subs) {
          s.deliver(ev)
        }
      }
    } finally {
      lock.unlock()
    }
  }

  /** Stored events with seq > afterSeq, oldest first. */
  function history(executionId : String, afterSeq : int) : List<Event> {
    var result = new ArrayList<Event>()
    for (row in _repo.eventsAfter(executionId, afterSeq)) {
      var payload = Json.MAPPER.readValue(row.get("payload") as String, Map) as Map<String, Object>
      result.add(new Event(executionId, row.get("seq") as int, row.get("ts") as String, row.get("type") as String, payload))
    }
    return result
  }

  function subscribe(executionId : String, s : EventSubscriber) {
    _subscribers.computeIfAbsent(executionId, \ k -> new CopyOnWriteArrayList<EventSubscriber>()).add(s)
  }

  function unsubscribe(executionId : String, s : EventSubscriber) {
    var subs = _subscribers.get(executionId)
    if (subs != null) {
      subs.remove(s)
    }
  }
}
