const EventEmitter = require('events');
const mysql = require('mysql2/promise');
// const debug = require('debugger');

const eventHandler = require('./eventHandler');
const connectionHandler = require('./connectionHandler');
const EVENTS = require('./EVENTS.enum');
const STATEMENTS = require('./STATEMENTS.enum');

class MySQLEvents extends EventEmitter {
  /**
   * @param {Object|mysql.Connection|string} connection
   * @param {Object} options
   */
  constructor(connection, options = {}) {
    super();

    this.connectionConfig = connection; // Puede ser config object, pool o string
    this.options = options;

    this.isStarted = false;
    this.isPaused = false;
    this.binlogListener = null;
    this.expressions = {};
  }

  static get EVENTS() {
    return EVENTS;
  }

  static get STATEMENTS() {
    return STATEMENTS;
  }

  /** Registra triggers de evento */
  addTrigger({ name, expression, statement = STATEMENTS.ALL, onEvent }) {
    if (!name) throw new Error('Missing trigger name');
    if (!expression) throw new Error('Missing trigger expression');
    if (typeof onEvent !== 'function') throw new Error('onEvent must be a function');

    this.expressions[expression] = this.expressions[expression] || { statements: {} };
    const stmts = this.expressions[expression].statements;
    stmts[statement] = stmts[statement] || [];

    if (stmts[statement].some(t => t.name === name)) {
      throw new Error(`Trigger "${name}" already exists for "${expression}"`);
    }

    stmts[statement].push({ name, onEvent });
  }

  removeTrigger({ name, expression, statement = STATEMENTS.ALL }) {
    const exp = this.expressions[expression];
    if (!exp || !exp.statements[statement]) return;

    const index = exp.statements[statement].findIndex(t => t.name === name);
    if (index >= 0) exp.statements[statement].splice(index, 1);
  }

  /** Procesa un evento de binlog */
  async _handleEvent(event) {
    event = eventHandler.normalizeEvent(event);
    const triggers = eventHandler.findTriggers(event, this.expressions);

    await Promise.all(triggers.map(async trigger => {
      try {
        await trigger.onEvent(event);
      } catch (err) {
        this.emit(EVENTS.TRIGGER_ERROR, { trigger, error: err });
      }
    }));
  }

  /** Inicializa la conexión a MySQL */
  async _initConnection() {
    // console.log('Initializing MySQL connection...');
    this.connection = await connectionHandler(this.connectionConfig);
    this.connection.on('error', err => this.emit(EVENTS.CONNECTION_ERROR, err));
  }

  /** Inicializa el listener de binlogs */
  _initBinlogListener() {
    if (!this.binlogListener) return;

    this.binlogListener.on('error', err => this.emit(EVENTS.ZONGJI_ERROR, err));
    this.binlogListener.on('binlog', event => {
      this.emit(EVENTS.BINLOG, event);
      this._handleEvent(event);
    });
  }

  /** Obtiene el binlog actual y su posición desde MySQL */
  async _getLatestBinlogPosition() {
    const conn = await mysql.createConnection(this.connectionConfig);
    const [rows] = await conn.query('SHOW MASTER STATUS');
    await conn.end();

    if (!rows.length) {
      throw new Error('SHOW MASTER STATUS no devolvió resultados (¿tiene habilitado binlog?)');
    }

    const { File: filename, Position: position } = rows[0];
    return { filename, position };
  }

  /** Inicia la escucha de binlogs */
  async start(binlogOptions = {}) {
    if (this.isStarted) return;

    await this._initConnection();

    if (binlogOptions.startAtEnd) {
      try {
        const { filename, position } = await this._getLatestBinlogPosition();
        // console.log(`📘 Iniciando desde binlog actual: ${filename} @ ${position}`);
        binlogOptions.filename = filename;
        binlogOptions.position = position;
        delete binlogOptions.startAtEnd;
      } catch (err) {
        console.error("⚠️ No se pudo obtener posición actual del binlog:", err.message);
      }
    }

    // console.log('Starting binlog listener...');
    // binlogListener puede ser un fork de ZongJi o mysql-binlog-connector    
    this.binlogListener = new (this.options.BinlogClass)(this.connectionConfig, { ...this.options, ...binlogOptions });

    this._initBinlogListener();

    await this.binlogListener.start();
    this.isStarted = true;
    this.emit(EVENTS.STARTED);
    // console.log('✅ MySQLEvents started');
  }

  /** Detiene la escucha y cierra la conexión */
  async stop() {
    if (!this.isStarted) return;

    console.log('Stopping binlog listener...');
    if (this.binlogListener) {
      await this.binlogListener.stop();
      this.binlogListener = null;
    }

    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }

    this.isStarted = false;
    this.emit(EVENTS.STOPPED);
    console.log('MySQLEvents stopped');
  }

  pause() {
    if (!this.isStarted || this.isPaused) return;
    if (this.binlogListener?.pause) this.binlogListener.pause();
    this.isPaused = true;
    this.emit(EVENTS.PAUSED);
  }

  resume() {
    if (!this.isStarted || !this.isPaused) return;
    if (this.binlogListener?.resume) this.binlogListener.resume();
    this.isPaused = false;
    this.emit(EVENTS.RESUMED);
  }
}

module.exports = MySQLEvents;
