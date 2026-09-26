package provenpath.app.db

uses io.zonky.test.db.postgres.embedded.EmbeddedPostgres
uses java.io.File
uses java.net.ServerSocket

/**
 * DB_MODE=embedded: runs a private PostgreSQL 16 process from binaries bundled in the jar.
 * Made for the Guidewire VM (Windows Server, non-admin user, no Docker, no Postgres install).
 * It is NOT PolicyCenter's H2 database; ProvenPath never touches PolicyCenter's DB.
 * Data persists in EMBEDDED_PG_DIR across restarts. The port is private: 0 = pick a free one.
 */
class EmbeddedDb {

  static function start(dataDir : String, port : int) : Db {
    var dir = new File(dataDir).CanonicalFile
    dir.mkdirs()
    stopOrphan(dir)
    var chosen = port > 0 ? port : freePort()
    if (port > 0 and !isFree(port)) {
      throw new IllegalStateException("EMBEDDED_PG_PORT " + port + " is already in use; unset it to pick a free port automatically")
    }
    var pg = EmbeddedPostgres.builder()
        .setDataDirectory(dir)
        .setCleanDataDirectory(false)
        .setPort(chosen)
        .start()
    Runtime.getRuntime().addShutdownHook(new Thread(\ -> {
      try {
        pg.close()
      } catch (e : Exception) {
        // already stopped
      }
    }))
    System.out.println("Embedded PostgreSQL running on port " + chosen + ", data in " + dir.Path)
    return new Db(pg.getJdbcUrl("postgres", "postgres"), "postgres", "postgres")
  }

  /**
   * If the backend was force-killed, its postgres may still hold the data dir (postmaster.pid with a live pid).
   * Stop that orphan so this start succeeds. Only a live postgres process with exactly that pid is touched.
   */
  private static function stopOrphan(dir : File) {
    var pidFile = new File(dir, "postmaster.pid")
    if (!pidFile.exists()) {
      return
    }
    try {
      var pid = Long.parseLong(java.nio.file.Files.readAllLines(pidFile.toPath()).get(0).trim())
      var handle = ProcessHandle.of(pid)
      if (handle.Present and handle.get().info().command().orElse("").toLowerCase().contains("postgres")) {
        System.out.println("Stopping orphaned embedded PostgreSQL (pid " + pid + ") from a previous run")
        handle.get().descendants().forEach(\ p -> { p.destroyForcibly() })
        handle.get().destroyForcibly()
        handle.get().onExit().get(10, java.util.concurrent.TimeUnit.SECONDS)
      }
    } catch (e : Exception) {
      System.out.println("Could not check " + pidFile + ": " + e.Message)
    }
  }

  private static function freePort() : int {
    var s = new ServerSocket(0)
    try {
      return s.LocalPort
    } finally {
      s.close()
    }
  }

  private static function isFree(port : int) : boolean {
    try {
      new ServerSocket(port).close()
      return true
    } catch (e : java.io.IOException) {
      return false
    }
  }
}
