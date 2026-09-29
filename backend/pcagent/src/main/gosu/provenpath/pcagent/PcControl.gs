package provenpath.pcagent

/** Stops and starts PolicyCenter. The real one runs PC_STOP_CMD / PC_START_CMD (gwb.bat on the VM). */
interface PcControl {
  /** Stops PolicyCenter and waits for the stop command to finish. */
  function stop()
  /** Starts PolicyCenter in the background and returns immediately. */
  function start()
  /** False once the started server process has exited (it should keep running). */
  function startedProcessAlive() : boolean
  /** Where the server's console output goes, for error messages. */
  property get LogHint() : String
}
