const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor(name, level = LogLevel.INFO) {
    this.name = name;
    this.level = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : level;
  }

  _log(level, levelName, message, ...args) {
    if (level > this.level) return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.name}] [${levelName}]`;
    
    if (level === LogLevel.ERROR) {
      console.error(prefix, message, ...args);
    } else if (level === LogLevel.WARN) {
      console.warn(prefix, message, ...args);
    } else {
      console.log(prefix, message, ...args);
    }
  }

  error(message, ...args) {
    this._log(LogLevel.ERROR, 'ERROR', message, ...args);
  }

  warn(message, ...args) {
    this._log(LogLevel.WARN, 'WARN', message, ...args);
  }

  info(message, ...args) {
    this._log(LogLevel.INFO, 'INFO', message, ...args);
  }

  debug(message, ...args) {
    this._log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }
}

export function createLogger(name) {
  return new Logger(name);
}

export { LogLevel };