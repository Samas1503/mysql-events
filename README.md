# @samas1503/mysql-events

A [node.js](https://nodejs.org) package that watches a MySQL database and runs callbacks on matched events like updates on tables and/or specific columns.

This package is a fork of [rodrigogs/mysql-events](https://github.com/rodrigogs/mysql-events), updated to use [`mysql2`](https://github.com/sidorares/node-mysql2) and [`powersync-mysql-zongji`](https://github.com/powersync-ja/mysql-zongji) for MySQL 8 compatibility.

## Requirements

- MySQL with **binlog enabled** in `ROW` format
- A MySQL user with `REPLICATION SLAVE` and `REPLICATION CLIENT` privileges

```sql
CREATE USER 'zongji'@'%' IDENTIFIED BY 'your_password';
GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT ON *.* TO 'zongji'@'%';
FLUSH PRIVILEGES;
```

Also make sure your MySQL config has:
```ini
[mysqld]
log_bin           = mysql-bin
binlog_format     = ROW
binlog_row_image  = FULL
server-id         = 1
```

## Install

```sh
npm install @samas1503/mysql-events
```

Or install directly from GitHub:

```sh
npm install github:Samas1503/mysql-events#master
```

## Quick Start

```javascript
const ZongJi    = require('powersync-mysql-zongji');
const MySQLEvents = require('@samas1503/mysql-events');

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'zongji',
  password: 'your_password',
  database: 'your_database',
  charset: 'UTF8MB4_GENERAL_CI',
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
};

(async () => {
  const instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);

  await instance.start({
    includeEvents: ['writerows', 'updaterows', 'deleterows'],
    includeSchema: { your_database: ['your_table'] }, // optional filter
    startAtEnd: true,
  });

  console.log('Listening for binlog events...');

  // Listen to raw binlog events
  instance.on('binlog', (evt) => {
    if (!evt.tableMap) return;
    console.log(evt.getEventName(), evt.tableMap[evt.tableId]?.tableName);
    console.log(evt.rows);
  });

  // Listen to structured trigger events (via addTrigger)
  instance.addTrigger({
    name: 'MY_TRIGGER',
    expression: 'your_database.your_table',
    statement: MySQLEvents.STATEMENTS.ALL,
    onEvent: (event) => {
      console.log(event);
    },
  });

  instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
  instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);

  process.on('SIGINT', async () => {
    await instance.stop();
    process.exit(0);
  });
})();
```

## Reconnection Example

```javascript
const ZongJi    = require('powersync-mysql-zongji');
const MySQLEvents = require('@samas1503/mysql-events');

const MYSQL_CONFIG = { /* ... */ };
const ZONGJI_CONFIG = { BinlogClass: ZongJi };

let instance;

async function start() {
  instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);

  await instance.start({
    includeEvents: ['writerows', 'updaterows', 'deleterows'],
    startAtEnd: true,
  });

  instance.on('binlog', (evt) => {
    // handle event
  });

  instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, (err) => {
    console.error('Connection error:', err.message);
    if (['ETIMEDOUT', 'ER_NET_READ_INTERRUPTED', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)) {
      instance.stop().catch(() => {});
      setTimeout(start, 5000);
    }
  });

  instance.binlogListener?.on('error', (err) => {
    console.error('Binlog error:', err.message);
    setTimeout(start, 5000);
  });
}

start();
```

## Usage

### `new MySQLEvents(connection, options)`

| Argument     | Type     | Description |
|------------- |----------|-------------|
| `connection` | `Object` | mysql2-compatible config object |
| `options`    | `Object` | ZongJi options. Must include `BinlogClass` from `powersync-mysql-zongji` |

```javascript
const instance = new MySQLEvents(
  { host, user, password, database },
  { BinlogClass: ZongJi, reconnectTimeout: 10000 }
);
```

---

### `instance.start(binlogOptions)`

Connects to MySQL, resolves the current binlog position (if `startAtEnd: true`) and starts the ZongJi listener.

```javascript
await instance.start({
  includeEvents: ['writerows', 'updaterows', 'deleterows'],
  includeSchema: { my_db: ['table1', 'table2'] }, // optional
  startAtEnd: true,
});
```

---

### `instance.stop()`

Stops ZongJi and closes the MySQL connection.

```javascript
await instance.stop();
```

---

### `instance.pause()` / `instance.resume()`

Pause and resume the binlog listener without closing the connection. Useful when processing is slower than the event rate.

```javascript
instance.pause();
// ... later
instance.resume();
```

---

### `instance.addTrigger({ name, expression, statement, onEvent })`

Adds a structured trigger that fires on matching schema/table/column events.

```javascript
instance.addTrigger({
  name: 'MY_TRIGGER',
  expression: 'my_schema.my_table.my_column', // or wildcards: 'my_schema.*'
  statement: MySQLEvents.STATEMENTS.INSERT,
  onEvent: async (event) => {
    await doSomething(event);
  },
});
```

**Expression wildcards:**

| Expression              | Matches                                 |
|-------------------------|-----------------------------------------|
| `*`                     | All schemas, tables and columns         |
| `my_schema.*`           | All tables in `my_schema`              |
| `*.my_table`            | `my_table` in any schema               |
| `my_schema.my_table`    | Specific table                          |
| `my_schema.my_table.col`| Specific column                         |

---

### `instance.removeTrigger({ name, expression, statement })`

Removes a previously added trigger.

```javascript
instance.removeTrigger({
  name: 'MY_TRIGGER',
  expression: 'my_schema.my_table',
  statement: MySQLEvents.STATEMENTS.INSERT,
});
```

---

### Instance Events

| Event                              | Description                          |
|------------------------------------|--------------------------------------|
| `MySQLEvents.EVENTS.STARTED`       | Emitted when the listener starts     |
| `MySQLEvents.EVENTS.STOPPED`       | Emitted when the listener stops      |
| `MySQLEvents.EVENTS.PAUSED`        | Emitted on pause                     |
| `MySQLEvents.EVENTS.RESUMED`       | Emitted on resume                    |
| `MySQLEvents.EVENTS.BINLOG`        | Raw binlog event from ZongJi         |
| `MySQLEvents.EVENTS.TRIGGER_ERROR` | Error thrown inside a trigger        |
| `MySQLEvents.EVENTS.CONNECTION_ERROR` | MySQL connection error             |
| `MySQLEvents.EVENTS.ZONGJI_ERROR`  | ZongJi internal error                |

```javascript
instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
instance.on(MySQLEvents.EVENTS.BINLOG, (evt) => console.log(evt));
```

---

### Statements

| Constant                    | SQL Operation |
|-----------------------------|---------------|
| `MySQLEvents.STATEMENTS.ALL`    | INSERT + UPDATE + DELETE |
| `MySQLEvents.STATEMENTS.INSERT` | INSERT only   |
| `MySQLEvents.STATEMENTS.UPDATE` | UPDATE only   |
| `MySQLEvents.STATEMENTS.DELETE` | DELETE only   |

---

## Trigger Event Object

When using `addTrigger`, the `onEvent` callback receives:

```javascript
{
  type: 'INSERT | UPDATE | DELETE',
  schema: 'schema_name',
  table: 'table_name',
  affectedRows: [
    {
      before: { column1: 'old_value', ... },
      after:  { column1: 'new_value', ... },
    }
  ],
  affectedColumns: ['column1', 'column2'],
  timestamp: 1530645380029,
  nextPosition: 1343,
  binlogName: 'mysql-bin.000001',
}
```

## LICENSE
[BSD-3-Clause](https://github.com/Samas1503/mysql-events/blob/master/LICENSE) © Samas1503
