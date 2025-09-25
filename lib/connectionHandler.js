// const debug = require('debug')();
const mysql = require('mysql2/promise'); // usamos solo la API moderna

const connectionHandler = async (connection) => {
  // Caso: ya es un pool de mysql2
  if (connection && typeof connection.getConnection === 'function') {
    // console.log('Reusing pool');
    return connection;
  }

  // Caso: ya es una conexión activa
  if (connection && connection.config && typeof connection.query === 'function') {
    // console.log('Reusing connection');
    try {
      await connection.ping(); // Verifica si la conexión sigue viva
    } catch {
      // console.log('Connection lost, recreating');
      connection = await mysql.createConnection(connection.config);
    }
    return connection;
  }

  // Caso: string de conexión
  if (typeof connection === 'string') {
    // console.log('Creating connection from string');
    return mysql.createConnection(connection);
  }

  // Caso: objeto de configuración
  if (typeof connection === 'object') {
    // console.log('Creating connection from object');
    if (connection.isPool) {
      return mysql.createPool(connection);
    }
    return mysql.createConnection(connection);
  }

  throw new Error('Invalid connection input');
};

module.exports = connectionHandler;
