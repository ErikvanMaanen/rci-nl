// Centralized logging module for the RIBS Tracker application
const database = require('./database');

// Function to check if database is ready
function isDatabaseReady() {
  return database.isDatabaseReady();
}

// Function to mark database as ready (called from index.js after connection)
function setDatabaseReady() {
  database.setDatabaseReady();
}

/**
 * Centralized logging function that ensures all logs go to the database
 * @param {string} message - The log message
 * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param {string} source - Source of the log (SERVER, API, DATABASE, FRONTEND, etc.)
 */
async function log(message, level = 'INFO', source = 'SERVER') {
  const timestamp = new Date().toISOString();
  
  try {
    // Only log to database if connection is ready
    if (isDatabaseReady()) {
      await database.insertLog(message, level, source);
    }
    
    // Only log to console for WARN, ERROR, or important sources to reduce console spam
    if (level === 'WARN' || level === 'ERROR' || source === 'SERVER' || source === 'DATABASE') {
      const formattedMessage = `[${timestamp}] [${level}] [${source}] ${message}`;
      
      switch (level.toUpperCase()) {
        case 'ERROR':
          console.error(formattedMessage);
          break;
        case 'WARN':
          console.warn(formattedMessage);
          break;
        case 'DEBUG':
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }
  } catch (err) {
    // Fallback to console if database logging fails
    const fallbackMessage = `[${timestamp}] [${level}] [${source}] ${message}`;
    console.error(`[LOGGING_ERROR] Failed to log to database: ${err.message}`);
    console.log(`[FALLBACK] ${fallbackMessage}`);
  }
}

/**
 * Convenience methods for different log levels
 */
const logger = {
  info: (message, source = 'SERVER') => log(message, 'INFO', source),
  warn: (message, source = 'SERVER') => log(message, 'WARN', source),
  error: (message, source = 'SERVER') => log(message, 'ERROR', source),
  debug: (message, source = 'SERVER') => log(message, 'DEBUG', source),
  
  // Generic log method
  log: log,
  
  // Request logging helper
  request: (req, additionalInfo = '') => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const message = `${req.method} ${req.path} from IP ${ip}${additionalInfo ? ' - ' + additionalInfo : ''}`;
    return log(message, 'INFO', 'REQUEST');
  },
  
  // Database operation logging helper
  database: (operation, details = '') => {
    const message = `Database operation: ${operation}${details ? ' - ' + details : ''}`;
    return log(message, 'INFO', 'DATABASE');
  },
  
  // API operation logging helper
  api: (operation, details = '', level = 'INFO') => {
    const message = `API operation: ${operation}${details ? ' - ' + details : ''}`;
    return log(message, level, 'API');
  },
  
  // Function to mark database as ready
  setDatabaseReady: setDatabaseReady
};

module.exports = logger;
