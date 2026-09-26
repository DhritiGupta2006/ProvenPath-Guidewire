package provenpath.app.events

uses java.util.ArrayList
uses java.util.List
uses java.util.concurrent.locks.ReentrantLock
uses provenpath.contracts.Event

/**
 * Subscribe-then-replay without gaps or duplicates:
 *   1. subscribe (live events are buffered while replaying),
 *   2. send stored history,
 *   3. finishReplay() flushes the buffer, skipping anything already sent.
 * The actual sending is delegated, so the same logic serves SSE and tests.
 */
class ReplayingSubscriber implements EventSubscriber {

  var _send : block(ev : Event)
  var _lock = new ReentrantLock()
  var _replaying = true
  var _buffer = new ArrayList<Event>()
  var _lastSent : int as readonly LastSent

  construct(afterSeq : int, send : block(ev : Event)) {
    _lastSent = afterSeq
    _send = send
  }

  override function deliver(ev : Event) {
    _lock.lock()
    try {
      if (_replaying) {
        _buffer.add(ev)
      } else {
        sendIfNew(ev)
      }
    } finally {
      _lock.unlock()
    }
  }

  function replay(history : List<Event>) {
    _lock.lock()
    try {
      for (ev in history) {
        sendIfNew(ev)
      }
      for (ev in _buffer) {
        sendIfNew(ev)
      }
      _buffer.clear()
      _replaying = false
    } finally {
      _lock.unlock()
    }
  }

  private function sendIfNew(ev : Event) {
    if (ev.Seq > _lastSent) {
      _send(ev)
      _lastSent = ev.Seq
    }
  }
}
