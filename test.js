const MySQLEvents = require("./index");
const MySQL8 = require("powersync-mysql-zongji");

const MYSQL_CONFIG = {
  host: "host",
  user: "user",
  password: "password",
  database: "database",
};
const ZONGJI_CONFIG = {
  BinlogClass: MySQL8,
};

const inicio = Date.now(); 

(async () => {
  let instance;

  function startInstance() {
    instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);
  }

  instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);

  await instance.start({
    includeEvents: ["writerows", "updaterows", "deleterows"],
    startAtEnd: true,
  });

  instance.on("binlog", async (evt) => {
    if (!evt.tableMap) return;
      // code
  });

  instance.binlogListener?.on("error", console.error);
  instance.on("error", (err) => {
    console.error("Error:", err.code || err.message);
  });

  process.on("SIGINT", async () => {
    console.log("\nDeteniendo listener...");
    await instance.stop();
    console.log("Listener detenido. Saliendo.");
    process.exit(0);
  });

  startInstance();

  await new Promise(() => {});
})();
