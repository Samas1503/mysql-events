const MySQLEvents = require("./index");
const ZongJi = require("powersync-mysql-zongji");

const MYSQL_CONFIG = {
  host: localhost,
  user: "zongji",
  password: "71Z9U3fI9Se9$*",
  database: "mpa",
  charset: "UTF8MB4_GENERAL_CI",
  connectTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};
const ZONGJI_CONFIG = {
  BinlogClass: ZongJi,
  reconnectTimeout: 10000,
  connectionOptions: {
    readTimeout: 0,
    writeTimeout: 0,
  },
  startAtEnd: true,
};


(async () => {
  let instance;

  function startZongJi() {
    instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);
  }

  instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);

  await instance.start({
    includeEvents: ["writerows", "updaterows", "deleterows"],
    includeSchema: { mpa: tables },
    startAtEnd: true,
  });

  instance.on("binlog", async (evt) => {
    if (!evt.tableMap) return;
    if (evt.getEventName() === "writerows") {
      console.log(evt.tableMap[evt.tableId].tableName);
      const [fila] = evt.rows;
      console.log(fila);
    }
  });

  instance.binlogListener?.on("error", console.error);
  instance.on("error", (err) => {
    console.error("Error:", err.code || err.message);

    // Reconectar automáticamente
    if (
      [
        "ETIMEDOUT",
        "ER_NET_READ_INTERRUPTED",
        "PROTOCOL_CONNECTION_LOST",
      ].includes(err.code)
    ) {
      instance.stop();
      setTimeout(startZongJi, 5000);
    }
  });

  process.on("SIGINT", async () => {
    console.log("\nDeteniendo listener...");
    await instance.stop();
    console.log("Listener detenido. Saliendo.");
    process.exit(0);
  });

  startZongJi();

  await new Promise(() => {});
})();
