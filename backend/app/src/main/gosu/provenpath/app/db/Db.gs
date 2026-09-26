package provenpath.app.db

uses com.zaxxer.hikari.HikariConfig
uses com.zaxxer.hikari.HikariDataSource
uses java.sql.Connection
uses java.sql.PreparedStatement
uses java.sql.ResultSet
uses java.sql.Types
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses org.flywaydb.core.Flyway
uses org.postgresql.util.PGobject

/**
 * Thin JDBC helper: pooled connections, Flyway migrations, and list-of-maps queries.
 * JSONB columns come back as JSON strings, timestamps as ISO-8601 strings.
 */
class Db {

  var _ds : HikariDataSource

  construct(url : String, user : String, password : String) {
    var cfg = new HikariConfig()
    cfg.JdbcUrl = url
    cfg.Username = user
    cfg.Password = password
    cfg.MaximumPoolSize = 10
    cfg.PoolName = "provenpath"
    _ds = new HikariDataSource(cfg)
  }

  function migrate() {
    Flyway.configure().dataSource(_ds).locations(new String[]{"classpath:db/migration"}).load().migrate()
  }

  /** Drops everything and re-migrates. Tests only. */
  function resetForTests() {
    var flyway = Flyway.configure().dataSource(_ds).locations(new String[]{"classpath:db/migration"}).cleanDisabled(false).load()
    flyway.clean()
    flyway.migrate()
  }

  function close() {
    _ds.close()
  }

  function query(sql : String, params : List<Object>) : List<Map<String, Object>> {
    var conn = _ds.Connection
    try {
      return query(conn, sql, params)
    } finally {
      conn.close()
    }
  }

  function queryOne(sql : String, params : List<Object>) : Map<String, Object> {
    var rows = query(sql, params)
    return rows.Empty ? null : rows.get(0)
  }

  function update(sql : String, params : List<Object>) : int {
    var conn = _ds.Connection
    try {
      return update(conn, sql, params)
    } finally {
      conn.close()
    }
  }

  /** Runs the block in one transaction; commits on success, rolls back on any exception. */
  function inTx(work : block(c : Connection) : Object) : Object {
    var conn = _ds.Connection
    try {
      conn.AutoCommit = false
      var result = work(conn)
      conn.commit()
      return result
    } catch (e : Throwable) {
      conn.rollback()
      throw e
    } finally {
      conn.AutoCommit = true
      conn.close()
    }
  }

  static function query(conn : Connection, sql : String, params : List<Object>) : List<Map<String, Object>> {
    var ps = conn.prepareStatement(sql)
    try {
      bind(ps, params)
      var rs = ps.executeQuery()
      try {
        return readRows(rs)
      } finally {
        rs.close()
      }
    } finally {
      ps.close()
    }
  }

  static function update(conn : Connection, sql : String, params : List<Object>) : int {
    var ps = conn.prepareStatement(sql)
    try {
      bind(ps, params)
      return ps.executeUpdate()
    } finally {
      ps.close()
    }
  }

  static function textArray(conn : Connection, values : List<String>) : java.sql.Array {
    return conn.createArrayOf("text", values.toArray())
  }

  private static function bind(ps : PreparedStatement, params : List<Object>) {
    if (params == null) {
      return
    }
    var i = 1
    for (p in params) {
      if (p == null) {
        ps.setNull(i, Types.NULL)
      } else if (p typeis byte[]) {
        ps.setBytes(i, p)
      } else if (p typeis java.sql.Array) {
        ps.setArray(i, p)
      } else {
        ps.setObject(i, p)
      }
      i++
    }
  }

  private static function readRows(rs : ResultSet) : List<Map<String, Object>> {
    var rows = new ArrayList<Map<String, Object>>()
    var meta = rs.MetaData
    var cols = meta.ColumnCount
    while (rs.next()) {
      var row = new LinkedHashMap<String, Object>()
      for (c in 1..cols) {
        row.put(meta.getColumnLabel(c).toLowerCase(), convert(rs.getObject(c)))
      }
      rows.add(row)
    }
    return rows
  }

  private static function convert(v : Object) : Object {
    if (v == null) {
      return null
    }
    if (v typeis PGobject) {
      return v.Value
    }
    if (v typeis java.sql.Timestamp) {
      return v.toInstant().toString()
    }
    if (v typeis java.sql.Date) {
      return v.toString()
    }
    if (v typeis java.util.UUID) {
      return v.toString()
    }
    if (v typeis java.sql.Array) {
      var arr = v.Array as Object[]
      var list = new ArrayList<Object>()
      for (x in arr) {
        list.add(x)
      }
      return list
    }
    return v
  }
}
