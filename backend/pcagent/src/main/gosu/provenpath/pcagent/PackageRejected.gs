package provenpath.pcagent

/** Thrown when a package fails verification; the agent then writes nothing. */
class PackageRejected extends RuntimeException {
  construct(msg : String) {
    super(msg)
  }
}
