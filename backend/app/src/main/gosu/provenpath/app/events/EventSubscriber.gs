package provenpath.app.events

uses provenpath.contracts.Event

interface EventSubscriber {
  /** Called by EventBus in seq order for every newly appended event. */
  function deliver(ev : Event)
}
