const MySQL8 = require('powersync-mysql-zongji');
const MySQLEvents = require('./index');

const MYSQL_CONFIG = {
  host: 'host',
  user: 'user',
  password: 'password',
  database: 'database',
};
const ZONGJI_CONFIG = {
  BinlogClass: MySQL8,
};

// const inicio = Date.now();

(async () => {
  let instance;

  async function startInstance() {
    console.log('🔄 Reconectando MySQLEvents...');
    instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);
    await instance.start({
      includeEvents: ['writerows', 'updaterows', 'deleterows'],
      startAtEnd: true,
    });
    console.log('✅ MySQLEvents reconectado correctamente.');
  }

  instance = new MySQLEvents(MYSQL_CONFIG, ZONGJI_CONFIG);
  // console.log(inicio);
  await instance.start({
    includeEvents: ['writerows', 'updaterows', 'deleterows'],
    startAtEnd: true,
  });

  instance.on('binlog', async (evt) => {
    if (!evt.tableMap) return;
    // code
  });

  instance.binlogListener.on('error', console.error);
  instance.on('error', (err) => {
    console.error('Error:', err.code || err.message);
    if (
      ['ETIMEDOUT', 'ER_NET_READ_INTERRUPTED', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)
    ) {
      instance.stop().catch(() => {});
      setTimeout(startInstance, 5000);
    }
  });

  process.on('SIGINT', async () => {
    console.log('\nDeteniendo listener...');
    await instance.stop();
    console.log('Listener detenido. Saliendo.');
    process.exit(0);
  });

  await new Promise(() => {});
})();
