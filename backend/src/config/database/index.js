const url = process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim();

if (url) {
  const pg = require("./postgres");
  module.exports = {
    initDb: pg.initDb,
    get db() {
      return pg.db;
    },
    dbPath: pg.dbPath,
    get isPostgres() {
      return true;
    },
    getPool: pg.getPool,
  };
} else {
  const lite = require("./sqlite");
  module.exports = {
    initDb: lite.initDb,
    get db() {
      return lite.db;
    },
    dbPath: lite.dbPath,
    get isPostgres() {
      return false;
    },
    getPool: () => null,
  };
}
