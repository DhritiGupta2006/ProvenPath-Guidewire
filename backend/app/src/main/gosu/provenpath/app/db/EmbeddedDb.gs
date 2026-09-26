package provenpath.app.db

uses io.zonky.test.db.postgres.embedded.EmbeddedPostgres
uses java.io.File

/**
 * DB_MODE=embedded: runs a private PostgreSQL 16 process from binaries bundled in the jar.
 * Made for the Guidewire VM (Windows Server, non-admin user, no Docker, no Postgres install).
 * It is NOT PolicyCenter's H2 database; ProvenPath never touches PolicyCenter's DB.
 * Data persists in EMBEDDED_PG_DIR across restarts.
 */
class EmbeddedDb {

  static function start(dataDir : String, port : int) : Db {
    var dir = new File(dataDir)
    dir.mkdirs()
    var pg = EmbeddedPostgres.builder()
        .setDataDirectory(dir)
        .setCleanDataDirectory(false)
        .setPort(port)
        .start()
    Runtime.getRuntime().addShutdownHook(new Thread(\ -> {
      try {
        pg.close()
      } catch (e : Exception) {
        // already stopped
      }
    }))
    System.out.println("Embedded PostgreSQL running on port " + port + ", data in " + dir.AbsolutePath)
    return new Db(pg.getJdbcUrl("postgres", "postgres"), "postgres", "postgres")
  }
}
