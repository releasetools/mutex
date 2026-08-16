#!/usr/bin/env node
import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 785:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
// This is an empty module that is served up when outside of a workerd environment
// See the `exports` field in package.json
exports["default"] = {};
//# sourceMappingURL=empty.js.map

/***/ }),

/***/ 6122:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



//Parse method copied from https://github.com/brianc/node-postgres
//Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
//MIT License

//parses a connection string
function parse(str, options = {}) {
  //unix socket
  if (str.charAt(0) === '/') {
    const config = str.split(' ')
    return { host: config[0], database: config[1] }
  }

  // Check for empty host in URL

  const config = Object.create(null)
  let result
  let dummyHost = false
  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
    // Ensure spaces are encoded as %20
    str = encodeURI(str).replace(/%25(\d\d)/g, '%$1')
  }

  try {
    try {
      result = new URL(str, 'postgres://base')
    } catch (e) {
      // The URL is invalid so try again with a dummy host
      result = new URL(str.replace('@/', '@___DUMMY___/'), 'postgres://base')
      dummyHost = true
    }
  } catch (err) {
    // Remove the input from the error message to avoid leaking sensitive information
    err.input && (err.input = '*****REDACTED*****')
    throw err
  }

  // We'd like to use Object.fromEntries() here but Node.js 10 does not support it
  for (const entry of result.searchParams.entries()) {
    config[entry[0]] = entry[1]
  }

  config.user = config.user || decodeURIComponent(result.username)
  config.password = config.password || decodeURIComponent(result.password)

  if (result.protocol == 'socket:') {
    config.host = decodeURI(result.pathname)
    config.database = result.searchParams.get('db')
    config.client_encoding = result.searchParams.get('encoding')
    return config
  }
  const hostname = dummyHost ? '' : result.hostname
  if (!config.host) {
    // Only set the host if there is no equivalent query param.
    config.host = decodeURIComponent(hostname)
  } else if (hostname && /^%2f/i.test(hostname)) {
    // Only prepend the hostname to the pathname if it is not a URL encoded Unix socket host.
    result.pathname = hostname + result.pathname
  }
  if (!config.port) {
    // Only set the port if there is no equivalent query param.
    config.port = result.port
  }

  const pathname = result.pathname.slice(1) || null
  config.database = pathname ? decodeURI(pathname) : null

  if (config.ssl === 'true' || config.ssl === '1') {
    config.ssl = true
  }

  if (config.ssl === '0') {
    config.ssl = false
  }

  if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
    config.ssl = {}
  }

  // sslnegotiation=direct implies SSL is in use (libpq requires sslmode>=require),
  // so enable SSL if the connection string did not otherwise configure it.
  if (config.sslnegotiation === 'direct' && config.ssl === undefined) {
    config.ssl = true
  }

  // Only try to load fs if we expect to read from the disk
  const fs = config.sslcert || config.sslkey || config.sslrootcert ? __nccwpck_require__(9896) : null

  if (config.sslcert) {
    config.ssl.cert = fs.readFileSync(config.sslcert).toString()
  }

  if (config.sslkey) {
    config.ssl.key = fs.readFileSync(config.sslkey).toString()
  }

  if (config.sslrootcert) {
    config.ssl.ca = fs.readFileSync(config.sslrootcert).toString()
  }

  if (options.useLibpqCompat && config.uselibpqcompat) {
    throw new Error('Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.')
  }

  if (config.uselibpqcompat === 'true' || options.useLibpqCompat) {
    switch (config.sslmode) {
      case 'disable': {
        config.ssl = false
        break
      }
      case 'prefer': {
        config.ssl.rejectUnauthorized = false
        break
      }
      case 'require': {
        if (config.sslrootcert) {
          // If a root CA is specified, behavior of `sslmode=require` will be the same as that of `verify-ca`
          config.ssl.checkServerIdentity = function () {}
        } else {
          config.ssl.rejectUnauthorized = false
        }
        break
      }
      case 'verify-ca': {
        if (!config.ssl.ca) {
          throw new Error(
            'SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security.'
          )
        }
        config.ssl.checkServerIdentity = function () {}
        break
      }
      case 'verify-full': {
        break
      }
    }
  } else {
    switch (config.sslmode) {
      case 'disable': {
        config.ssl = false
        break
      }
      case 'prefer':
      case 'require':
      case 'verify-ca':
      case 'verify-full': {
        if (config.sslmode !== 'verify-full') {
          deprecatedSslModeWarning(config.sslmode)
        }
        break
      }
      case 'no-verify': {
        config.ssl.rejectUnauthorized = false
        break
      }
    }
  }

  return config
}

// convert pg-connection-string ssl config to a ClientConfig.ConnectionOptions
function toConnectionOptions(sslConfig) {
  const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
    // we explicitly check for undefined and null instead of `if (value)` because some
    // options accept falsy values. Example: `ssl.rejectUnauthorized = false`
    if (value !== undefined && value !== null) {
      c[key] = value
    }

    return c
  }, Object.create(null))

  return connectionOptions
}

// convert pg-connection-string config to a ClientConfig
function toClientConfig(config) {
  const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
    if (key === 'ssl') {
      const sslConfig = value

      if (typeof sslConfig === 'boolean') {
        c[key] = sslConfig
      }

      if (typeof sslConfig === 'object') {
        c[key] = toConnectionOptions(sslConfig)
      }
    } else if (value !== undefined && value !== null) {
      if (key === 'port') {
        // when port is not specified, it is converted into an empty string
        // we want to avoid NaN or empty string as a values in ClientConfig
        if (value !== '') {
          const v = parseInt(value, 10)
          if (isNaN(v)) {
            throw new Error(`Invalid ${key}: ${value}`)
          }

          c[key] = v
        }
      } else {
        c[key] = value
      }
    }

    return c
  }, Object.create(null))

  return poolConfig
}

// parses a connection string into ClientConfig
function parseIntoClientConfig(str) {
  return toClientConfig(parse(str))
}

function deprecatedSslModeWarning(sslmode) {
  if (!deprecatedSslModeWarning.warned && typeof process !== 'undefined' && process.emitWarning) {
    deprecatedSslModeWarning.warned = true
    process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`)
  }
}

module.exports = parse

parse.parse = parse
parse.toClientConfig = toClientConfig
parse.parseIntoClientConfig = parseIntoClientConfig


/***/ }),

/***/ 8787:
/***/ ((module, exports, __nccwpck_require__) => {



// reserved Postgres words
var reservedMap = __nccwpck_require__(3139);

var fmtPattern = {
    ident: 'I',
    literal: 'L',
    string: 's',
};

// convert to Postgres default ISO 8601 format
function formatDate(date) {
    date = date.replace('T', ' ');
    date = date.replace('Z', '+00');
    return date;
}

function isReserved(value) {
    if (reservedMap[value.toUpperCase()]) {
        return true;
    }
    return false;
}

function arrayToList(useSpace, array, formatter) {
    var sql = '';
    var temp = [];

    sql += useSpace ? ' (' : '(';
    for (var i = 0; i < array.length; i++) {
      sql += (i === 0 ? '' : ', ') + formatter(array[i]);
    }
    sql += ')';

    return sql;
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
function quoteIdent(value) {

    if (value === undefined || value === null) {
        throw new Error('SQL identifier cannot be null or undefined');
    } else if (value === false) {
        return '"f"';
    } else if (value === true) {
        return '"t"';
    } else if (value instanceof Date) {
        return '"' + formatDate(value.toISOString()) + '"';
    } else if (value instanceof Buffer) {
        throw new Error('SQL identifier cannot be a buffer');
    } else if (Array.isArray(value) === true) {
        var temp = [];
        for (var i = 0; i < value.length; i++) {
            if (Array.isArray(value[i]) === true) {
                throw new Error('Nested array to grouped list conversion is not supported for SQL identifier');
            } else {
                temp.push(quoteIdent(value[i]));
            }
        }
        return temp.toString();
    } else if (value === Object(value)) {
        throw new Error('SQL identifier cannot be an object');
    }

    var ident = value.toString().slice(0); // create copy

    // do not quote a valid, unquoted identifier
    if (/^[a-z_][a-z0-9_$]*$/.test(ident) === true && isReserved(ident) === false) {
        return ident;
    }

    var quoted = '"';

    for (var i = 0; i < ident.length; i++) {
        var c = ident[i];
        if (c === '"') {
            quoted += c + c;
        } else {
            quoted += c;
        }
    }

    quoted += '"';

    return quoted;
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
function quoteLiteral(value) {

    var literal = null;
    var explicitCast = null;

    if (value === undefined || value === null) {
        return 'NULL';
    } else if (value === false) {
        return "'f'";
    } else if (value === true) {
        return "'t'";
    } else if (value instanceof Date) {
        return "'" + formatDate(value.toISOString()) + "'";
    } else if (value instanceof Buffer) {
        return "E'\\\\x" + value.toString('hex') + "'";
    } else if (Array.isArray(value) === true) {
        var temp = [];
        for (var i = 0; i < value.length; i++) {
            if (Array.isArray(value[i]) === true) {
                temp.push(arrayToList(i !== 0, value[i], quoteLiteral))
            } else {
                temp.push(quoteLiteral(value[i]));
            }
        }
        return temp.toString();
    } else if (value === Object(value)) {
        explicitCast = 'jsonb';
        literal = JSON.stringify(value);
    } else {
        literal = value.toString().slice(0); // create copy
    }

    var hasBackslash = false;
    var quoted = '\'';

    for (var i = 0; i < literal.length; i++) {
        var c = literal[i];
        if (c === '\'') {
            quoted += c + c;
        } else if (c === '\\') {
            quoted += c + c;
            hasBackslash = true;
        } else {
            quoted += c;
        }
    }

    quoted += '\'';

    if (hasBackslash === true) {
        quoted = 'E' + quoted;
    }

    if (explicitCast) {
        quoted += '::' + explicitCast;
    }

    return quoted;
};

function quoteString(value) {

    if (value === undefined || value === null) {
        return '';
    } else if (value === false) {
        return 'f';
    } else if (value === true) {
        return 't';
    } else if (value instanceof Date) {
        return formatDate(value.toISOString());
    } else if (value instanceof Buffer) {
        return '\\x' + value.toString('hex');
    } else if (Array.isArray(value) === true) {
        var temp = [];
        for (var i = 0; i < value.length; i++) {
            if (value[i] !== null && value[i] !== undefined) {
                if (Array.isArray(value[i]) === true) {
                    temp.push(arrayToList(i !== 0, value[i], quoteString));
                } else {
                    temp.push(quoteString(value[i]));
                }
            }
        }
        return temp.toString();
    } else if (value === Object(value)) {
        return JSON.stringify(value);
    }

    return value.toString().slice(0); // return copy
}

function config(cfg) {

    // default
    fmtPattern.ident = 'I';
    fmtPattern.literal = 'L';
    fmtPattern.string = 's';

    if (cfg && cfg.pattern) {
        if (cfg.pattern.ident) { fmtPattern.ident = cfg.pattern.ident; }
        if (cfg.pattern.literal) { fmtPattern.literal = cfg.pattern.literal; }
        if (cfg.pattern.string) { fmtPattern.string = cfg.pattern.string; }
    }
}

function formatWithArray(fmt, parameters) {

    var index = 0;
    var params = parameters;

    var re = '%(%|(\\d+\\$)?[';
    re += fmtPattern.ident;
    re += fmtPattern.literal;
    re += fmtPattern.string;
    re += '])';
    re = new RegExp(re, 'g');

    return fmt.replace(re, function(_, type) {

        if (type === '%') {
            return '%';
        }

        var position = index;
        var tokens = type.split('$');

        if (tokens.length > 1) {
            position = parseInt(tokens[0]) - 1;
            type = tokens[1];
        }

        if (position < 0) {
            throw new Error('specified argument 0 but arguments start at 1');
        } else if (position > params.length - 1) {
            throw new Error('too few arguments');
        }

        index = position + 1;

        if (type === fmtPattern.ident) {
            return quoteIdent(params[position]);
        } else if (type === fmtPattern.literal) {
            return quoteLiteral(params[position]);
        } else if (type === fmtPattern.string) {
            return quoteString(params[position]);
        }
    });
}

function format(fmt) {
    var args = Array.prototype.slice.call(arguments);
    args = args.slice(1); // first argument is fmt
    return formatWithArray(fmt, args);
}

exports = module.exports = format;
exports.config = config;
exports.ident = quoteIdent;
exports.literal = quoteLiteral;
exports.string = quoteString;
exports.withArray = formatWithArray;

/***/ }),

/***/ 3139:
/***/ ((module) => {

//
// PostgreSQL reserved words
//
module.exports = {
    "AES128": true,
    "AES256": true,
    "ALL": true,
    "ALLOWOVERWRITE": true,
    "ANALYSE": true,
    "ANALYZE": true,
    "AND": true,
    "ANY": true,
    "ARRAY": true,
    "AS": true,
    "ASC": true,
    "AUTHORIZATION": true,
    "BACKUP": true,
    "BETWEEN": true,
    "BINARY": true,
    "BLANKSASNULL": true,
    "BOTH": true,
    "BYTEDICT": true,
    "CASE": true,
    "CAST": true,
    "CHECK": true,
    "COLLATE": true,
    "COLUMN": true,
    "CONSTRAINT": true,
    "CREATE": true,
    "CREDENTIALS": true,
    "CROSS": true,
    "CURRENT_DATE": true,
    "CURRENT_TIME": true,
    "CURRENT_TIMESTAMP": true,
    "CURRENT_USER": true,
    "CURRENT_USER_ID": true,
    "DEFAULT": true,
    "DEFERRABLE": true,
    "DEFLATE": true,
    "DEFRAG": true,
    "DELTA": true,
    "DELTA32K": true,
    "DESC": true,
    "DISABLE": true,
    "DISTINCT": true,
    "DO": true,
    "ELSE": true,
    "EMPTYASNULL": true,
    "ENABLE": true,
    "ENCODE": true,
    "ENCRYPT": true,
    "ENCRYPTION": true,
    "END": true,
    "EXCEPT": true,
    "EXPLICIT": true,
    "FALSE": true,
    "FOR": true,
    "FOREIGN": true,
    "FREEZE": true,
    "FROM": true,
    "FULL": true,
    "GLOBALDICT256": true,
    "GLOBALDICT64K": true,
    "GRANT": true,
    "GROUP": true,
    "GZIP": true,
    "HAVING": true,
    "IDENTITY": true,
    "IGNORE": true,
    "ILIKE": true,
    "IN": true,
    "INITIALLY": true,
    "INNER": true,
    "INTERSECT": true,
    "INTO": true,
    "IS": true,
    "ISNULL": true,
    "JOIN": true,
    "LEADING": true,
    "LEFT": true,
    "LIKE": true,
    "LIMIT": true,
    "LOCALTIME": true,
    "LOCALTIMESTAMP": true,
    "LUN": true,
    "LUNS": true,
    "LZO": true,
    "LZOP": true,
    "MINUS": true,
    "MOSTLY13": true,
    "MOSTLY32": true,
    "MOSTLY8": true,
    "NATURAL": true,
    "NEW": true,
    "NOT": true,
    "NOTNULL": true,
    "NULL": true,
    "NULLS": true,
    "OFF": true,
    "OFFLINE": true,
    "OFFSET": true,
    "OLD": true,
    "ON": true,
    "ONLY": true,
    "OPEN": true,
    "OR": true,
    "ORDER": true,
    "OUTER": true,
    "OVERLAPS": true,
    "PARALLEL": true,
    "PARTITION": true,
    "PERCENT": true,
    "PLACING": true,
    "PRIMARY": true,
    "RAW": true,
    "READRATIO": true,
    "RECOVER": true,
    "REFERENCES": true,
    "REJECTLOG": true,
    "RESORT": true,
    "RESTORE": true,
    "RIGHT": true,
    "SELECT": true,
    "SESSION_USER": true,
    "SIMILAR": true,
    "SOME": true,
    "SYSDATE": true,
    "SYSTEM": true,
    "TABLE": true,
    "TAG": true,
    "TDES": true,
    "TEXT255": true,
    "TEXT32K": true,
    "THEN": true,
    "TO": true,
    "TOP": true,
    "TRAILING": true,
    "TRUE": true,
    "TRUNCATECOLUMNS": true,
    "UNION": true,
    "UNIQUE": true,
    "USER": true,
    "USING": true,
    "VERBOSE": true,
    "WALLET": true,
    "WHEN": true,
    "WHERE": true,
    "WITH": true,
    "WITHOUT": true,
};

/***/ }),

/***/ 2299:
/***/ ((module) => {



// selected so (BASE - 1) * 0x100000000 + 0xffffffff is a safe integer
var BASE = 1000000;

function readInt8(buffer) {
	var high = buffer.readInt32BE(0);
	var low = buffer.readUInt32BE(4);
	var sign = '';

	if (high < 0) {
		high = ~high + (low === 0);
		low = (~low + 1) >>> 0;
		sign = '-';
	}

	var result = '';
	var carry;
	var t;
	var digits;
	var pad;
	var l;
	var i;

	{
		carry = high % BASE;
		high = high / BASE >>> 0;

		t = 0x100000000 * carry + low;
		low = t / BASE >>> 0;
		digits = '' + (t - BASE * low);

		if (low === 0 && high === 0) {
			return sign + digits + result;
		}

		pad = '';
		l = 6 - digits.length;

		for (i = 0; i < l; i++) {
			pad += '0';
		}

		result = pad + digits + result;
	}

	{
		carry = high % BASE;
		high = high / BASE >>> 0;

		t = 0x100000000 * carry + low;
		low = t / BASE >>> 0;
		digits = '' + (t - BASE * low);

		if (low === 0 && high === 0) {
			return sign + digits + result;
		}

		pad = '';
		l = 6 - digits.length;

		for (i = 0; i < l; i++) {
			pad += '0';
		}

		result = pad + digits + result;
	}

	{
		carry = high % BASE;
		high = high / BASE >>> 0;

		t = 0x100000000 * carry + low;
		low = t / BASE >>> 0;
		digits = '' + (t - BASE * low);

		if (low === 0 && high === 0) {
			return sign + digits + result;
		}

		pad = '';
		l = 6 - digits.length;

		for (i = 0; i < l; i++) {
			pad += '0';
		}

		result = pad + digits + result;
	}

	{
		carry = high % BASE;
		t = 0x100000000 * carry + low;
		digits = '' + t % BASE;

		return sign + digits + result;
	}
}

module.exports = readInt8;


/***/ }),

/***/ 7558:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


const EventEmitter = (__nccwpck_require__(4434).EventEmitter)

const NOOP = function () {}

const removeWhere = (list, predicate) => {
  const i = list.findIndex(predicate)

  return i === -1 ? undefined : list.splice(i, 1)[0]
}

class IdleItem {
  constructor(client, idleListener, timeoutId) {
    this.client = client
    this.idleListener = idleListener
    this.timeoutId = timeoutId
  }
}

class PendingItem {
  constructor(callback) {
    this.callback = callback
  }
}

function throwOnDoubleRelease() {
  throw new Error('Release called on client which has already been released to the pool.')
}

function promisify(Promise, callback) {
  if (callback) {
    return { callback: callback, result: undefined }
  }
  let rej
  let res
  const cb = function (err, client) {
    err ? rej(err) : res(client)
  }
  const result = new Promise(function (resolve, reject) {
    res = resolve
    rej = reject
  }).catch((err) => {
    // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
    // application that created the query
    Error.captureStackTrace(err)
    throw err
  })
  return { callback: cb, result: result }
}

function makeIdleListener(pool, client) {
  return function idleListener(err) {
    err.client = client

    client.removeListener('error', idleListener)
    client.on('error', () => {
      pool.log('additional client error after disconnection due to error', err)
    })
    pool._remove(client)
    // TODO - document that once the pool emits an error
    // the client has already been closed & purged and is unusable
    pool.emit('error', err, client)
  }
}

class Pool extends EventEmitter {
  constructor(options, Client) {
    super()
    this.options = Object.assign({}, options)

    if (options != null && 'password' in options) {
      // "hiding" the password so it doesn't show up in stack traces
      // or if the client is console.logged
      Object.defineProperty(this.options, 'password', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: options.password,
      })
    }
    if (options != null && options.ssl && options.ssl.key) {
      // "hiding" the ssl->key so it doesn't show up in stack traces
      // or if the client is console.logged
      Object.defineProperty(this.options.ssl, 'key', {
        enumerable: false,
      })
    }

    this.options.max = this.options.max || this.options.poolSize || 10
    this.options.min = this.options.min || 0
    this.options.maxUses = this.options.maxUses || Infinity
    this.options.allowExitOnIdle = this.options.allowExitOnIdle || false
    this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0
    this.log = this.options.log || function () {}
    this.Client = this.options.Client || Client || (__nccwpck_require__(3273).Client)
    this.Promise = this.options.Promise || global.Promise

    if (typeof this.options.idleTimeoutMillis === 'undefined') {
      this.options.idleTimeoutMillis = 10000
    }

    this._clients = []
    this._idle = []
    this._expired = new WeakSet()
    this._pendingQueue = []
    this._endCallback = undefined
    this.ending = false
    this.ended = false
  }

  _promiseTry(f) {
    const Promise = this.Promise
    if (typeof Promise.try === 'function') {
      return Promise.try(f)
    }
    return new Promise((resolve) => resolve(f()))
  }

  _isFull() {
    return this._clients.length >= this.options.max
  }

  _isAboveMin() {
    return this._clients.length > this.options.min
  }

  _pulseQueue() {
    this.log('pulse queue')
    if (this.ended) {
      this.log('pulse queue ended')
      return
    }
    if (this.ending) {
      this.log('pulse queue on ending')
      if (this._idle.length) {
        this._idle.slice().map((item) => {
          this._remove(item.client)
        })
      }
      if (!this._clients.length) {
        this.ended = true
        this._endCallback()
      }
      return
    }

    // if we don't have any waiting, do nothing
    if (!this._pendingQueue.length) {
      this.log('no queued requests')
      return
    }
    // if we don't have any idle clients and we have no more room do nothing
    if (!this._idle.length && this._isFull()) {
      return
    }
    const pendingItem = this._pendingQueue.shift()
    if (this._idle.length) {
      const idleItem = this._idle.pop()
      clearTimeout(idleItem.timeoutId)
      const client = idleItem.client
      client.ref && client.ref()
      const idleListener = idleItem.idleListener

      return this._acquireClient(client, pendingItem, idleListener, false)
    }
    if (!this._isFull()) {
      return this.newClient(pendingItem)
    }
    throw new Error('unexpected condition')
  }

  _remove(client, callback) {
    const removed = removeWhere(this._idle, (item) => item.client === client)

    if (removed !== undefined) {
      clearTimeout(removed.timeoutId)
    }

    this._clients = this._clients.filter((c) => c !== client)
    const context = this
    client.end(() => {
      context.emit('remove', client)

      if (typeof callback === 'function') {
        callback()
      }
    })
  }

  connect(cb) {
    if (this.ending) {
      const err = new Error('Cannot use a pool after calling end on the pool')
      return cb ? cb(err) : this.Promise.reject(err)
    }

    const response = promisify(this.Promise, cb)
    const result = response.result

    // if we don't have to connect a new client, don't do so
    if (this._isFull() || this._idle.length) {
      // if we have idle clients schedule a pulse immediately
      if (this._idle.length) {
        process.nextTick(() => this._pulseQueue())
      }

      if (!this.options.connectionTimeoutMillis) {
        this._pendingQueue.push(new PendingItem(response.callback))
        return result
      }

      const queueCallback = (err, res, done) => {
        clearTimeout(tid)
        response.callback(err, res, done)
      }

      const pendingItem = new PendingItem(queueCallback)

      // set connection timeout on checking out an existing client
      const tid = setTimeout(() => {
        // remove the callback from pending waiters because
        // we're going to call it with a timeout error
        removeWhere(this._pendingQueue, (i) => i.callback === queueCallback)
        pendingItem.timedOut = true
        response.callback(new Error('timeout exceeded when trying to connect'))
      }, this.options.connectionTimeoutMillis)

      if (tid.unref) {
        tid.unref()
      }

      this._pendingQueue.push(pendingItem)
      return result
    }

    this.newClient(new PendingItem(response.callback))

    return result
  }

  newClient(pendingItem) {
    const client = new this.Client(this.options)
    this._clients.push(client)
    const idleListener = makeIdleListener(this, client)

    this.log('checking client timeout')

    // connection timeout logic
    let tid
    let timeoutHit = false
    if (this.options.connectionTimeoutMillis) {
      tid = setTimeout(() => {
        if (client.connection) {
          this.log('ending client due to timeout')
          timeoutHit = true
          client.connection.stream.destroy()
        } else if (!client.isConnected()) {
          this.log('ending client due to timeout')
          timeoutHit = true
          // force kill the node driver, and let libpq do its teardown
          client.end()
        }
      }, this.options.connectionTimeoutMillis)
    }

    this.log('connecting new client')
    client.connect((err) => {
      if (tid) {
        clearTimeout(tid)
      }
      client.on('error', idleListener)
      if (err) {
        this.log('client failed to connect', err)
        // remove the dead client from our list of clients
        this._clients = this._clients.filter((c) => c !== client)
        if (timeoutHit) {
          err = new Error('Connection terminated due to connection timeout', { cause: err })
        }

        // this client won’t be released, so move on immediately
        this._pulseQueue()

        if (!pendingItem.timedOut) {
          pendingItem.callback(err, undefined, NOOP)
        }
      } else {
        this.log('new client connected')

        if (this.options.onConnect) {
          this._promiseTry(() => this.options.onConnect(client)).then(
            () => {
              this._afterConnect(client, pendingItem, idleListener)
            },
            (hookErr) => {
              this._clients = this._clients.filter((c) => c !== client)
              client.end(() => {
                this._pulseQueue()
                if (!pendingItem.timedOut) {
                  pendingItem.callback(hookErr, undefined, NOOP)
                }
              })
            }
          )
          return
        }

        return this._afterConnect(client, pendingItem, idleListener)
      }
    })
  }

  _afterConnect(client, pendingItem, idleListener) {
    if (this.options.maxLifetimeSeconds !== 0) {
      const maxLifetimeTimeout = setTimeout(() => {
        this.log('ending client due to expired lifetime')
        this._expired.add(client)
        const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client)
        if (idleIndex !== -1) {
          this._acquireClient(
            client,
            new PendingItem((err, client, clientRelease) => clientRelease()),
            idleListener,
            false
          )
        }
      }, this.options.maxLifetimeSeconds * 1000)

      maxLifetimeTimeout.unref()
      client.once('end', () => clearTimeout(maxLifetimeTimeout))
    }

    return this._acquireClient(client, pendingItem, idleListener, true)
  }

  // acquire a client for a pending work item
  _acquireClient(client, pendingItem, idleListener, isNew) {
    if (isNew) {
      this.emit('connect', client)
    }

    this.emit('acquire', client)

    client.release = this._releaseOnce(client, idleListener)

    client.removeListener('error', idleListener)

    if (!pendingItem.timedOut) {
      if (isNew && this.options.verify) {
        this.options.verify(client, (err) => {
          if (err) {
            client.release(err)
            return pendingItem.callback(err, undefined, NOOP)
          }

          pendingItem.callback(undefined, client, client.release)
        })
      } else {
        pendingItem.callback(undefined, client, client.release)
      }
    } else {
      if (isNew && this.options.verify) {
        this.options.verify(client, client.release)
      } else {
        client.release()
      }
    }
  }

  // returns a function that wraps _release and throws if called more than once
  _releaseOnce(client, idleListener) {
    let released = false

    return (err) => {
      if (released) {
        throwOnDoubleRelease()
      }

      released = true
      this._release(client, idleListener, err)
    }
  }

  // release a client back to the poll, include an error
  // to remove it from the pool
  _release(client, idleListener, err) {
    client.on('error', idleListener)

    client._poolUseCount = (client._poolUseCount || 0) + 1

    this.emit('release', err, client)

    // TODO(bmc): expose a proper, public interface _queryable and _ending
    if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
      if (client._poolUseCount >= this.options.maxUses) {
        this.log('remove expended client')
      }

      return this._remove(client, this._pulseQueue.bind(this))
    }

    const isExpired = this._expired.has(client)
    if (isExpired) {
      this.log('remove expired client')
      this._expired.delete(client)
      return this._remove(client, this._pulseQueue.bind(this))
    }

    // idle timeout
    let tid
    if (this.options.idleTimeoutMillis && this._isAboveMin()) {
      tid = setTimeout(() => {
        if (this._isAboveMin()) {
          this.log('remove idle client')
          this._remove(client, this._pulseQueue.bind(this))
        }
      }, this.options.idleTimeoutMillis)

      if (this.options.allowExitOnIdle) {
        // allow Node to exit if this is all that's left
        tid.unref()
      }
    }

    if (this.options.allowExitOnIdle) {
      client.unref()
    }

    this._idle.push(new IdleItem(client, idleListener, tid))
    this._pulseQueue()
  }

  query(text, values, cb) {
    // guard clause against passing a function as the first parameter
    if (typeof text === 'function') {
      const response = promisify(this.Promise, text)
      setImmediate(function () {
        return response.callback(new Error('Passing a function as the first parameter to pool.query is not supported'))
      })
      return response.result
    }

    // allow plain text query without values, but callback
    if (typeof values === 'function') {
      cb = values
      values = undefined
    }
    const response = promisify(this.Promise, cb)
    cb = response.callback

    this.connect((err, client) => {
      if (err) {
        return cb(err)
      }

      let clientReleased = false
      const onError = (err) => {
        if (clientReleased) {
          return
        }
        clientReleased = true
        client.release(err)
        cb(err)
      }

      client.once('error', onError)
      this.log('dispatching query')
      try {
        client.query(text, values, (err, res) => {
          this.log('query dispatched')
          client.removeListener('error', onError)
          if (clientReleased) {
            return
          }
          clientReleased = true
          client.release(err)
          if (err) {
            return cb(err)
          }
          return cb(undefined, res)
        })
      } catch (err) {
        client.release(err)
        return cb(err)
      }
    })
    return response.result
  }

  end(cb) {
    this.log('ending')
    if (this.ending) {
      const err = new Error('Called end on pool more than once')
      return cb ? cb(err) : this.Promise.reject(err)
    }
    this.ending = true
    const promised = promisify(this.Promise, cb)
    this._endCallback = promised.callback
    this._pulseQueue()
    return promised.result
  }

  get waitingCount() {
    return this._pendingQueue.length
  }

  get idleCount() {
    return this._idle.length
  }

  get expiredCount() {
    return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0)
  }

  get totalCount() {
    return this._clients.length
  }
}
module.exports = Pool


/***/ }),

/***/ 9971:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BufferReader = void 0;
class BufferReader {
    constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        // TODO(bmc): support non-utf8 encoding?
        this.encoding = 'utf-8';
    }
    setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
    }
    int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
    }
    byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
    }
    int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
    }
    uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
    }
    string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
    }
    cstring() {
        const start = this.offset;
        let end = start;
        // eslint-disable-next-line no-empty
        while (this.buffer[end++]) { }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
    }
    bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }
}
exports.BufferReader = BufferReader;
//# sourceMappingURL=buffer-reader.js.map

/***/ }),

/***/ 9315:
/***/ ((__unused_webpack_module, exports) => {


//binary data writer tuned for encoding binary specific to the postgres binary protocol
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Writer = void 0;
class Writer {
    constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
    }
    ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
            const oldBuffer = this.buffer;
            // exponential growth factor of around ~ 1.5
            // https://stackoverflow.com/questions/2269063/buffer-growth-strategy
            const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
            this.buffer = Buffer.allocUnsafe(newSize);
            oldBuffer.copy(this.buffer);
        }
    }
    addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = (num >>> 24) & 0xff;
        this.buffer[this.offset++] = (num >>> 16) & 0xff;
        this.buffer[this.offset++] = (num >>> 8) & 0xff;
        this.buffer[this.offset++] = (num >>> 0) & 0xff;
        return this;
    }
    addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = (num >>> 8) & 0xff;
        this.buffer[this.offset++] = (num >>> 0) & 0xff;
        return this;
    }
    addCString(string) {
        if (!string) {
            this.ensure(1);
        }
        else {
            const len = Buffer.byteLength(string);
            this.ensure(len + 1); // +1 for null terminator
            this.buffer.write(string, this.offset, 'utf-8');
            this.offset += len;
        }
        this.buffer[this.offset++] = 0; // null terminator
        return this;
    }
    addString(string = '') {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
    }
    // Write an Int32 byte-length prefix immediately followed by the string's UTF-8
    // bytes. Postgres' Bind wire format prefixes every parameter with its length,
    // and doing it in one method computes Buffer.byteLength ONCE — the previous
    // `addInt32(Buffer.byteLength(s)).addString(s)` pairing scanned the string
    // three times (byteLength for the prefix, byteLength again inside addString,
    // then the encode), which is costly for large text parameters.
    addInt32PrefixedString(string) {
        const len = Buffer.byteLength(string);
        this.ensure(4 + len);
        const buffer = this.buffer;
        let offset = this.offset;
        buffer[offset++] = (len >>> 24) & 0xff;
        buffer[offset++] = (len >>> 16) & 0xff;
        buffer[offset++] = (len >>> 8) & 0xff;
        buffer[offset++] = (len >>> 0) & 0xff;
        buffer.write(string, offset, 'utf-8');
        this.offset = offset + len;
        return this;
    }
    add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
    }
    join(code) {
        if (code) {
            this.buffer[this.headerPosition] = code;
            //length is everything in this packet minus the code
            const length = this.offset - (this.headerPosition + 1);
            this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
    }
    flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
    }
    clear() {
        this.offset = 5;
        this.headerPosition = 0;
    }
}
exports.Writer = Writer;
//# sourceMappingURL=buffer-writer.js.map

/***/ }),

/***/ 4233:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DatabaseError = exports.serialize = void 0;
exports.parse = parse;
const messages_1 = __nccwpck_require__(5809);
Object.defineProperty(exports, "DatabaseError", ({ enumerable: true, get: function () { return messages_1.DatabaseError; } }));
const serializer_1 = __nccwpck_require__(6513);
Object.defineProperty(exports, "serialize", ({ enumerable: true, get: function () { return serializer_1.serialize; } }));
const parser_1 = __nccwpck_require__(3318);
function parse(stream, callback) {
    const parser = new parser_1.Parser();
    stream.on('data', (buffer) => parser.parse(buffer, callback));
    return new Promise((resolve) => stream.on('end', () => resolve()));
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 5809:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NoticeMessage = exports.DataRowMessage = exports.CommandCompleteMessage = exports.ReadyForQueryMessage = exports.NotificationResponseMessage = exports.BackendKeyDataMessage = exports.AuthenticationMD5Password = exports.ParameterStatusMessage = exports.ParameterDescriptionMessage = exports.RowDescriptionMessage = exports.Field = exports.CopyResponse = exports.CopyDataMessage = exports.DatabaseError = exports.copyDone = exports.emptyQuery = exports.replicationStart = exports.portalSuspended = exports.noData = exports.closeComplete = exports.bindComplete = exports.parseComplete = void 0;
exports.parseComplete = {
    name: 'parseComplete',
    length: 5,
};
exports.bindComplete = {
    name: 'bindComplete',
    length: 5,
};
exports.closeComplete = {
    name: 'closeComplete',
    length: 5,
};
exports.noData = {
    name: 'noData',
    length: 5,
};
exports.portalSuspended = {
    name: 'portalSuspended',
    length: 5,
};
exports.replicationStart = {
    name: 'replicationStart',
    length: 4,
};
exports.emptyQuery = {
    name: 'emptyQuery',
    length: 4,
};
exports.copyDone = {
    name: 'copyDone',
    length: 4,
};
class DatabaseError extends Error {
    constructor(message, length, name) {
        super(message);
        this.length = length;
        this.name = name;
    }
}
exports.DatabaseError = DatabaseError;
class CopyDataMessage {
    constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = 'copyData';
    }
}
exports.CopyDataMessage = CopyDataMessage;
class CopyResponse {
    constructor(length, name, binary, columnCount) {
        this.length = length;
        this.name = name;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
    }
}
exports.CopyResponse = CopyResponse;
class Field {
    constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
    }
}
exports.Field = Field;
class RowDescriptionMessage {
    constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = 'rowDescription';
        this.fields = new Array(this.fieldCount);
    }
}
exports.RowDescriptionMessage = RowDescriptionMessage;
class ParameterDescriptionMessage {
    constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = 'parameterDescription';
        this.dataTypeIDs = new Array(this.parameterCount);
    }
}
exports.ParameterDescriptionMessage = ParameterDescriptionMessage;
class ParameterStatusMessage {
    constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = 'parameterStatus';
    }
}
exports.ParameterStatusMessage = ParameterStatusMessage;
class AuthenticationMD5Password {
    constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = 'authenticationMD5Password';
    }
}
exports.AuthenticationMD5Password = AuthenticationMD5Password;
class BackendKeyDataMessage {
    constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = 'backendKeyData';
    }
}
exports.BackendKeyDataMessage = BackendKeyDataMessage;
class NotificationResponseMessage {
    constructor(length, processId, channel, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel;
        this.payload = payload;
        this.name = 'notification';
    }
}
exports.NotificationResponseMessage = NotificationResponseMessage;
class ReadyForQueryMessage {
    constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = 'readyForQuery';
    }
}
exports.ReadyForQueryMessage = ReadyForQueryMessage;
class CommandCompleteMessage {
    constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = 'commandComplete';
    }
}
exports.CommandCompleteMessage = CommandCompleteMessage;
class DataRowMessage {
    constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = 'dataRow';
        this.fieldCount = fields.length;
    }
}
exports.DataRowMessage = DataRowMessage;
class NoticeMessage {
    constructor(length, message) {
        this.length = length;
        this.message = message;
        this.name = 'notice';
    }
}
exports.NoticeMessage = NoticeMessage;
//# sourceMappingURL=messages.js.map

/***/ }),

/***/ 3318:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Parser = void 0;
const messages_1 = __nccwpck_require__(5809);
const buffer_reader_1 = __nccwpck_require__(9971);
// every message is prefixed with a single byte
const CODE_LENGTH = 1;
// every message has an int32 length which includes itself but does
// NOT include the code in the length
const LEN_LENGTH = 4;
const HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
// A placeholder for a `BackendMessage`’s length value that will be set after construction.
const LATEINIT_LENGTH = -1;
const emptyBuffer = Buffer.allocUnsafe(0);
class Parser {
    constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === 'binary') {
            throw new Error('Binary mode not supported yet');
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || 'text';
    }
    parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
            // code is 1 byte long - it identifies the message type
            const code = this.buffer[offset];
            // length is 1 Uint32BE - it is the length of the message EXCLUDING the code
            const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
            const fullMessageLength = CODE_LENGTH + length;
            if (fullMessageLength + offset <= bufferFullLength) {
                const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
                callback(message);
                offset += fullMessageLength;
            }
            else {
                break;
            }
        }
        if (offset === bufferFullLength) {
            // No more use for the buffer
            this.buffer = emptyBuffer;
            this.bufferLength = 0;
            this.bufferOffset = 0;
        }
        else {
            // Adjust the cursors of remainingBuffer
            this.bufferLength = bufferFullLength - offset;
            this.bufferOffset = offset;
        }
    }
    mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
            const newLength = this.bufferLength + buffer.byteLength;
            const newFullLength = newLength + this.bufferOffset;
            if (newFullLength > this.buffer.byteLength) {
                // We can't concat the new buffer with the remaining one
                let newBuffer;
                if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
                    // We can move the relevant part to the beginning of the buffer instead of allocating a new buffer
                    newBuffer = this.buffer;
                }
                else {
                    // Allocate a new larger buffer
                    let newBufferLength = this.buffer.byteLength * 2;
                    while (newLength >= newBufferLength) {
                        newBufferLength *= 2;
                    }
                    newBuffer = Buffer.allocUnsafe(newBufferLength);
                }
                // Move the remaining buffer to the new one
                this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
                this.buffer = newBuffer;
                this.bufferOffset = 0;
            }
            // Concat the new buffer with the remaining one
            buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
            this.bufferLength = newLength;
        }
        else {
            this.buffer = buffer;
            this.bufferOffset = 0;
            this.bufferLength = buffer.byteLength;
        }
    }
    handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        // NOTE: This undesirably retains the buffer in `this.reader` if the `parse*Message` calls below throw. However, those should only throw in the case of a protocol error, which normally results in the reader being discarded.
        reader.setBuffer(offset, bytes);
        let message;
        switch (code) {
            case 50 /* MessageCodes.BindComplete */:
                message = messages_1.bindComplete;
                break;
            case 49 /* MessageCodes.ParseComplete */:
                message = messages_1.parseComplete;
                break;
            case 51 /* MessageCodes.CloseComplete */:
                message = messages_1.closeComplete;
                break;
            case 110 /* MessageCodes.NoData */:
                message = messages_1.noData;
                break;
            case 115 /* MessageCodes.PortalSuspended */:
                message = messages_1.portalSuspended;
                break;
            case 99 /* MessageCodes.CopyDone */:
                message = messages_1.copyDone;
                break;
            case 87 /* MessageCodes.ReplicationStart */:
                message = messages_1.replicationStart;
                break;
            case 73 /* MessageCodes.EmptyQuery */:
                message = messages_1.emptyQuery;
                break;
            case 68 /* MessageCodes.DataRow */:
                message = parseDataRowMessage(reader);
                break;
            case 67 /* MessageCodes.CommandComplete */:
                message = parseCommandCompleteMessage(reader);
                break;
            case 90 /* MessageCodes.ReadyForQuery */:
                message = parseReadyForQueryMessage(reader);
                break;
            case 65 /* MessageCodes.NotificationResponse */:
                message = parseNotificationMessage(reader);
                break;
            case 82 /* MessageCodes.AuthenticationResponse */:
                message = parseAuthenticationResponse(reader, length);
                break;
            case 83 /* MessageCodes.ParameterStatus */:
                message = parseParameterStatusMessage(reader);
                break;
            case 75 /* MessageCodes.BackendKeyData */:
                message = parseBackendKeyData(reader);
                break;
            case 69 /* MessageCodes.ErrorMessage */:
                message = parseErrorMessage(reader, 'error');
                break;
            case 78 /* MessageCodes.NoticeMessage */:
                message = parseErrorMessage(reader, 'notice');
                break;
            case 84 /* MessageCodes.RowDescriptionMessage */:
                message = parseRowDescriptionMessage(reader);
                break;
            case 116 /* MessageCodes.ParameterDescriptionMessage */:
                message = parseParameterDescriptionMessage(reader);
                break;
            case 71 /* MessageCodes.CopyIn */:
                message = parseCopyInMessage(reader);
                break;
            case 72 /* MessageCodes.CopyOut */:
                message = parseCopyOutMessage(reader);
                break;
            case 100 /* MessageCodes.CopyData */:
                message = parseCopyData(reader, length);
                break;
            default:
                return new messages_1.DatabaseError('received invalid response: ' + code.toString(16), length, 'error');
        }
        reader.setBuffer(0, emptyBuffer);
        message.length = length;
        return message;
    }
}
exports.Parser = Parser;
const parseReadyForQueryMessage = (reader) => {
    const status = reader.string(1);
    return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
};
const parseCommandCompleteMessage = (reader) => {
    const text = reader.cstring();
    return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
};
const parseCopyData = (reader, length) => {
    const chunk = reader.bytes(length - 4);
    return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
};
const parseCopyInMessage = (reader) => parseCopyMessage(reader, 'copyInResponse');
const parseCopyOutMessage = (reader) => parseCopyMessage(reader, 'copyOutResponse');
const parseCopyMessage = (reader, messageName) => {
    const isBinary = reader.byte() !== 0;
    const columnCount = reader.int16();
    const message = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
    for (let i = 0; i < columnCount; i++) {
        message.columnTypes[i] = reader.int16();
    }
    return message;
};
const parseNotificationMessage = (reader) => {
    const processId = reader.int32();
    const channel = reader.cstring();
    const payload = reader.cstring();
    return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload);
};
const parseRowDescriptionMessage = (reader) => {
    const fieldCount = reader.int16();
    const message = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
    for (let i = 0; i < fieldCount; i++) {
        message.fields[i] = parseField(reader);
    }
    return message;
};
const parseField = (reader) => {
    const name = reader.cstring();
    const tableID = reader.uint32();
    const columnID = reader.int16();
    const dataTypeID = reader.uint32();
    const dataTypeSize = reader.int16();
    const dataTypeModifier = reader.int32();
    const mode = reader.int16() === 0 ? 'text' : 'binary';
    return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
};
const parseParameterDescriptionMessage = (reader) => {
    const parameterCount = reader.int16();
    const message = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
    for (let i = 0; i < parameterCount; i++) {
        message.dataTypeIDs[i] = reader.int32();
    }
    return message;
};
const parseDataRowMessage = (reader) => {
    const fieldCount = reader.int16();
    const fields = new Array(fieldCount);
    for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        // a -1 for length means the value of the field is null
        fields[i] = len === -1 ? null : reader.string(len);
    }
    return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
};
const parseParameterStatusMessage = (reader) => {
    const name = reader.cstring();
    const value = reader.cstring();
    return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name, value);
};
const parseBackendKeyData = (reader) => {
    const processID = reader.int32();
    const secretKey = reader.int32();
    return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
};
const parseAuthenticationResponse = (reader, length) => {
    const code = reader.int32();
    // TODO(bmc): maybe better types here
    const message = {
        name: 'authenticationOk',
        length,
    };
    switch (code) {
        case 0: // AuthenticationOk
            break;
        case 3: // AuthenticationCleartextPassword
            if (message.length === 8) {
                message.name = 'authenticationCleartextPassword';
            }
            break;
        case 5: // AuthenticationMD5Password
            if (message.length === 12) {
                message.name = 'authenticationMD5Password';
                const salt = reader.bytes(4);
                return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
            }
            break;
        case 10: // AuthenticationSASL
            {
                message.name = 'authenticationSASL';
                message.mechanisms = [];
                let mechanism;
                do {
                    mechanism = reader.cstring();
                    if (mechanism) {
                        message.mechanisms.push(mechanism);
                    }
                } while (mechanism);
            }
            break;
        case 11: // AuthenticationSASLContinue
            message.name = 'authenticationSASLContinue';
            message.data = reader.string(length - 8);
            break;
        case 12: // AuthenticationSASLFinal
            message.name = 'authenticationSASLFinal';
            message.data = reader.string(length - 8);
            break;
        default:
            throw new Error('Unknown authenticationOk message type ' + code);
    }
    return message;
};
const parseErrorMessage = (reader, name) => {
    const fields = {};
    let fieldType = reader.string(1);
    while (fieldType !== '\0') {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
    }
    const messageValue = fields.M;
    const message = name === 'notice'
        ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue)
        : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name);
    message.severity = fields.S;
    message.code = fields.C;
    message.detail = fields.D;
    message.hint = fields.H;
    message.position = fields.P;
    message.internalPosition = fields.p;
    message.internalQuery = fields.q;
    message.where = fields.W;
    message.schema = fields.s;
    message.table = fields.t;
    message.column = fields.c;
    message.dataType = fields.d;
    message.constraint = fields.n;
    message.file = fields.F;
    message.line = fields.L;
    message.routine = fields.R;
    return message;
};
//# sourceMappingURL=parser.js.map

/***/ }),

/***/ 6513:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.serialize = void 0;
const buffer_writer_1 = __nccwpck_require__(9315);
const writer = new buffer_writer_1.Writer();
const startup = (opts) => {
    // protocol version
    writer.addInt16(3).addInt16(0);
    for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
    }
    writer.addCString('client_encoding').addCString('UTF8');
    const bodyBuffer = writer.addCString('').flush();
    // this message is sent without a code
    const length = bodyBuffer.length + 4;
    return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
};
const requestSsl = () => {
    const response = Buffer.allocUnsafe(8);
    response.writeInt32BE(8, 0);
    response.writeInt32BE(80877103, 4);
    return response;
};
const password = (password) => {
    return writer.addCString(password).flush(112 /* code.startup */);
};
const sendSASLInitialResponseMessage = function (mechanism, initialResponse) {
    // 0x70 = 'p'
    writer.addCString(mechanism).addInt32PrefixedString(initialResponse);
    return writer.flush(112 /* code.startup */);
};
const sendSCRAMClientFinalMessage = function (additionalData) {
    return writer.addString(additionalData).flush(112 /* code.startup */);
};
const query = (text) => {
    return writer.addCString(text).flush(81 /* code.query */);
};
const emptyArray = [];
const parse = (query) => {
    // expect something like this:
    // { name: 'queryName',
    //   text: 'select * from blah',
    //   types: ['int8', 'bool'] }
    // normalize missing query names to allow for null
    const name = query.name || '';
    if (name.length > 63) {
        console.error('Warning! Postgres only supports 63 characters for query names.');
        console.error('You supplied %s (%s)', name, name.length);
        console.error('This can cause conflicts and silent errors executing queries');
    }
    const types = query.types || emptyArray;
    const len = types.length;
    const buffer = writer
        .addCString(name) // name of query
        .addCString(query.text) // actual query text
        .addInt16(len);
    for (let i = 0; i < len; i++) {
        buffer.addInt32(types[i]);
    }
    return writer.flush(80 /* code.parse */);
};
const paramWriter = new buffer_writer_1.Writer();
const writeValues = function (values, valueMapper) {
    for (let i = 0; i < values.length; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        if (mappedVal == null) {
            // add the param type (string) to the writer
            writer.addInt16(0 /* ParamType.STRING */);
            // write -1 to the param writer to indicate null
            paramWriter.addInt32(-1);
        }
        else if (mappedVal instanceof Buffer) {
            // add the param type (binary) to the writer
            writer.addInt16(1 /* ParamType.BINARY */);
            // add the buffer to the param writer
            paramWriter.addInt32(mappedVal.length);
            paramWriter.add(mappedVal);
        }
        else {
            // add the param type (string) to the writer
            writer.addInt16(0 /* ParamType.STRING */);
            // length prefix + UTF-8 bytes in one pass (Buffer.byteLength computed once)
            paramWriter.addInt32PrefixedString(mappedVal);
        }
    }
};
const bind = (config = {}) => {
    // normalize config
    const portal = config.portal || '';
    const statement = config.statement || '';
    const binary = config.binary || false;
    const values = config.values || emptyArray;
    const len = values.length;
    writer.addCString(portal).addCString(statement);
    writer.addInt16(len);
    try {
        writeValues(values, config.valueMapper);
    }
    catch (err) {
        writer.clear();
        paramWriter.clear();
        throw err;
    }
    writer.addInt16(len);
    writer.add(paramWriter.flush());
    // all results use the same format code
    writer.addInt16(1);
    // format code
    writer.addInt16(binary ? 1 /* ParamType.BINARY */ : 0 /* ParamType.STRING */);
    return writer.flush(66 /* code.bind */);
};
const emptyExecute = Buffer.from([69 /* code.execute */, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00]);
const execute = (config) => {
    // this is the happy path for most queries
    if (!config || (!config.portal && !config.rows)) {
        return emptyExecute;
    }
    const portal = config.portal || '';
    const rows = config.rows || 0;
    const portalLength = Buffer.byteLength(portal);
    const len = 4 + portalLength + 1 + 4;
    // one extra bit for code
    const buff = Buffer.allocUnsafe(1 + len);
    buff[0] = 69 /* code.execute */;
    buff.writeInt32BE(len, 1);
    buff.write(portal, 5, 'utf-8');
    buff[portalLength + 5] = 0; // null terminate portal cString
    buff.writeUInt32BE(rows, buff.length - 4);
    return buff;
};
const cancel = (processID, secretKey) => {
    const buffer = Buffer.allocUnsafe(16);
    buffer.writeInt32BE(16, 0);
    buffer.writeInt16BE(1234, 4);
    buffer.writeInt16BE(5678, 6);
    buffer.writeInt32BE(processID, 8);
    buffer.writeInt32BE(secretKey, 12);
    return buffer;
};
const cstringMessage = (code, string) => {
    const stringLen = Buffer.byteLength(string);
    const len = 4 + stringLen + 1;
    // one extra bit for code
    const buffer = Buffer.allocUnsafe(1 + len);
    buffer[0] = code;
    buffer.writeInt32BE(len, 1);
    buffer.write(string, 5, 'utf-8');
    buffer[len] = 0; // null terminate cString
    return buffer;
};
const emptyDescribePortal = writer.addCString('P').flush(68 /* code.describe */);
const emptyDescribeStatement = writer.addCString('S').flush(68 /* code.describe */);
const describe = (msg) => {
    return msg.name
        ? cstringMessage(68 /* code.describe */, `${msg.type}${msg.name || ''}`)
        : msg.type === 'P'
            ? emptyDescribePortal
            : emptyDescribeStatement;
};
const close = (msg) => {
    const text = `${msg.type}${msg.name || ''}`;
    return cstringMessage(67 /* code.close */, text);
};
const copyData = (chunk) => {
    return writer.add(chunk).flush(100 /* code.copyFromChunk */);
};
const copyFail = (message) => {
    return cstringMessage(102 /* code.copyFail */, message);
};
const codeOnlyBuffer = (code) => Buffer.from([code, 0x00, 0x00, 0x00, 0x04]);
const flushBuffer = codeOnlyBuffer(72 /* code.flush */);
const syncBuffer = codeOnlyBuffer(83 /* code.sync */);
const endBuffer = codeOnlyBuffer(88 /* code.end */);
const copyDoneBuffer = codeOnlyBuffer(99 /* code.copyDone */);
const serialize = {
    startup,
    password,
    requestSsl,
    sendSASLInitialResponseMessage,
    sendSCRAMClientFinalMessage,
    query,
    parse,
    bind,
    execute,
    describe,
    close,
    flush: () => flushBuffer,
    sync: () => syncBuffer,
    end: () => endBuffer,
    copyData,
    copyDone: () => copyDoneBuffer,
    copyFail,
    cancel,
};
exports.serialize = serialize;
//# sourceMappingURL=serializer.js.map

/***/ }),

/***/ 1549:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

var textParsers = __nccwpck_require__(4784);
var binaryParsers = __nccwpck_require__(7522);
var arrayParser = __nccwpck_require__(6471);
var builtinTypes = __nccwpck_require__(6345);

exports.getTypeParser = getTypeParser;
exports.setTypeParser = setTypeParser;
exports.arrayParser = arrayParser;
exports.builtins = builtinTypes;

var typeParsers = {
  text: {},
  binary: {}
};

//the empty parse function
function noParse (val) {
  return String(val);
};

//returns a function used to convert a specific type (specified by
//oid) into a result javascript type
//note: the oid can be obtained via the following sql query:
//SELECT oid FROM pg_type WHERE typname = 'TYPE_NAME_HERE';
function getTypeParser (oid, format) {
  format = format || 'text';
  if (!typeParsers[format]) {
    return noParse;
  }
  return typeParsers[format][oid] || noParse;
};

function setTypeParser (oid, format, parseFn) {
  if(typeof format == 'function') {
    parseFn = format;
    format = 'text';
  }
  typeParsers[format][oid] = parseFn;
};

textParsers.init(function(oid, converter) {
  typeParsers.text[oid] = converter;
});

binaryParsers.init(function(oid, converter) {
  typeParsers.binary[oid] = converter;
});


/***/ }),

/***/ 6471:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var array = __nccwpck_require__(3879);

module.exports = {
  create: function (source, transform) {
    return {
      parse: function() {
        return array.parse(source, transform);
      }
    };
  }
};


/***/ }),

/***/ 7522:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var parseInt64 = __nccwpck_require__(2299);

var parseBits = function(data, bits, offset, invert, callback) {
  offset = offset || 0;
  invert = invert || false;
  callback = callback || function(lastValue, newValue, bits) { return (lastValue * Math.pow(2, bits)) + newValue; };
  var offsetBytes = offset >> 3;

  var inv = function(value) {
    if (invert) {
      return ~value & 0xff;
    }

    return value;
  };

  // read first (maybe partial) byte
  var mask = 0xff;
  var firstBits = 8 - (offset % 8);
  if (bits < firstBits) {
    mask = (0xff << (8 - bits)) & 0xff;
    firstBits = bits;
  }

  if (offset) {
    mask = mask >> (offset % 8);
  }

  var result = 0;
  if ((offset % 8) + bits >= 8) {
    result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
  }

  // read bytes
  var bytes = (bits + offset) >> 3;
  for (var i = offsetBytes + 1; i < bytes; i++) {
    result = callback(result, inv(data[i]), 8);
  }

  // bits to read, that are not a complete byte
  var lastBits = (bits + offset) % 8;
  if (lastBits > 0) {
    result = callback(result, inv(data[bytes]) >> (8 - lastBits), lastBits);
  }

  return result;
};

var parseFloatFromBits = function(data, precisionBits, exponentBits) {
  var bias = Math.pow(2, exponentBits - 1) - 1;
  var sign = parseBits(data, 1);
  var exponent = parseBits(data, exponentBits, 1);

  if (exponent === 0) {
    return 0;
  }

  // parse mantissa
  var precisionBitsCounter = 1;
  var parsePrecisionBits = function(lastValue, newValue, bits) {
    if (lastValue === 0) {
      lastValue = 1;
    }

    for (var i = 1; i <= bits; i++) {
      precisionBitsCounter /= 2;
      if ((newValue & (0x1 << (bits - i))) > 0) {
        lastValue += precisionBitsCounter;
      }
    }

    return lastValue;
  };

  var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);

  // special cases
  if (exponent == (Math.pow(2, exponentBits + 1) - 1)) {
    if (mantissa === 0) {
      return (sign === 0) ? Infinity : -Infinity;
    }

    return NaN;
  }

  // normale number
  return ((sign === 0) ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
};

var parseInt16 = function(value) {
  if (parseBits(value, 1) == 1) {
    return -1 * (parseBits(value, 15, 1, true) + 1);
  }

  return parseBits(value, 15, 1);
};

var parseInt32 = function(value) {
  if (parseBits(value, 1) == 1) {
    return -1 * (parseBits(value, 31, 1, true) + 1);
  }

  return parseBits(value, 31, 1);
};

var parseFloat32 = function(value) {
  return parseFloatFromBits(value, 23, 8);
};

var parseFloat64 = function(value) {
  return parseFloatFromBits(value, 52, 11);
};

var parseNumeric = function(value) {
  var sign = parseBits(value, 16, 32);
  if (sign == 0xc000) {
    return NaN;
  }

  var weight = Math.pow(10000, parseBits(value, 16, 16));
  var result = 0;

  var digits = [];
  var ndigits = parseBits(value, 16);
  for (var i = 0; i < ndigits; i++) {
    result += parseBits(value, 16, 64 + (16 * i)) * weight;
    weight /= 10000;
  }

  var scale = Math.pow(10, parseBits(value, 16, 48));
  return ((sign === 0) ? 1 : -1) * Math.round(result * scale) / scale;
};

var parseDate = function(isUTC, value) {
  var sign = parseBits(value, 1);
  var rawValue = parseBits(value, 63, 1);

  // discard usecs and shift from 2000 to 1970
  var result = new Date((((sign === 0) ? 1 : -1) * rawValue / 1000) + 946684800000);

  if (!isUTC) {
    result.setTime(result.getTime() + result.getTimezoneOffset() * 60000);
  }

  // add microseconds to the date
  result.usec = rawValue % 1000;
  result.getMicroSeconds = function() {
    return this.usec;
  };
  result.setMicroSeconds = function(value) {
    this.usec = value;
  };
  result.getUTCMicroSeconds = function() {
    return this.usec;
  };

  return result;
};

var parseArray = function(value) {
  var dim = parseBits(value, 32);

  var flags = parseBits(value, 32, 32);
  var elementType = parseBits(value, 32, 64);

  var offset = 96;
  var dims = [];
  for (var i = 0; i < dim; i++) {
    // parse dimension
    dims[i] = parseBits(value, 32, offset);
    offset += 32;

    // ignore lower bounds
    offset += 32;
  }

  var parseElement = function(elementType) {
    // parse content length
    var length = parseBits(value, 32, offset);
    offset += 32;

    // parse null values
    if (length == 0xffffffff) {
      return null;
    }

    var result;
    if ((elementType == 0x17) || (elementType == 0x14)) {
      // int/bigint
      result = parseBits(value, length * 8, offset);
      offset += length * 8;
      return result;
    }
    else if (elementType == 0x19) {
      // string
      result = value.toString(this.encoding, offset >> 3, (offset += (length << 3)) >> 3);
      return result;
    }
    else {
      console.log("ERROR: ElementType not implemented: " + elementType);
    }
  };

  var parse = function(dimension, elementType) {
    var array = [];
    var i;

    if (dimension.length > 1) {
      var count = dimension.shift();
      for (i = 0; i < count; i++) {
        array[i] = parse(dimension, elementType);
      }
      dimension.unshift(count);
    }
    else {
      for (i = 0; i < dimension[0]; i++) {
        array[i] = parseElement(elementType);
      }
    }

    return array;
  };

  return parse(dims, elementType);
};

var parseText = function(value) {
  return value.toString('utf8');
};

var parseBool = function(value) {
  if(value === null) return null;
  return (parseBits(value, 8) > 0);
};

var init = function(register) {
  register(20, parseInt64);
  register(21, parseInt16);
  register(23, parseInt32);
  register(26, parseInt32);
  register(1700, parseNumeric);
  register(700, parseFloat32);
  register(701, parseFloat64);
  register(16, parseBool);
  register(1114, parseDate.bind(null, false));
  register(1184, parseDate.bind(null, true));
  register(1000, parseArray);
  register(1007, parseArray);
  register(1016, parseArray);
  register(1008, parseArray);
  register(1009, parseArray);
  register(25, parseText);
};

module.exports = {
  init: init
};


/***/ }),

/***/ 6345:
/***/ ((module) => {

/**
 * Following query was used to generate this file:

 SELECT json_object_agg(UPPER(PT.typname), PT.oid::int4 ORDER BY pt.oid)
 FROM pg_type PT
 WHERE typnamespace = (SELECT pgn.oid FROM pg_namespace pgn WHERE nspname = 'pg_catalog') -- Take only builting Postgres types with stable OID (extension types are not guaranted to be stable)
 AND typtype = 'b' -- Only basic types
 AND typelem = 0 -- Ignore aliases
 AND typisdefined -- Ignore undefined types
 */

module.exports = {
    BOOL: 16,
    BYTEA: 17,
    CHAR: 18,
    INT8: 20,
    INT2: 21,
    INT4: 23,
    REGPROC: 24,
    TEXT: 25,
    OID: 26,
    TID: 27,
    XID: 28,
    CID: 29,
    JSON: 114,
    XML: 142,
    PG_NODE_TREE: 194,
    SMGR: 210,
    PATH: 602,
    POLYGON: 604,
    CIDR: 650,
    FLOAT4: 700,
    FLOAT8: 701,
    ABSTIME: 702,
    RELTIME: 703,
    TINTERVAL: 704,
    CIRCLE: 718,
    MACADDR8: 774,
    MONEY: 790,
    MACADDR: 829,
    INET: 869,
    ACLITEM: 1033,
    BPCHAR: 1042,
    VARCHAR: 1043,
    DATE: 1082,
    TIME: 1083,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
    INTERVAL: 1186,
    TIMETZ: 1266,
    BIT: 1560,
    VARBIT: 1562,
    NUMERIC: 1700,
    REFCURSOR: 1790,
    REGPROCEDURE: 2202,
    REGOPER: 2203,
    REGOPERATOR: 2204,
    REGCLASS: 2205,
    REGTYPE: 2206,
    UUID: 2950,
    TXID_SNAPSHOT: 2970,
    PG_LSN: 3220,
    PG_NDISTINCT: 3361,
    PG_DEPENDENCIES: 3402,
    TSVECTOR: 3614,
    TSQUERY: 3615,
    GTSVECTOR: 3642,
    REGCONFIG: 3734,
    REGDICTIONARY: 3769,
    JSONB: 3802,
    REGNAMESPACE: 4089,
    REGROLE: 4096
};


/***/ }),

/***/ 4784:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var array = __nccwpck_require__(3879)
var arrayParser = __nccwpck_require__(6471);
var parseDate = __nccwpck_require__(2690);
var parseInterval = __nccwpck_require__(8755);
var parseByteA = __nccwpck_require__(463);

function allowNull (fn) {
  return function nullAllowed (value) {
    if (value === null) return value
    return fn(value)
  }
}

function parseBool (value) {
  if (value === null) return value
  return value === 'TRUE' ||
    value === 't' ||
    value === 'true' ||
    value === 'y' ||
    value === 'yes' ||
    value === 'on' ||
    value === '1';
}

function parseBoolArray (value) {
  if (!value) return null
  return array.parse(value, parseBool)
}

function parseBaseTenInt (string) {
  return parseInt(string, 10)
}

function parseIntegerArray (value) {
  if (!value) return null
  return array.parse(value, allowNull(parseBaseTenInt))
}

function parseBigIntegerArray (value) {
  if (!value) return null
  return array.parse(value, allowNull(function (entry) {
    return parseBigInteger(entry).trim()
  }))
}

var parsePointArray = function(value) {
  if(!value) { return null; }
  var p = arrayParser.create(value, function(entry) {
    if(entry !== null) {
      entry = parsePoint(entry);
    }
    return entry;
  });

  return p.parse();
};

var parseFloatArray = function(value) {
  if(!value) { return null; }
  var p = arrayParser.create(value, function(entry) {
    if(entry !== null) {
      entry = parseFloat(entry);
    }
    return entry;
  });

  return p.parse();
};

var parseStringArray = function(value) {
  if(!value) { return null; }

  var p = arrayParser.create(value);
  return p.parse();
};

var parseDateArray = function(value) {
  if (!value) { return null; }

  var p = arrayParser.create(value, function(entry) {
    if (entry !== null) {
      entry = parseDate(entry);
    }
    return entry;
  });

  return p.parse();
};

var parseIntervalArray = function(value) {
  if (!value) { return null; }

  var p = arrayParser.create(value, function(entry) {
    if (entry !== null) {
      entry = parseInterval(entry);
    }
    return entry;
  });

  return p.parse();
};

var parseByteAArray = function(value) {
  if (!value) { return null; }

  return array.parse(value, allowNull(parseByteA));
};

var parseInteger = function(value) {
  return parseInt(value, 10);
};

var parseBigInteger = function(value) {
  var valStr = String(value);
  if (/^\d+$/.test(valStr)) { return valStr; }
  return value;
};

var parseJsonArray = function(value) {
  if (!value) { return null; }

  return array.parse(value, allowNull(JSON.parse));
};

var parsePoint = function(value) {
  if (value[0] !== '(') { return null; }

  value = value.substring( 1, value.length - 1 ).split(',');

  return {
    x: parseFloat(value[0])
  , y: parseFloat(value[1])
  };
};

var parseCircle = function(value) {
  if (value[0] !== '<' && value[1] !== '(') { return null; }

  var point = '(';
  var radius = '';
  var pointParsed = false;
  for (var i = 2; i < value.length - 1; i++){
    if (!pointParsed) {
      point += value[i];
    }

    if (value[i] === ')') {
      pointParsed = true;
      continue;
    } else if (!pointParsed) {
      continue;
    }

    if (value[i] === ','){
      continue;
    }

    radius += value[i];
  }
  var result = parsePoint(point);
  result.radius = parseFloat(radius);

  return result;
};

var init = function(register) {
  register(20, parseBigInteger); // int8
  register(21, parseInteger); // int2
  register(23, parseInteger); // int4
  register(26, parseInteger); // oid
  register(700, parseFloat); // float4/real
  register(701, parseFloat); // float8/double
  register(16, parseBool);
  register(1082, parseDate); // date
  register(1114, parseDate); // timestamp without timezone
  register(1184, parseDate); // timestamp
  register(600, parsePoint); // point
  register(651, parseStringArray); // cidr[]
  register(718, parseCircle); // circle
  register(1000, parseBoolArray);
  register(1001, parseByteAArray);
  register(1005, parseIntegerArray); // _int2
  register(1007, parseIntegerArray); // _int4
  register(1028, parseIntegerArray); // oid[]
  register(1016, parseBigIntegerArray); // _int8
  register(1017, parsePointArray); // point[]
  register(1021, parseFloatArray); // _float4
  register(1022, parseFloatArray); // _float8
  register(1231, parseFloatArray); // _numeric
  register(1014, parseStringArray); //char
  register(1015, parseStringArray); //varchar
  register(1008, parseStringArray);
  register(1009, parseStringArray);
  register(1040, parseStringArray); // macaddr[]
  register(1041, parseStringArray); // inet[]
  register(1115, parseDateArray); // timestamp without time zone[]
  register(1182, parseDateArray); // _date
  register(1185, parseDateArray); // timestamp with time zone[]
  register(1186, parseInterval);
  register(1187, parseIntervalArray);
  register(17, parseByteA);
  register(114, JSON.parse.bind(JSON)); // json
  register(3802, JSON.parse.bind(JSON)); // jsonb
  register(199, parseJsonArray); // json[]
  register(3807, parseJsonArray); // jsonb[]
  register(3907, parseStringArray); // numrange[]
  register(2951, parseStringArray); // uuid[]
  register(791, parseStringArray); // money[]
  register(1183, parseStringArray); // time[]
  register(1270, parseStringArray); // timetz[]
};

module.exports = {
  init: init
};


/***/ }),

/***/ 5042:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const EventEmitter = (__nccwpck_require__(4434).EventEmitter)
const utils = __nccwpck_require__(9652)
const nodeUtils = __nccwpck_require__(9023)
const sasl = __nccwpck_require__(948)
const TypeOverrides = __nccwpck_require__(365)

const ConnectionParameters = __nccwpck_require__(646)
const Query = __nccwpck_require__(4473)
const defaults = __nccwpck_require__(8995)
const Connection = __nccwpck_require__(9809)
const crypto = __nccwpck_require__(4150)

const activeQueryDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.activeQuery is deprecated and will be removed in pg@9.0'
)

const queryQueueDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Client.queryQueue is deprecated and will be removed in pg@9.0.'
)

const pgPassDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'pgpass support is deprecated and will be removed in pg@9.0. ' +
    'You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code.'
)

const byoPromiseDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0.'
)

const queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.'
)

function coerceNumberOrDefault(value, defaultValue) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : defaultValue
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : defaultValue
  }
  return defaultValue
}

class Client extends EventEmitter {
  constructor(config) {
    super()

    this.connectionParameters = new ConnectionParameters(config)
    this.user = this.connectionParameters.user
    this.database = this.connectionParameters.database
    this.port = this.connectionParameters.port
    this.host = this.connectionParameters.host

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: this.connectionParameters.password,
    })

    this.replication = this.connectionParameters.replication

    const c = config || {}

    if (c.Promise) {
      byoPromiseDeprecationNotice()
    }
    this._Promise = c.Promise || global.Promise
    this._types = new TypeOverrides(c.types)
    this._ending = false
    this._ended = false
    this._connecting = false
    this._connected = false
    this._connectionError = false
    this._queryable = true
    this._activeQuery = null
    this._txStatus = null

    this.enableChannelBinding = Boolean(c.enableChannelBinding) // set true to use SCRAM-SHA-256-PLUS when offered
    this.scramMaxIterations = coerceNumberOrDefault(c.scramMaxIterations, sasl.DEFAULT_MAX_SCRAM_ITERATIONS)
    this.connection =
      c.connection ||
      new Connection({
        stream: c.stream,
        ssl: this.connectionParameters.ssl,
        sslNegotiation: this.connectionParameters.sslnegotiation,
        keepAlive: c.keepAlive || false,
        keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
        encoding: this.connectionParameters.client_encoding || 'utf8',
      })
    this._queryQueue = []
    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = this.connectionParameters.ssl || false
    this.sslNegotiation = this.connectionParameters.sslnegotiation || 'postgres'
    // As with Password, make SSL->Key (the private key) non-enumerable.
    // It won't show up in stack traces
    // or if the client is console.logged
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
  }

  get activeQuery() {
    activeQueryDeprecationNotice()
    return this._activeQuery
  }

  set activeQuery(val) {
    activeQueryDeprecationNotice()
    this._activeQuery = val
  }

  _getActiveQuery() {
    return this._activeQuery
  }

  _errorAllQueries(err) {
    const enqueueError = (query) => {
      process.nextTick(() => {
        query.handleError(err, this.connection)
      })
    }

    const activeQuery = this._getActiveQuery()
    if (activeQuery) {
      enqueueError(activeQuery)
      this._activeQuery = null
    }

    this._queryQueue.forEach(enqueueError)
    this._queryQueue.length = 0
  }

  _connect(callback) {
    const self = this
    const con = this.connection
    this._connectionCallback = callback

    if (this._connecting || this._connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      process.nextTick(() => {
        callback(err)
      })
      return
    }
    this._connecting = true

    if (this._connectionTimeoutMillis > 0) {
      this.connectionTimeoutHandle = setTimeout(() => {
        con._ending = true
        con.stream.destroy(new Error('timeout expired'))
      }, this._connectionTimeoutMillis)

      if (this.connectionTimeoutHandle.unref) {
        this.connectionTimeoutHandle.unref()
      }
    }

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send startup message
    con.on('connect', function () {
      if (self.ssl) {
        // With direct SSL negotiation the connection upgrades to TLS without an
        // SSLRequest packet, so the startup message is sent after 'sslconnect'.
        if (self.sslNegotiation !== 'direct') {
          con.requestSsl()
        }
      } else {
        con.startup(self.getStartupConf())
      }
    })

    con.on('sslconnect', function () {
      con.startup(self.getStartupConf())
    })

    this._attachListeners(con)

    con.once('end', () => {
      const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

      clearTimeout(this.connectionTimeoutHandle)
      this._errorAllQueries(error)
      this._ended = true

      if (!this._ending) {
        // if the connection is ended without us calling .end()
        // on this client then we have an unexpected disconnection
        // treat this as an error unless we've already emitted an error
        // during connection.
        if (this._connecting && !this._connectionError) {
          if (this._connectionCallback) {
            this._connectionCallback(error)
          } else {
            this._handleErrorEvent(error)
          }
        } else if (!this._connectionError) {
          this._handleErrorEvent(error)
        }
      }

      process.nextTick(() => {
        this.emit('end')
      })
    })
  }

  connect(callback) {
    if (callback) {
      this._connect(callback)
      return
    }

    return new this._Promise((resolve, reject) => {
      this._connect((error) => {
        if (error) {
          reject(error)
        } else {
          resolve(this)
        }
      })
    })
  }

  _attachListeners(con) {
    // password request handling
    con.on('authenticationCleartextPassword', this._handleAuthCleartextPassword.bind(this))
    // password request handling
    con.on('authenticationMD5Password', this._handleAuthMD5Password.bind(this))
    // password request handling (SASL)
    con.on('authenticationSASL', this._handleAuthSASL.bind(this))
    con.on('authenticationSASLContinue', this._handleAuthSASLContinue.bind(this))
    con.on('authenticationSASLFinal', this._handleAuthSASLFinal.bind(this))
    con.on('backendKeyData', this._handleBackendKeyData.bind(this))
    con.on('error', this._handleErrorEvent.bind(this))
    con.on('errorMessage', this._handleErrorMessage.bind(this))
    con.on('readyForQuery', this._handleReadyForQuery.bind(this))
    con.on('notice', this._handleNotice.bind(this))
    con.on('rowDescription', this._handleRowDescription.bind(this))
    con.on('dataRow', this._handleDataRow.bind(this))
    con.on('portalSuspended', this._handlePortalSuspended.bind(this))
    con.on('emptyQuery', this._handleEmptyQuery.bind(this))
    con.on('commandComplete', this._handleCommandComplete.bind(this))
    con.on('parseComplete', this._handleParseComplete.bind(this))
    con.on('copyInResponse', this._handleCopyInResponse.bind(this))
    con.on('copyData', this._handleCopyData.bind(this))
    con.on('notification', this._handleNotification.bind(this))
  }

  _getPassword(cb) {
    const con = this.connection
    if (typeof this.password === 'function') {
      this._Promise
        .resolve()
        .then(() => this.password(this.connectionParameters))
        .then((pass) => {
          if (pass !== undefined) {
            if (typeof pass !== 'string') {
              con.emit('error', new TypeError('Password must be a string'))
              return
            }
            this.connectionParameters.password = this.password = pass
          } else {
            this.connectionParameters.password = this.password = null
          }
          cb()
        })
        .catch((err) => {
          con.emit('error', err)
        })
    } else if (this.password !== null) {
      cb()
    } else {
      try {
        const pgPass = __nccwpck_require__(3272)
        pgPass(this.connectionParameters, (pass) => {
          if (undefined !== pass) {
            pgPassDeprecationNotice()
            this.connectionParameters.password = this.password = pass
          }
          cb()
        })
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  _handleAuthCleartextPassword(msg) {
    this._getPassword(() => {
      this.connection.password(this.password)
    })
  }

  _handleAuthMD5Password(msg) {
    this._getPassword(async () => {
      try {
        const hashedPassword = await crypto.postgresMd5PasswordHash(this.user, this.password, msg.salt)
        this.connection.password(hashedPassword)
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSASL(msg) {
    this._getPassword(() => {
      try {
        this.saslSession = sasl.startSession(
          msg.mechanisms,
          this.enableChannelBinding && this.connection.stream,
          this.scramMaxIterations
        )
        this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
      } catch (err) {
        this.connection.emit('error', err)
      }
    })
  }

  async _handleAuthSASLContinue(msg) {
    try {
      await sasl.continueSession(
        this.saslSession,
        this.password,
        msg.data,
        this.enableChannelBinding && this.connection.stream
      )
      this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleAuthSASLFinal(msg) {
    try {
      sasl.finalizeSession(this.saslSession, msg.data)
      this.saslSession = null
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleBackendKeyData(msg) {
    this.processID = msg.processID
    this.secretKey = msg.secretKey
  }

  _handleReadyForQuery(msg) {
    if (this._connecting) {
      this._connecting = false
      this._connected = true
      clearTimeout(this.connectionTimeoutHandle)

      // process possible callback argument to Client#connect
      if (this._connectionCallback) {
        this._connectionCallback(null, this)
        // remove callback for proper error handling
        // after the connect event
        this._connectionCallback = null
      }
      this.emit('connect')
    }
    const activeQuery = this._getActiveQuery()
    this._activeQuery = null
    this._txStatus = msg?.status ?? null
    this.readyForQuery = true
    if (activeQuery) {
      activeQuery.handleReadyForQuery(this.connection)
    }
    this._pulseQueryQueue()
  }

  // if we receive an error event or error message
  // during the connection process we handle it here
  _handleErrorWhileConnecting(err) {
    if (this._connectionError) {
      // TODO(bmc): this is swallowing errors - we shouldn't do this
      return
    }
    this._connectionError = true
    clearTimeout(this.connectionTimeoutHandle)
    if (this._connectionCallback) {
      return this._connectionCallback(err)
    }
    this.emit('error', err)
  }

  // if we're connected and we receive an error event from the connection
  // this means the socket is dead - do a hard abort of all queries and emit
  // the socket error on the client as well
  _handleErrorEvent(err) {
    if (this._connecting) {
      return this._handleErrorWhileConnecting(err)
    }
    this._queryable = false
    this._errorAllQueries(err)
    this.emit('error', err)
  }

  // handle error messages from the postgres backend
  _handleErrorMessage(msg) {
    if (this._connecting) {
      return this._handleErrorWhileConnecting(msg)
    }
    const activeQuery = this._getActiveQuery()

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this._activeQuery = null
    activeQuery.handleError(msg, this.connection)
  }

  _handleRowDescription(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected rowDescription message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate rowDescription to active query
    activeQuery.handleRowDescription(msg)
  }

  _handleDataRow(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected dataRow message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate dataRow to active query
    activeQuery.handleDataRow(msg)
  }

  _handlePortalSuspended(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected portalSuspended message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate portalSuspended to active query
    activeQuery.handlePortalSuspended(this.connection)
  }

  _handleEmptyQuery(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected emptyQuery message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate emptyQuery to active query
    activeQuery.handleEmptyQuery(this.connection)
  }

  _handleCommandComplete(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected commandComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate commandComplete to active query
    activeQuery.handleCommandComplete(msg, this.connection)
  }

  _handleParseComplete() {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected parseComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // if a prepared statement has a name and properly parses
    // we track that its already been executed so we don't parse
    // it again on the same client
    if (activeQuery.name) {
      this.connection.parsedStatements[activeQuery.name] = activeQuery.text
    }
  }

  _handleCopyInResponse(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyInResponse message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyInResponse(this.connection)
  }

  _handleCopyData(msg) {
    const activeQuery = this._getActiveQuery()
    if (activeQuery == null) {
      const error = new Error('Received unexpected copyData message from backend.')
      this._handleErrorEvent(error)
      return
    }
    activeQuery.handleCopyData(msg, this.connection)
  }

  _handleNotification(msg) {
    this.emit('notification', msg)
  }

  _handleNotice(msg) {
    this.emit('notice', msg)
  }

  getStartupConf() {
    const params = this.connectionParameters

    const data = {
      user: params.user,
      database: params.database,
    }

    const appName = params.application_name || params.fallback_application_name
    if (appName) {
      data.application_name = appName
    }
    if (params.replication) {
      data.replication = '' + params.replication
    }
    if (params.statement_timeout) {
      data.statement_timeout = String(parseInt(params.statement_timeout, 10))
    }
    if (params.lock_timeout) {
      data.lock_timeout = String(parseInt(params.lock_timeout, 10))
    }
    if (params.idle_in_transaction_session_timeout) {
      data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10))
    }
    if (params.options) {
      data.options = params.options
    }

    return data
  }

  cancel(client, query) {
    if (client.activeQuery === query) {
      const con = this.connection

      if (this.host && this.host.indexOf('/') === 0) {
        con.connect(this.host + '/.s.PGSQL.' + this.port)
      } else {
        con.connect(this.port, this.host)
      }

      // once connection is established send cancel message
      con.on('connect', function () {
        con.cancel(client.processID, client.secretKey)
      })
    } else if (client._queryQueue.indexOf(query) !== -1) {
      client._queryQueue.splice(client._queryQueue.indexOf(query), 1)
    }
  }

  setTypeParser(oid, format, parseFn) {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser(oid, format) {
    return this._types.getTypeParser(oid, format)
  }

  // escapeIdentifier and escapeLiteral moved to utility functions & exported
  // on PG
  // re-exported here for backwards compatibility
  escapeIdentifier(str) {
    return utils.escapeIdentifier(str)
  }

  escapeLiteral(str) {
    return utils.escapeLiteral(str)
  }

  _pulseQueryQueue() {
    if (this.readyForQuery === true) {
      this._activeQuery = this._queryQueue.shift()
      const activeQuery = this._getActiveQuery()
      if (activeQuery) {
        this.readyForQuery = false
        this.hasExecuted = true

        const queryError = activeQuery.submit(this.connection)
        if (queryError) {
          process.nextTick(() => {
            activeQuery.handleError(queryError, this.connection)
            this.readyForQuery = true
            this._pulseQueryQueue()
          })
        }
      } else if (this.hasExecuted) {
        this._activeQuery = null
        this.emit('drain')
      }
    }
  }

  query(config, values, callback) {
    // can take in strings, config object or query object
    let query
    let result

    if (config == null) {
      throw new TypeError('Client was passed a null or undefined query')
    }

    if (typeof config.submit === 'function') {
      result = query = config
      if (!query.callback) {
        if (typeof values === 'function') {
          query.callback = values
        } else if (callback) {
          query.callback = callback
        }
      }
    } else {
      query = new Query(config, values, callback)
      if (!query.callback) {
        result = new this._Promise((resolve, reject) => {
          query.callback = (err, res) => (err ? reject(err) : resolve(res))
        }).catch((err) => {
          // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
          // application that created the query
          Error.captureStackTrace(err)
          throw err
        })
      } else if (typeof query.callback !== 'function') {
        throw new TypeError('callback is not a function')
      }
    }

    const readTimeout = config.query_timeout || this.connectionParameters.query_timeout
    if (readTimeout) {
      const queryCallback = query.callback || (() => {})

      const readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error, this.connection)
        })

        queryCallback(error)

        // we already returned an error,
        // just do nothing if query completes
        query.callback = () => {}

        // Remove from queue
        const index = this._queryQueue.indexOf(query)
        if (index > -1) {
          this._queryQueue.splice(index, 1)
        }

        this._pulseQueryQueue()
      }, readTimeout)

      query.callback = (err, res) => {
        clearTimeout(readTimeoutTimer)
        queryCallback(err, res)
      }
    }

    if (this.binary && !query.binary) {
      query.binary = true
    }

    if (query._result && !query._result._types) {
      query._result._types = this._types
    }

    if (!this._queryable) {
      process.nextTick(() => {
        query.handleError(new Error('Client has encountered a connection error and is not queryable'), this.connection)
      })
      return result
    }

    if (this._ending) {
      process.nextTick(() => {
        query.handleError(new Error('Client was closed and is not queryable'), this.connection)
      })
      return result
    }

    if (this._queryQueue.length > 0) {
      queryQueueLengthDeprecationNotice()
    }
    this._queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  ref() {
    this.connection.ref()
  }

  unref() {
    this.connection.unref()
  }

  getTransactionStatus() {
    return this._txStatus
  }

  end(cb) {
    this._ending = true

    // if we have never connected, then end is a noop, callback immediately
    if (!this.connection._connecting || this._ended) {
      if (cb) {
        cb()
        return
      } else {
        return this._Promise.resolve()
      }
    }

    if (this._getActiveQuery() || !this._queryable) {
      // if we have an active query we need to force a disconnect
      // on the socket - otherwise a hung query could block end forever
      this.connection.stream.destroy()
    } else {
      this.connection.end()
    }

    if (cb) {
      this.connection.once('end', cb)
    } else {
      return new this._Promise((resolve) => {
        this.connection.once('end', resolve)
      })
    }
  }
  get queryQueue() {
    queryQueueDeprecationNotice()
    return this._queryQueue
  }
}

// expose a Query constructor
Client.Query = Query

module.exports = Client


/***/ }),

/***/ 646:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const dns = __nccwpck_require__(2250)

const defaults = __nccwpck_require__(8995)

const parse = (__nccwpck_require__(6122).parse) // parses a connection string

const val = function (key, config, envVar) {
  if (config[key]) {
    return config[key]
  }

  if (envVar === undefined) {
    envVar = process.env['PG' + key.toUpperCase()]
  } else if (envVar === false) {
    // do nothing ... use false
  } else {
    envVar = process.env[envVar]
  }

  return envVar || defaults[key]
}

const readSSLConfigFromEnvironment = function () {
  switch (process.env.PGSSLMODE) {
    case 'disable':
      return false
    case 'prefer':
    case 'require':
    case 'verify-ca':
    case 'verify-full':
      return true
    case 'no-verify':
      return { rejectUnauthorized: false }
  }
  return defaults.ssl
}

// Convert arg to a string, surround in single quotes, and escape single quotes and backslashes
const quoteParamValue = function (value) {
  return "'" + ('' + value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

const add = function (params, config, paramName) {
  const value = config[paramName]
  if (value !== undefined && value !== null) {
    params.push(paramName + '=' + quoteParamValue(value))
  }
}

class ConnectionParameters {
  constructor(config) {
    // if a string is passed, it is a raw connection string so we parse it into a config
    config = typeof config === 'string' ? parse(config) : config || {}

    // if the config has a connectionString defined, parse IT into the config we use
    // this will override other default values with what is stored in connectionString
    if (config.connectionString) {
      config = Object.assign({}, config, parse(config.connectionString))
    }

    this.user = val('user', config)
    this.database = val('database', config)

    if (this.database === undefined) {
      this.database = this.user
    }

    this.port = parseInt(val('port', config), 10)
    this.host = val('host', config)

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: val('password', config),
    })

    this.binary = val('binary', config)
    this.options = val('options', config)

    this.ssl = typeof config.ssl === 'undefined' ? readSSLConfigFromEnvironment() : config.ssl

    if (typeof this.ssl === 'string') {
      if (this.ssl === 'true') {
        this.ssl = true
      }
    }
    // support passing in ssl=no-verify via connection string
    if (this.ssl === 'no-verify') {
      this.ssl = { rejectUnauthorized: false }
    }
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    // How to negotiate SSL: 'postgres' (default, the traditional SSLRequest
    // handshake) or 'direct' (start the TLS handshake immediately on connect).
    this.sslnegotiation = val('sslnegotiation', config, 'PGSSLNEGOTIATION')
    if (this.sslnegotiation !== undefined && this.sslnegotiation !== 'postgres' && this.sslnegotiation !== 'direct') {
      throw new Error(
        `Invalid sslnegotiation value: "${this.sslnegotiation}". Valid values are "postgres" and "direct".`
      )
    }
    if (this.sslnegotiation === 'direct' && !this.ssl) {
      throw new Error('sslnegotiation=direct requires SSL to be enabled')
    }

    this.client_encoding = val('client_encoding', config)
    this.replication = val('replication', config)
    // a domain socket begins with '/'
    this.isDomainSocket = !(this.host || '').indexOf('/')

    this.application_name = val('application_name', config, 'PGAPPNAME')
    this.fallback_application_name = val('fallback_application_name', config, false)
    this.statement_timeout = val('statement_timeout', config, false)
    this.lock_timeout = val('lock_timeout', config, false)
    this.idle_in_transaction_session_timeout = val('idle_in_transaction_session_timeout', config, false)
    this.query_timeout = val('query_timeout', config, false)

    if (config.connectionTimeoutMillis === undefined) {
      this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0
    } else {
      this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1000)
    }

    if (config.keepAlive === false) {
      this.keepalives = 0
    } else if (config.keepAlive === true) {
      this.keepalives = 1
    }

    if (typeof config.keepAliveInitialDelayMillis === 'number') {
      this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1000)
    }
  }

  getLibpqConnectionString(cb) {
    const params = []
    add(params, this, 'user')
    add(params, this, 'password')
    add(params, this, 'port')
    add(params, this, 'application_name')
    add(params, this, 'fallback_application_name')
    add(params, this, 'connect_timeout')
    add(params, this, 'options')

    const ssl = typeof this.ssl === 'object' ? this.ssl : this.ssl ? { sslmode: this.ssl } : {}
    add(params, ssl, 'sslmode')
    add(params, ssl, 'sslca')
    add(params, ssl, 'sslkey')
    add(params, ssl, 'sslcert')
    add(params, ssl, 'sslrootcert')
    add(params, this, 'sslnegotiation')

    if (this.database) {
      params.push('dbname=' + quoteParamValue(this.database))
    }
    if (this.replication) {
      params.push('replication=' + quoteParamValue(this.replication))
    }
    if (this.host) {
      params.push('host=' + quoteParamValue(this.host))
    }
    if (this.isDomainSocket) {
      return cb(null, params.join(' '))
    }
    if (this.client_encoding) {
      params.push('client_encoding=' + quoteParamValue(this.client_encoding))
    }
    dns.lookup(this.host, function (err, address) {
      if (err) return cb(err, null)
      params.push('hostaddr=' + quoteParamValue(address))
      return cb(null, params.join(' '))
    })
  }
}

module.exports = ConnectionParameters


/***/ }),

/***/ 9809:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const EventEmitter = (__nccwpck_require__(4434).EventEmitter)

const { parse, serialize } = __nccwpck_require__(4233)
const stream = __nccwpck_require__(829)
const { getStream } = stream

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

// TODO(bmc) support binary mode at some point
class Connection extends EventEmitter {
  constructor(config) {
    super()
    config = config || {}

    this.stream = config.stream || getStream(config.ssl)
    if (typeof this.stream === 'function') {
      this.stream = this.stream(config)
    }

    this._keepAlive = config.keepAlive
    this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis
    this.parsedStatements = {}
    this.ssl = config.ssl || false
    this.sslNegotiation = config.sslNegotiation || 'postgres'
    this._ending = false
    this._emitMessage = false
    const self = this
    this.on('newListener', function (eventName) {
      if (eventName === 'message') {
        self._emitMessage = true
      }
    })
  }

  connect(port, host) {
    const self = this

    this._connecting = true
    this.stream.setNoDelay(true)
    this.stream.connect(port, host)

    this.stream.once('connect', function () {
      if (self._keepAlive) {
        self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis)
      }
      self.emit('connect')
    })

    const reportStreamError = function (error) {
      // errors about disconnections should be ignored during disconnect
      if (self._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
        return
      }
      self.emit('error', error)
    }
    this.stream.on('error', reportStreamError)

    this.stream.on('close', function () {
      self.emit('end')
    })

    if (!this.ssl) {
      return this.attachListeners(this.stream)
    }

    // With direct SSL negotiation the TLS handshake starts immediately on the
    // raw socket, skipping the SSLRequest packet and the server's 'S'/'N' reply.
    if (this.sslNegotiation === 'direct') {
      return this.stream.once('connect', function () {
        self.upgradeToSSL(host, reportStreamError)
      })
    }

    this.stream.once('data', function (buffer) {
      const responseCode = buffer.toString('utf8')
      switch (responseCode) {
        case 'S': // Server supports SSL connections, continue with a secure connection
          break
        case 'N': // Server does not support SSL connections
          self.stream.end()
          return self.emit('error', new Error('The server does not support SSL connections'))
        default:
          // Any other response byte, including 'E' (ErrorResponse) indicating a server error
          self.stream.end()
          return self.emit('error', new Error('There was an error establishing an SSL connection'))
      }
      self.upgradeToSSL(host, reportStreamError)
    })
  }

  upgradeToSSL(host, reportStreamError) {
    const self = this
    const options = {
      socket: self.stream,
    }

    if (self.ssl !== true) {
      Object.assign(options, self.ssl)

      if ('key' in self.ssl) {
        options.key = self.ssl.key
      }
    }

    // Direct SSL negotiation requires ALPN so the server can confirm it is
    // speaking the PostgreSQL protocol over the TLS connection.
    if (self.sslNegotiation === 'direct') {
      options.ALPNProtocols = ['postgresql']
    }

    const net = __nccwpck_require__(9278)
    if (net.isIP && net.isIP(host) === 0) {
      options.servername = host
    }
    try {
      self.stream = stream.getSecureStream(options)
    } catch (err) {
      return self.emit('error', err)
    }
    self.attachListeners(self.stream)
    self.stream.on('error', reportStreamError)

    self.emit('sslconnect')
  }

  attachListeners(stream) {
    parse(stream, (msg) => {
      const eventName = msg.name === 'error' ? 'errorMessage' : msg.name
      if (this._emitMessage) {
        this.emit('message', msg)
      }
      this.emit(eventName, msg)
    })
  }

  requestSsl() {
    this.stream.write(serialize.requestSsl())
  }

  startup(config) {
    this.stream.write(serialize.startup(config))
  }

  cancel(processID, secretKey) {
    this._send(serialize.cancel(processID, secretKey))
  }

  password(password) {
    this._send(serialize.password(password))
  }

  sendSASLInitialResponseMessage(mechanism, initialResponse) {
    this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse))
  }

  sendSCRAMClientFinalMessage(additionalData) {
    this._send(serialize.sendSCRAMClientFinalMessage(additionalData))
  }

  _send(buffer) {
    if (!this.stream.writable) {
      return false
    }
    return this.stream.write(buffer)
  }

  query(text) {
    this._send(serialize.query(text))
  }

  // send parse message
  parse(query) {
    this._send(serialize.parse(query))
  }

  // send bind message
  bind(config) {
    this._send(serialize.bind(config))
  }

  // send execute message
  execute(config) {
    this._send(serialize.execute(config))
  }

  flush() {
    if (this.stream.writable) {
      this.stream.write(flushBuffer)
    }
  }

  sync() {
    this._ending = true
    this._send(syncBuffer)
  }

  ref() {
    this.stream.ref()
  }

  unref() {
    this.stream.unref()
  }

  end() {
    // 0x58 = 'X'
    this._ending = true
    if (!this._connecting || !this.stream.writable) {
      this.stream.end()
      return
    }
    return this.stream.write(endBuffer, () => {
      this.stream.end()
    })
  }

  close(msg) {
    this._send(serialize.close(msg))
  }

  describe(msg) {
    this._send(serialize.describe(msg))
  }

  sendCopyFromChunk(chunk) {
    this._send(serialize.copyData(chunk))
  }

  endCopyFrom() {
    this._send(serialize.copyDone())
  }

  sendCopyFail(msg) {
    this._send(serialize.copyFail(msg))
  }
}

module.exports = Connection


/***/ }),

/***/ 9765:
/***/ ((module) => {

function x509Error(msg, cert) {
  return new Error('SASL channel binding: ' + msg + ' when parsing public certificate ' + cert.toString('base64'))
}

function readASN1Length(data, index) {
  let length = data[index++]
  if (length < 0x80) return { length, index }

  const lengthBytes = length & 0x7f
  if (lengthBytes > 4) throw x509Error('bad length', data)

  length = 0
  for (let i = 0; i < lengthBytes; i++) {
    length = (length << 8) | data[index++]
  }

  return { length, index }
}

function readASN1OID(data, index) {
  if (data[index++] !== 0x6) throw x509Error('non-OID data', data) // 6 = OID

  const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index)
  index = indexAfterOIDLength
  const lastIndex = index + OIDLength

  const byte1 = data[index++]
  let oid = ((byte1 / 40) >> 0) + '.' + (byte1 % 40)

  while (index < lastIndex) {
    // loop over numbers in OID
    let value = 0
    while (index < lastIndex) {
      // loop over bytes in number
      const nextByte = data[index++]
      value = (value << 7) | (nextByte & 0x7f)
      if (nextByte < 0x80) break
    }
    oid += '.' + value
  }

  return { oid, index }
}

function expectASN1Seq(data, index) {
  if (data[index++] !== 0x30) throw x509Error('non-sequence data', data) // 30 = Sequence
  return readASN1Length(data, index)
}

function signatureAlgorithmHashFromCertificate(data, index) {
  // read this thread: https://www.postgresql.org/message-id/17760-b6c61e752ec07060%40postgresql.org
  if (index === undefined) index = 0
  index = expectASN1Seq(data, index).index
  const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index)
  index = indexAfterCertInfoLength + certInfoLength // skip over certificate info
  index = expectASN1Seq(data, index).index // skip over signature length field
  const { oid, index: indexAfterOID } = readASN1OID(data, index)
  switch (oid) {
    // RSA
    case '1.2.840.113549.1.1.4':
      return 'MD5'
    case '1.2.840.113549.1.1.5':
      return 'SHA-1'
    case '1.2.840.113549.1.1.11':
      return 'SHA-256'
    case '1.2.840.113549.1.1.12':
      return 'SHA-384'
    case '1.2.840.113549.1.1.13':
      return 'SHA-512'
    case '1.2.840.113549.1.1.14':
      return 'SHA-224'
    case '1.2.840.113549.1.1.15':
      return 'SHA512-224'
    case '1.2.840.113549.1.1.16':
      return 'SHA512-256'
    // ECDSA
    case '1.2.840.10045.4.1':
      return 'SHA-1'
    case '1.2.840.10045.4.3.1':
      return 'SHA-224'
    case '1.2.840.10045.4.3.2':
      return 'SHA-256'
    case '1.2.840.10045.4.3.3':
      return 'SHA-384'
    case '1.2.840.10045.4.3.4':
      return 'SHA-512'
    // RSASSA-PSS: hash is indicated separately
    case '1.2.840.113549.1.1.10': {
      index = indexAfterOID
      index = expectASN1Seq(data, index).index
      if (data[index++] !== 0xa0) throw x509Error('non-tag data', data) // a0 = constructed tag 0
      index = readASN1Length(data, index).index // skip over tag length field
      index = expectASN1Seq(data, index).index // skip over sequence length field
      const { oid: hashOID } = readASN1OID(data, index)
      switch (hashOID) {
        // standalone hash OIDs
        case '1.2.840.113549.2.5':
          return 'MD5'
        case '1.3.14.3.2.26':
          return 'SHA-1'
        case '2.16.840.1.101.3.4.2.1':
          return 'SHA-256'
        case '2.16.840.1.101.3.4.2.2':
          return 'SHA-384'
        case '2.16.840.1.101.3.4.2.3':
          return 'SHA-512'
      }
      throw x509Error('unknown hash OID ' + hashOID, data)
    }
    // Ed25519 -- see https: return//github.com/openssl/openssl/issues/15477
    case '1.3.101.110':
    case '1.3.101.112': // ph
      return 'SHA-512'
    // Ed448 -- still not in pg 17.2 (if supported, digest would be SHAKE256 x 64 bytes)
    case '1.3.101.111':
    case '1.3.101.113': // ph
      throw x509Error('Ed448 certificate channel binding is not currently supported by Postgres')
  }
  throw x509Error('unknown OID ' + oid, data)
}

module.exports = { signatureAlgorithmHashFromCertificate }


/***/ }),

/***/ 948:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


const crypto = __nccwpck_require__(4150)
const { signatureAlgorithmHashFromCertificate } = __nccwpck_require__(9765)

// SASLprep (RFC 4013) — minimal in-tree implementation.
//
// Per RFC 5802 §2.2, the SCRAM-SHA-256 client must normalize the password via
// SASLprep before feeding it into PBKDF2. PostgreSQL's server applies the same
// SASLprep when computing the stored verifier, and libpq does the same client
// side, so passwords whose NFKC form differs from the raw form
// would otherwise authenticate against psql/libpq but fail against pg with `28P01`.
//
// We deliberately implement only the three steps that change the byte content:
//   1. RFC 3454 Table C.1.2 (non-ASCII space) → U+0020 SPACE.
//   2. RFC 3454 Table B.1 (commonly mapped to nothing) → empty.
//   3. NFKC normalization.
// We skip the prohibition (RFC 4013 §2.3) and bidi (RFC 3454 §6) checks.
// libpq is forgiving on those paths and Postgres's own SASLprep matches that
// leniency for legacy roles, so omitting the rejection logic keeps existing
// roles working without adding complexity.
function saslprep(password) {
  // RFC 3454 Table C.1.2 — non-ASCII space characters, mapped to U+0020.
  const nonAsciiSpace = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g
  // RFC 3454 Table B.1 — "commonly mapped to nothing". The set intentionally
  // contains zero-width joiners and variation selectors — the very characters
  // ESLint's no-misleading-character-class warns about — because they combine
  // with their neighbors and the RFC strips them for that reason.
  // eslint-disable-next-line no-misleading-character-class
  const mappedToNothing = /[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g
  return password.replace(nonAsciiSpace, ' ').replace(mappedToNothing, '').normalize('NFKC')
}

const DEFAULT_MAX_SCRAM_ITERATIONS = 100000

function startSession(mechanisms, stream, scramMaxIterations = DEFAULT_MAX_SCRAM_ITERATIONS) {
  const candidates = ['SCRAM-SHA-256']
  if (stream) candidates.unshift('SCRAM-SHA-256-PLUS') // higher-priority, so placed first

  const mechanism = candidates.find((candidate) => mechanisms.includes(candidate))

  if (!mechanism) {
    throw new Error('SASL: Only mechanism(s) ' + candidates.join(' and ') + ' are supported')
  }

  if (mechanism === 'SCRAM-SHA-256-PLUS' && typeof stream.getPeerCertificate !== 'function') {
    // this should never happen if we are really talking to a Postgres server
    throw new Error('SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate')
  }

  const clientNonce = crypto.randomBytes(18).toString('base64')
  const gs2Header = mechanism === 'SCRAM-SHA-256-PLUS' ? 'p=tls-server-end-point' : stream ? 'y' : 'n'

  return {
    mechanism,
    clientNonce,
    response: gs2Header + ',,n=*,r=' + clientNonce,
    message: 'SASLInitialResponse',
    scramMaxIterations,
  }
}

async function continueSession(session, password, serverData, stream) {
  if (session.message !== 'SASLInitialResponse') {
    throw new Error('SASL: Last message was not SASLInitialResponse')
  }
  if (typeof password !== 'string') {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')
  }
  if (password === '') {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string')
  }
  if (typeof serverData !== 'string') {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string')
  }

  const sv = parseServerFirstMessage(serverData)

  if (!sv.nonce.startsWith(session.clientNonce)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce')
  } else if (sv.nonce.length === session.clientNonce.length) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short')
  }

  const scramMaxIterations =
    typeof session.scramMaxIterations === 'number' ? session.scramMaxIterations : DEFAULT_MAX_SCRAM_ITERATIONS
  // a value of 0 disables the iteration count check
  if (scramMaxIterations !== 0 && sv.iteration > scramMaxIterations) {
    throw new Error(
      'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration count ' +
        sv.iteration +
        ' exceeds scramMaxIterations of ' +
        scramMaxIterations
    )
  }

  const clientFirstMessageBare = 'n=*,r=' + session.clientNonce
  const serverFirstMessage = 'r=' + sv.nonce + ',s=' + sv.salt + ',i=' + sv.iteration

  // without channel binding:
  let channelBinding = stream ? 'eSws' : 'biws' // 'y,,' or 'n,,', base64-encoded

  // override if channel binding is in use:
  if (session.mechanism === 'SCRAM-SHA-256-PLUS') {
    const peerCert = stream.getPeerCertificate().raw
    let hashName = signatureAlgorithmHashFromCertificate(peerCert)
    if (hashName === 'MD5' || hashName === 'SHA-1') hashName = 'SHA-256'
    const certHash = await crypto.hashByName(hashName, peerCert)
    const bindingData = Buffer.concat([Buffer.from('p=tls-server-end-point,,'), Buffer.from(certHash)])
    channelBinding = bindingData.toString('base64')
  }

  const clientFinalMessageWithoutProof = 'c=' + channelBinding + ',r=' + sv.nonce
  const authMessage = clientFirstMessageBare + ',' + serverFirstMessage + ',' + clientFinalMessageWithoutProof

  const saltBytes = Buffer.from(sv.salt, 'base64')
  const saltedPassword = await crypto.deriveKey(saslprep(password), saltBytes, sv.iteration)
  const clientKey = await crypto.hmacSha256(saltedPassword, 'Client Key')
  const storedKey = await crypto.sha256(clientKey)
  const clientSignature = await crypto.hmacSha256(storedKey, authMessage)
  const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString('base64')
  const serverKey = await crypto.hmacSha256(saltedPassword, 'Server Key')
  const serverSignatureBytes = await crypto.hmacSha256(serverKey, authMessage)

  session.message = 'SASLResponse'
  session.serverSignature = Buffer.from(serverSignatureBytes).toString('base64')
  session.response = clientFinalMessageWithoutProof + ',p=' + clientProof
}

function finalizeSession(session, serverData) {
  if (session.message !== 'SASLResponse') {
    throw new Error('SASL: Last message was not SASLResponse')
  }
  if (typeof serverData !== 'string') {
    throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string')
  }

  const { serverSignature } = parseServerFinalMessage(serverData)

  if (serverSignature !== session.serverSignature) {
    throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match')
  }
}

/**
 * printable       = %x21-2B / %x2D-7E
 *                   ;; Printable ASCII except ",".
 *                   ;; Note that any "printable" is also
 *                   ;; a valid "value".
 */
function isPrintableChars(text) {
  if (typeof text !== 'string') {
    throw new TypeError('SASL: text must be a string')
  }
  return text
    .split('')
    .map((_, i) => text.charCodeAt(i))
    .every((c) => (c >= 0x21 && c <= 0x2b) || (c >= 0x2d && c <= 0x7e))
}

/**
 * base64-char     = ALPHA / DIGIT / "/" / "+"
 *
 * base64-4        = 4base64-char
 *
 * base64-3        = 3base64-char "="
 *
 * base64-2        = 2base64-char "=="
 *
 * base64          = *base64-4 [base64-3 / base64-2]
 */
function isBase64(text) {
  return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text)
}

function parseAttributePairs(text) {
  if (typeof text !== 'string') {
    throw new TypeError('SASL: attribute pairs text must be a string')
  }

  return new Map(
    text.split(',').map((attrValue) => {
      if (!/^.=/.test(attrValue)) {
        throw new Error('SASL: Invalid attribute pair entry')
      }
      const name = attrValue[0]
      const value = attrValue.substring(2)
      return [name, value]
    })
  )
}

function parseServerFirstMessage(data) {
  const attrPairs = parseAttributePairs(data)

  const nonce = attrPairs.get('r')
  if (!nonce) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing')
  } else if (!isPrintableChars(nonce)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters')
  }
  const salt = attrPairs.get('s')
  if (!salt) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing')
  } else if (!isBase64(salt)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64')
  }
  const iterationText = attrPairs.get('i')
  if (!iterationText) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing')
  } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count')
  }
  const iteration = parseInt(iterationText, 10)

  return {
    nonce,
    salt,
    iteration,
  }
}

function parseServerFinalMessage(serverData) {
  const attrPairs = parseAttributePairs(serverData)
  const error = attrPairs.get('e')
  const serverSignature = attrPairs.get('v')

  if (error) {
    throw new Error(`SASL: SCRAM-SERVER-FINAL-MESSAGE: server returned error: "${error}"`)
  }

  if (!serverSignature) {
    throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing')
  } else if (!isBase64(serverSignature)) {
    throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64')
  }
  return {
    serverSignature,
  }
}

function xorBuffers(a, b) {
  if (!Buffer.isBuffer(a)) {
    throw new TypeError('first argument must be a Buffer')
  }
  if (!Buffer.isBuffer(b)) {
    throw new TypeError('second argument must be a Buffer')
  }
  if (a.length !== b.length) {
    throw new Error('Buffer lengths must match')
  }
  if (a.length === 0) {
    throw new Error('Buffers cannot be empty')
  }
  return Buffer.from(a.map((_, i) => a[i] ^ b[i]))
}

module.exports = {
  startSession,
  continueSession,
  finalizeSession,
  DEFAULT_MAX_SCRAM_ITERATIONS,
}


/***/ }),

/***/ 4150:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const nodeCrypto = __nccwpck_require__(6982)

module.exports = {
  postgresMd5PasswordHash,
  randomBytes,
  deriveKey,
  sha256,
  hashByName,
  hmacSha256,
  md5,
}

/**
 * The Web Crypto API - grabbed from the Node.js library or the global
 * @type Crypto
 */
// eslint-disable-next-line no-undef
const webCrypto = nodeCrypto.webcrypto || globalThis.crypto
/**
 * The SubtleCrypto API for low level crypto operations.
 * @type SubtleCrypto
 */
const subtleCrypto = webCrypto.subtle
const textEncoder = new TextEncoder()

/**
 *
 * @param {*} length
 * @returns
 */
function randomBytes(length) {
  return webCrypto.getRandomValues(Buffer.alloc(length))
}

async function md5(string) {
  try {
    return nodeCrypto.createHash('md5').update(string, 'utf-8').digest('hex')
  } catch (e) {
    // `createHash()` failed so we are probably not in Node.js, use the WebCrypto API instead.
    // Note that the MD5 algorithm on WebCrypto is not available in Node.js.
    // This is why we cannot just use WebCrypto in all environments.
    const data = typeof string === 'string' ? textEncoder.encode(string) : string
    const hash = await subtleCrypto.digest('MD5', data)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

// See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
async function postgresMd5PasswordHash(user, password, salt) {
  const inner = await md5(password + user)
  const outer = await md5(Buffer.concat([Buffer.from(inner), salt]))
  return 'md5' + outer
}

/**
 * Create a SHA-256 digest of the given data
 * @param {Buffer} data
 */
async function sha256(text) {
  return await subtleCrypto.digest('SHA-256', text)
}

async function hashByName(hashName, text) {
  return await subtleCrypto.digest(hashName, text)
}

/**
 * Sign the message with the given key
 * @param {ArrayBuffer} keyBuffer
 * @param {string} msg
 */
async function hmacSha256(keyBuffer, msg) {
  const key = await subtleCrypto.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await subtleCrypto.sign('HMAC', key, textEncoder.encode(msg))
}

/**
 * Derive a key from the password and salt
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 */
async function deriveKey(password, salt, iterations) {
  const key = await subtleCrypto.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const params = { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }
  return await subtleCrypto.deriveBits(params, key, 32 * 8, ['deriveBits'])
}


/***/ }),

/***/ 8995:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



let user
try {
  user = process.platform === 'win32' ? process.env.USERNAME : process.env.USER
} catch {
  // ignore, e.g., Deno without --allow-env
}

module.exports = {
  // database host. defaults to localhost
  host: 'localhost',

  // database user's name
  user,

  // name of database to connect
  database: undefined,

  // database user's password
  password: null,

  // a Postgres connection string to be used instead of setting individual connection items
  // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
  // in the defaults object.
  connectionString: undefined,

  // database port
  port: 5432,

  // number of rows to return at a time from a prepared statement's
  // portal. 0 will return all rows at once
  rows: 0,

  // binary result mode
  binary: false,

  // Connection pool options - see https://github.com/brianc/node-pg-pool

  // number of connections to use in connection pool
  // 0 will disable connection pooling
  max: 10,

  // max milliseconds a client can go unused before it is removed
  // from the pool and destroyed
  idleTimeoutMillis: 30000,

  client_encoding: '',

  ssl: false,

  // SSL negotiation style: 'postgres' (traditional SSLRequest) or 'direct'
  sslnegotiation: undefined,

  application_name: undefined,

  fallback_application_name: undefined,

  options: undefined,

  parseInputDatesAsUTC: false,

  // max milliseconds any query using this connection will execute for before timing out in error.
  // false=unlimited
  statement_timeout: false,

  // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
  // false=unlimited
  lock_timeout: false,

  // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
  // false=unlimited
  idle_in_transaction_session_timeout: false,

  // max milliseconds to wait for query to complete (client side)
  query_timeout: false,

  connect_timeout: 0,

  keepalives: 1,

  keepalives_idle: 0,
}

const pgTypes = __nccwpck_require__(1549)
// save default parsers
const parseBigInteger = pgTypes.getTypeParser(20, 'text')
const parseBigIntegerArray = pgTypes.getTypeParser(1016, 'text')

// parse int8 so you can get your count values as actual numbers
module.exports.__defineSetter__('parseInt8', function (val) {
  pgTypes.setTypeParser(20, 'text', val ? pgTypes.getTypeParser(23, 'text') : parseBigInteger)
  pgTypes.setTypeParser(1016, 'text', val ? pgTypes.getTypeParser(1007, 'text') : parseBigIntegerArray)
})


/***/ }),

/***/ 3273:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const Client = __nccwpck_require__(5042)
const defaults = __nccwpck_require__(8995)
const Connection = __nccwpck_require__(9809)
const Result = __nccwpck_require__(6424)
const utils = __nccwpck_require__(9652)
const Pool = __nccwpck_require__(7558)
const TypeOverrides = __nccwpck_require__(365)
const { DatabaseError } = __nccwpck_require__(4233)
const { escapeIdentifier, escapeLiteral } = __nccwpck_require__(9652)

const poolFactory = (Client) => {
  return class BoundPool extends Pool {
    constructor(options) {
      super(options, Client)
    }
  }
}

const PG = function (clientConstructor) {
  this.defaults = defaults
  this.Client = clientConstructor
  this.Query = this.Client.Query
  this.Pool = poolFactory(this.Client)
  this._pools = []
  this.Connection = Connection
  this.types = __nccwpck_require__(1549)
  this.DatabaseError = DatabaseError
  this.TypeOverrides = TypeOverrides
  this.escapeIdentifier = escapeIdentifier
  this.escapeLiteral = escapeLiteral
  this.Result = Result
  this.utils = utils
}

let clientConstructor = Client

let forceNative = false
try {
  forceNative = !!process.env.NODE_PG_FORCE_NATIVE
} catch {
  // ignore, e.g., Deno without --allow-env
}

if (forceNative) {
  clientConstructor = __nccwpck_require__(5301)
}

module.exports = new PG(clientConstructor)

// lazy require native module...the native module may not have installed
Object.defineProperty(module.exports, "native", ({
  configurable: true,
  enumerable: false,
  get() {
    let native = null
    try {
      native = new PG(__nccwpck_require__(5301))
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err
      }
    }

    // overwrite module.exports.native so that getter is never called again
    Object.defineProperty(module.exports, "native", ({
      value: native,
    }))

    return native
  },
}))


/***/ }),

/***/ 8942:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const nodeUtils = __nccwpck_require__(9023)
// eslint-disable-next-line
var Native
// eslint-disable-next-line no-useless-catch
try {
  // Wrap this `require()` in a try-catch to avoid upstream bundlers from complaining that this might not be available since it is an optional import
  Native = __nccwpck_require__(4390)
} catch (e) {
  throw e
}
const TypeOverrides = __nccwpck_require__(365)
const EventEmitter = (__nccwpck_require__(4434).EventEmitter)
const util = __nccwpck_require__(9023)
const ConnectionParameters = __nccwpck_require__(646)

const NativeQuery = __nccwpck_require__(7581)

const queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.'
)

const Client = (module.exports = function (config) {
  EventEmitter.call(this)
  config = config || {}

  this._Promise = config.Promise || global.Promise
  this._types = new TypeOverrides(config.types)

  this.native = new Native({
    types: this._types,
  })

  this._queryQueue = []
  this._ending = false
  this._connecting = false
  this._connected = false
  this._queryable = true

  // keep these on the object for legacy reasons
  // for the time being. TODO: deprecate all this jazz
  const cp = (this.connectionParameters = new ConnectionParameters(config))
  if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString
  this.user = cp.user

  // "hiding" the password so it doesn't show up in stack traces
  // or if the client is console.logged
  Object.defineProperty(this, 'password', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: cp.password,
  })
  this.database = cp.database
  this.host = cp.host
  this.port = cp.port

  // a hash to hold named queries
  this.namedQueries = {}
})

Client.Query = NativeQuery

util.inherits(Client, EventEmitter)

Client.prototype._errorAllQueries = function (err) {
  const enqueueError = (query) => {
    process.nextTick(() => {
      query.native = this.native
      query.handleError(err)
    })
  }

  if (this._hasActiveQuery()) {
    enqueueError(this._activeQuery)
    this._activeQuery = null
  }

  this._queryQueue.forEach(enqueueError)
  this._queryQueue.length = 0
}

// connect to the backend
// pass an optional callback to be called once connected
// or with an error if there was a connection error
Client.prototype._connect = function (cb) {
  const self = this

  if (this._connecting) {
    process.nextTick(() => cb(new Error('Client has already been connected. You cannot reuse a client.')))
    return
  }

  this._connecting = true

  this.connectionParameters.getLibpqConnectionString(function (err, conString) {
    if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString
    if (err) return cb(err)
    self.native.connect(conString, function (err) {
      if (err) {
        self.native.end()
        return cb(err)
      }

      // set internal states to connected
      self._connected = true

      // handle connection errors from the native layer
      self.native.on('error', function (err) {
        self._queryable = false
        self._errorAllQueries(err)
        self.emit('error', err)
      })

      self.native.on('notification', function (msg) {
        self.emit('notification', {
          channel: msg.relname,
          payload: msg.extra,
        })
      })

      // signal we are connected now
      self.emit('connect')
      self._pulseQueryQueue(true)

      cb(null, this)
    })
  })
}

Client.prototype.connect = function (callback) {
  if (callback) {
    this._connect(callback)
    return
  }

  return new this._Promise((resolve, reject) => {
    this._connect((error) => {
      if (error) {
        reject(error)
      } else {
        resolve(this)
      }
    })
  })
}

// send a query to the server
// this method is highly overloaded to take
// 1) string query, optional array of parameters, optional function callback
// 2) object query with {
//    string query
//    optional array values,
//    optional function callback instead of as a separate parameter
//    optional string name to name & cache the query plan
//    optional string rowMode = 'array' for an array of results
//  }
Client.prototype.query = function (config, values, callback) {
  let query
  let result
  let readTimeout
  let readTimeoutTimer
  let queryCallback

  if (config === null || config === undefined) {
    throw new TypeError('Client was passed a null or undefined query')
  } else if (typeof config.submit === 'function') {
    readTimeout = config.query_timeout || this.connectionParameters.query_timeout
    result = query = config
    // accept query(new Query(...), (err, res) => { }) style
    if (typeof values === 'function') {
      config.callback = values
    }
  } else {
    readTimeout = config.query_timeout || this.connectionParameters.query_timeout
    query = new NativeQuery(config, values, callback)
    if (!query.callback) {
      let resolveOut, rejectOut
      result = new this._Promise((resolve, reject) => {
        resolveOut = resolve
        rejectOut = reject
      }).catch((err) => {
        Error.captureStackTrace(err)
        throw err
      })
      query.callback = (err, res) => (err ? rejectOut(err) : resolveOut(res))
    }
  }

  if (readTimeout) {
    queryCallback = query.callback || (() => {})

    readTimeoutTimer = setTimeout(() => {
      const error = new Error('Query read timeout')

      process.nextTick(() => {
        query.handleError(error, this.connection)
      })

      queryCallback(error)

      // we already returned an error,
      // just do nothing if query completes
      query.callback = () => {}

      // Remove from queue
      const index = this._queryQueue.indexOf(query)
      if (index > -1) {
        this._queryQueue.splice(index, 1)
      }

      this._pulseQueryQueue()
    }, readTimeout)

    query.callback = (err, res) => {
      clearTimeout(readTimeoutTimer)
      queryCallback(err, res)
    }
  }

  if (!this._queryable) {
    query.native = this.native
    process.nextTick(() => {
      query.handleError(new Error('Client has encountered a connection error and is not queryable'))
    })
    return result
  }

  if (this._ending) {
    query.native = this.native
    process.nextTick(() => {
      query.handleError(new Error('Client was closed and is not queryable'))
    })
    return result
  }

  if (this._queryQueue.length > 0) {
    queryQueueLengthDeprecationNotice()
  }

  this._queryQueue.push(query)
  this._pulseQueryQueue()
  return result
}

// disconnect from the backend server
Client.prototype.end = function (cb) {
  const self = this

  this._ending = true

  if (this._connecting && !this._connected) {
    this.once('connect', () => {
      this.end(() => {})
    })
  }
  let result
  if (!cb) {
    result = new this._Promise(function (resolve, reject) {
      cb = (err) => (err ? reject(err) : resolve())
    })
  }

  this.native.end(function () {
    self._connected = false

    self._errorAllQueries(new Error('Connection terminated'))

    process.nextTick(() => {
      self.emit('end')
      if (cb) cb()
    })
  })
  return result
}

Client.prototype._hasActiveQuery = function () {
  return this._activeQuery && this._activeQuery.state !== 'error' && this._activeQuery.state !== 'end'
}

Client.prototype._pulseQueryQueue = function (initialConnection) {
  if (!this._connected) {
    return
  }
  if (this._hasActiveQuery()) {
    return
  }
  const query = this._queryQueue.shift()
  if (!query) {
    if (!initialConnection) {
      this.emit('drain')
    }
    return
  }
  this._activeQuery = query
  query.submit(this)
  const self = this
  query.once('_done', function () {
    self._pulseQueryQueue()
  })
}

// attempt to cancel an in-progress query
Client.prototype.cancel = function (query) {
  if (this._activeQuery === query) {
    this.native.cancel(function () {})
  } else if (this._queryQueue.indexOf(query) !== -1) {
    this._queryQueue.splice(this._queryQueue.indexOf(query), 1)
  }
}

Client.prototype.ref = function () {}
Client.prototype.unref = function () {}

Client.prototype.setTypeParser = function (oid, format, parseFn) {
  return this._types.setTypeParser(oid, format, parseFn)
}

Client.prototype.getTypeParser = function (oid, format) {
  return this._types.getTypeParser(oid, format)
}

Client.prototype.isConnected = function () {
  return this._connected
}

Client.prototype.getTransactionStatus = function () {
  return this.native.getTransactionStatus()
}


/***/ }),

/***/ 5301:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


module.exports = __nccwpck_require__(8942)


/***/ }),

/***/ 7581:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const EventEmitter = (__nccwpck_require__(4434).EventEmitter)
const util = __nccwpck_require__(9023)
const utils = __nccwpck_require__(9652)

const NativeQuery = (module.exports = function (config, values, callback) {
  EventEmitter.call(this)
  config = utils.normalizeQueryConfig(config, values, callback)
  this.text = config.text
  this.values = config.values
  this.name = config.name
  this.queryMode = config.queryMode
  this.callback = config.callback
  this.state = 'new'
  this._arrayMode = config.rowMode === 'array'

  // if the 'row' event is listened for
  // then emit them as they come in
  // without setting singleRowMode to true
  // this has almost no meaning because libpq
  // reads all rows into memory before returning any
  this._emitRowEvents = false
  this.on(
    'newListener',
    function (event) {
      if (event === 'row') this._emitRowEvents = true
    }.bind(this)
  )
})

util.inherits(NativeQuery, EventEmitter)

const errorFieldMap = {
  sqlState: 'code',
  statementPosition: 'position',
  messagePrimary: 'message',
  context: 'where',
  schemaName: 'schema',
  tableName: 'table',
  columnName: 'column',
  dataTypeName: 'dataType',
  constraintName: 'constraint',
  sourceFile: 'file',
  sourceLine: 'line',
  sourceFunction: 'routine',
}

NativeQuery.prototype.handleError = function (err) {
  // copy pq error fields into the error object
  const fields = this.native.pq.resultErrorFields()
  if (fields) {
    for (const key in fields) {
      const normalizedFieldName = errorFieldMap[key] || key
      err[normalizedFieldName] = fields[key]
    }
  }
  if (this.callback) {
    this.callback(err)
  } else {
    this.emit('error', err)
  }
  this.state = 'error'
}

NativeQuery.prototype.then = function (onSuccess, onFailure) {
  return this._getPromise().then(onSuccess, onFailure)
}

NativeQuery.prototype.catch = function (callback) {
  return this._getPromise().catch(callback)
}

NativeQuery.prototype._getPromise = function () {
  if (this._promise) return this._promise
  this._promise = new Promise(
    function (resolve, reject) {
      this._once('end', resolve)
      this._once('error', reject)
    }.bind(this)
  )
  return this._promise
}

NativeQuery.prototype.submit = function (client) {
  this.state = 'running'
  const self = this
  this.native = client.native
  client.native.arrayMode = this._arrayMode

  let after = function (err, rows, results) {
    client.native.arrayMode = false
    setImmediate(function () {
      self.emit('_done')
    })

    // handle possible query error
    if (err) {
      return self.handleError(err)
    }

    // emit row events for each row in the result
    if (self._emitRowEvents) {
      if (results.length > 1) {
        rows.forEach((rowOfRows, i) => {
          rowOfRows.forEach((row) => {
            self.emit('row', row, results[i])
          })
        })
      } else {
        rows.forEach(function (row) {
          self.emit('row', row, results)
        })
      }
    }

    // handle successful result
    self.state = 'end'
    self.emit('end', results)
    if (self.callback) {
      self.callback(null, results)
    }
  }

  if (process.domain) {
    after = process.domain.bind(after)
  }

  // named query
  if (this.name) {
    if (this.name.length > 63) {
      console.error('Warning! Postgres only supports 63 characters for query names.')
      console.error('You supplied %s (%s)', this.name, this.name.length)
      console.error('This can cause conflicts and silent errors executing queries')
    }
    const values = (this.values || []).map(utils.prepareValue)

    // check if the client has already executed this named query
    // if so...just execute it again - skip the planning phase
    if (client.namedQueries[this.name]) {
      if (this.text && client.namedQueries[this.name] !== this.text) {
        const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
        return after(err)
      }
      return client.native.execute(this.name, values, after)
    }
    // plan the named query the first time, then execute it
    return client.native.prepare(this.name, this.text, values.length, function (err) {
      if (err) return after(err)
      client.namedQueries[self.name] = self.text
      return self.native.execute(self.name, values, after)
    })
  } else if (this.values) {
    if (!Array.isArray(this.values)) {
      const err = new Error('Query values must be an array')
      return after(err)
    }
    const vals = this.values.map(utils.prepareValue)
    client.native.query(this.text, vals, after)
  } else if (this.queryMode === 'extended') {
    client.native.query(this.text, [], after)
  } else {
    client.native.query(this.text, after)
  }
}


/***/ }),

/***/ 4473:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const { EventEmitter } = __nccwpck_require__(4434)

const Result = __nccwpck_require__(6424)
const utils = __nccwpck_require__(9652)

class Query extends EventEmitter {
  constructor(config, values, callback) {
    super()

    config = utils.normalizeQueryConfig(config, values, callback)

    this.text = config.text
    this.values = config.values
    this.rows = config.rows
    this.types = config.types
    this.name = config.name
    this.queryMode = config.queryMode
    this.binary = config.binary
    // use unique portal name each time
    this.portal = config.portal || ''
    this.callback = config.callback
    this._rowMode = config.rowMode
    if (process.domain && config.callback) {
      this.callback = process.domain.bind(config.callback)
    }
    this._result = new Result(this._rowMode, this.types)

    // potential for multiple results
    this._results = this._result
    this._canceledDueToError = false
  }

  requiresPreparation() {
    if (this.queryMode === 'extended') {
      return true
    }

    // named queries must always be prepared
    if (this.name) {
      return true
    }
    // always prepare if there are max number of rows expected per
    // portal execution
    if (this.rows) {
      return true
    }
    // don't prepare empty text queries
    if (!this.text) {
      return false
    }
    // prepare if there are values
    if (!this.values) {
      return false
    }
    return this.values.length > 0
  }

  _checkForMultirow() {
    // if we already have a result with a command property
    // then we've already executed one query in a multi-statement simple query
    // turn our results into an array of results
    if (this._result.command) {
      if (!Array.isArray(this._results)) {
        this._results = [this._result]
      }
      this._result = new Result(this._rowMode, this._result._types)
      this._results.push(this._result)
    }
  }

  // associates row metadata from the supplied
  // message with this query object
  // metadata used when parsing row results
  handleRowDescription(msg) {
    this._checkForMultirow()
    this._result.addFields(msg.fields)
    this._accumulateRows = this.callback || !this.listeners('row').length
  }

  handleDataRow(msg) {
    let row

    if (this._canceledDueToError) {
      return
    }

    try {
      row = this._result.parseRow(msg.fields)
    } catch (err) {
      this._canceledDueToError = err
      return
    }

    this.emit('row', row, this._result)
    if (this._accumulateRows) {
      this._result.addRow(row)
    }
  }

  handleCommandComplete(msg, connection) {
    this._checkForMultirow()
    this._result.addCommandComplete(msg)
    // need to sync after each command complete of a prepared statement
    // if we were using a row count which results in multiple calls to _getRows
    if (this.rows) {
      connection.sync()
    }
  }

  // if a named prepared statement is created with empty query text
  // the backend will send an emptyQuery message but *not* a command complete message
  // since we pipeline sync immediately after execute we don't need to do anything here
  // unless we have rows specified, in which case we did not pipeline the initial sync call
  handleEmptyQuery(connection) {
    if (this.rows) {
      connection.sync()
    }
  }

  handleError(err, connection) {
    // need to sync after error during a prepared statement
    if (this._canceledDueToError) {
      err = this._canceledDueToError
      this._canceledDueToError = false
    }
    // if callback supplied do not emit error event as uncaught error
    // events will bubble up to node process
    if (this.callback) {
      return this.callback(err)
    }
    this.emit('error', err)
  }

  handleReadyForQuery(con) {
    if (this._canceledDueToError) {
      return this.handleError(this._canceledDueToError, con)
    }
    if (this.callback) {
      try {
        this.callback(null, this._results)
      } catch (err) {
        process.nextTick(() => {
          throw err
        })
      }
    }
    this.emit('end', this._results)
  }

  submit(connection) {
    if (typeof this.text !== 'string' && typeof this.name !== 'string') {
      return new Error('A query must have either text or a name. Supplying neither is unsupported.')
    }
    const previous = connection.parsedStatements[this.name]
    if (this.text && previous && this.text !== previous) {
      return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`)
    }
    if (this.values && !Array.isArray(this.values)) {
      return new Error('Query values must be an array')
    }
    if (this.requiresPreparation()) {
      // If we're using the extended query protocol we fire off several separate commands
      // to the backend. On some versions of node & some operating system versions
      // the network stack writes each message separately instead of buffering them together
      // causing the client & network to send more slowly. Corking & uncorking the stream
      // allows node to buffer up the messages internally before sending them all off at once.
      // note: we're checking for existence of cork/uncork because some versions of streams
      // might not have this (cloudflare?)
      connection.stream.cork && connection.stream.cork()
      try {
        this.prepare(connection)
      } finally {
        // while unlikely for this.prepare to throw, if it does & we don't uncork this stream
        // this client becomes unresponsive, so put in finally block "just in case"
        connection.stream.uncork && connection.stream.uncork()
      }
    } else {
      connection.query(this.text)
    }
    return null
  }

  hasBeenParsed(connection) {
    return this.name && connection.parsedStatements[this.name]
  }

  handlePortalSuspended(connection) {
    this._getRows(connection, this.rows)
  }

  _getRows(connection, rows) {
    connection.execute({
      portal: this.portal,
      rows: rows,
    })
    // if we're not reading pages of rows send the sync command
    // to indicate the pipeline is finished
    if (!rows) {
      connection.sync()
    } else {
      // otherwise flush the call out to read more rows
      connection.flush()
    }
  }

  // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
  prepare(connection) {
    // TODO refactor this poor encapsulation
    if (!this.hasBeenParsed(connection)) {
      connection.parse({
        text: this.text,
        name: this.name,
        types: this.types,
      })
    }

    // because we're mapping user supplied values to
    // postgres wire protocol compatible values it could
    // throw an exception, so try/catch this section
    try {
      connection.bind({
        portal: this.portal,
        statement: this.name,
        values: this.values,
        binary: this.binary,
        valueMapper: utils.prepareValue,
      })
    } catch (err) {
      // we should close parse to avoid leaking connections
      connection.close({ type: 'S', name: this.name })
      connection.sync()

      this.handleError(err, connection)
      return
    }

    connection.describe({
      type: 'P',
      name: this.portal || '',
    })

    this._getRows(connection, this.rows)
  }

  handleCopyInResponse(connection) {
    connection.sendCopyFail('No source stream defined')
  }

  handleCopyData(msg, connection) {
    // noop
  }
}

module.exports = Query


/***/ }),

/***/ 6424:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const types = __nccwpck_require__(1549)

const matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/

// result object returned from query
// in the 'end' event and also
// passed as second argument to provided callback
class Result {
  constructor(rowMode, types) {
    this.command = null
    this.rowCount = null
    this.oid = null
    this.rows = []
    this.fields = []
    this._parsers = undefined
    this._types = types
    this.RowCtor = null
    this.rowAsArray = rowMode === 'array'
    if (this.rowAsArray) {
      this.parseRow = this._parseRowAsArray
    }
    this._prebuiltEmptyResultObject = null
  }

  // adds a command complete message
  addCommandComplete(msg) {
    let match
    if (msg.text) {
      // pure javascript
      match = matchRegexp.exec(msg.text)
    } else {
      // native bindings
      match = matchRegexp.exec(msg.command)
    }
    if (match) {
      this.command = match[1]
      if (match[3]) {
        // COMMAND OID ROWS
        this.oid = parseInt(match[2], 10)
        this.rowCount = parseInt(match[3], 10)
      } else if (match[2]) {
        // COMMAND ROWS
        this.rowCount = parseInt(match[2], 10)
      }
    }
  }

  _parseRowAsArray(rowData) {
    const row = new Array(rowData.length)
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      if (rawValue !== null) {
        row[i] = this._parsers[i](rawValue)
      } else {
        row[i] = null
      }
    }
    return row
  }

  parseRow(rowData) {
    const row = { ...this._prebuiltEmptyResultObject }
    for (let i = 0, len = rowData.length; i < len; i++) {
      const rawValue = rowData[i]
      const field = this.fields[i].name
      if (rawValue !== null) {
        const v = this.fields[i].format === 'binary' ? Buffer.from(rawValue) : rawValue
        row[field] = this._parsers[i](v)
      } else {
        row[field] = null
      }
    }
    return row
  }

  addRow(row) {
    this.rows.push(row)
  }

  addFields(fieldDescriptions) {
    // clears field definitions
    // multiple query statements in 1 action can result in multiple sets
    // of rowDescriptions...eg: 'select NOW(); select 1::int;'
    // you need to reset the fields
    this.fields = fieldDescriptions
    if (this.fields.length) {
      this._parsers = new Array(fieldDescriptions.length)
    }

    const row = Object.create(null)

    for (let i = 0; i < fieldDescriptions.length; i++) {
      const desc = fieldDescriptions[i]
      row[desc.name] = null

      if (this._types) {
        this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      } else {
        this._parsers[i] = types.getTypeParser(desc.dataTypeID, desc.format || 'text')
      }
    }

    this._prebuiltEmptyResultObject = { ...row }
  }
}

module.exports = Result


/***/ }),

/***/ 829:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { getStream, getSecureStream } = getStreamFuncs()

module.exports = {
  /**
   * Get a socket stream compatible with the current runtime environment.
   * @returns {Duplex}
   */
  getStream,
  /**
   * Get a TLS secured socket, compatible with the current environment,
   * using the socket and other settings given in `options`.
   * @returns {Duplex}
   */
  getSecureStream,
}

/**
 * The stream functions that work in Node.js
 */
function getNodejsStreamFuncs() {
  function getStream(ssl) {
    const net = __nccwpck_require__(9278)
    return new net.Socket()
  }

  function getSecureStream(options) {
    const tls = __nccwpck_require__(4756)
    return tls.connect(options)
  }
  return {
    getStream,
    getSecureStream,
  }
}

/**
 * The stream functions that work in Cloudflare Workers
 */
function getCloudflareStreamFuncs() {
  function getStream(ssl) {
    const { CloudflareSocket } = __nccwpck_require__(785)
    return new CloudflareSocket(ssl)
  }

  function getSecureStream(options) {
    options.socket.startTls(options)
    return options.socket
  }
  return {
    getStream,
    getSecureStream,
  }
}

/**
 * Are we running in a Cloudflare Worker?
 *
 * @returns true if the code is currently running inside a Cloudflare Worker.
 */
function isCloudflareRuntime() {
  // Since 2022-03-21 the `global_navigator` compatibility flag is on for Cloudflare Workers
  // which means that `navigator.userAgent` will be defined.
  // eslint-disable-next-line no-undef
  if (typeof navigator === 'object' && navigator !== null && typeof navigator.userAgent === 'string') {
    // eslint-disable-next-line no-undef
    return navigator.userAgent === 'Cloudflare-Workers'
  }
  // In case `navigator` or `navigator.userAgent` is not defined then try a more sneaky approach
  if (typeof Response === 'function') {
    const resp = new Response(null, { cf: { thing: true } })
    if (typeof resp.cf === 'object' && resp.cf !== null && resp.cf.thing) {
      return true
    }
  }
  return false
}

function getStreamFuncs() {
  if (isCloudflareRuntime()) {
    return getCloudflareStreamFuncs()
  }
  return getNodejsStreamFuncs()
}


/***/ }),

/***/ 365:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const types = __nccwpck_require__(1549)

function TypeOverrides(userTypes) {
  this._types = userTypes || types
  this.text = {}
  this.binary = {}
}

TypeOverrides.prototype.getOverrides = function (format) {
  switch (format) {
    case 'text':
      return this.text
    case 'binary':
      return this.binary
    default:
      return {}
  }
}

TypeOverrides.prototype.setTypeParser = function (oid, format, parseFn) {
  if (typeof format === 'function') {
    parseFn = format
    format = 'text'
  }
  this.getOverrides(format)[oid] = parseFn
}

TypeOverrides.prototype.getTypeParser = function (oid, format) {
  format = format || 'text'
  return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format)
}

module.exports = TypeOverrides


/***/ }),

/***/ 9652:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



const defaults = __nccwpck_require__(8995)

const { isDate } = __nccwpck_require__(8253)

function escapeElement(elementRepresentation) {
  const escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  return '"' + escaped + '"'
}

// convert a JS array to a postgres array literal
// uses comma separator so won't work for types like box that use
// a different array separator.
function arrayString(val) {
  let result = '{'
  for (let i = 0; i < val.length; i++) {
    if (i > 0) {
      result += ','
    }
    let item = val[i]
    if (item == null) {
      result += 'NULL'
    } else if (Array.isArray(item)) {
      result += arrayString(item)
    } else if (ArrayBuffer.isView(item)) {
      if (!(item instanceof Buffer)) {
        item = Buffer.from(item.buffer, item.byteOffset, item.byteLength)
      }
      result += '\\\\x' + item.toString('hex')
    } else {
      result += escapeElement(prepareValue(item))
    }
  }
  result += '}'
  return result
}

// converts values from javascript types
// to their 'raw' counterparts for use as a postgres parameter
// note: you can override this function to provide your own conversion mechanism
// for complex types, etc...
const prepareValue = function (val, seen) {
  // null and undefined are both null for postgres
  if (val == null) {
    return null
  }
  if (typeof val === 'object') {
    if (val instanceof Buffer) {
      return val
    }
    if (ArrayBuffer.isView(val)) {
      return Buffer.from(val.buffer, val.byteOffset, val.byteLength)
    }
    if (isDate(val)) {
      if (defaults.parseInputDatesAsUTC) {
        return dateToStringUTC(val)
      } else {
        return dateToString(val)
      }
    }
    if (Array.isArray(val)) {
      return arrayString(val)
    }

    return prepareObject(val, seen)
  }
  return val.toString()
}

function prepareObject(val, seen) {
  if (val && typeof val.toPostgres === 'function') {
    seen = seen || []
    if (seen.indexOf(val) !== -1) {
      throw new Error('circular reference detected while preparing "' + val + '" for query')
    }
    seen.push(val)

    return prepareValue(val.toPostgres(prepareValue), seen)
  }
  return JSON.stringify(val)
}

function dateToString(date) {
  let offset = -date.getTimezoneOffset()

  let year = date.getFullYear()
  const isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  let ret =
    String(year).padStart(4, '0') +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0') +
    'T' +
    String(date.getHours()).padStart(2, '0') +
    ':' +
    String(date.getMinutes()).padStart(2, '0') +
    ':' +
    String(date.getSeconds()).padStart(2, '0') +
    '.' +
    String(date.getMilliseconds()).padStart(3, '0')

  if (offset < 0) {
    ret += '-'
    offset *= -1
  } else {
    ret += '+'
  }

  ret += String(Math.floor(offset / 60)).padStart(2, '0') + ':' + String(offset % 60).padStart(2, '0')
  if (isBCYear) ret += ' BC'
  return ret
}

function dateToStringUTC(date) {
  let year = date.getUTCFullYear()
  const isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  let ret =
    String(year).padStart(4, '0') +
    '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getUTCDate()).padStart(2, '0') +
    'T' +
    String(date.getUTCHours()).padStart(2, '0') +
    ':' +
    String(date.getUTCMinutes()).padStart(2, '0') +
    ':' +
    String(date.getUTCSeconds()).padStart(2, '0') +
    '.' +
    String(date.getUTCMilliseconds()).padStart(3, '0')

  ret += '+00:00'
  if (isBCYear) ret += ' BC'
  return ret
}

function normalizeQueryConfig(config, values, callback) {
  // can take in strings or config objects
  config = typeof config === 'string' ? { text: config } : config
  if (values) {
    if (typeof values === 'function') {
      config.callback = values
    } else {
      config.values = values
    }
  }
  if (callback) {
    config.callback = callback
  }
  return config
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const escapeIdentifier = function (str) {
  return '"' + str.replace(/"/g, '""') + '"'
}

const escapeLiteral = function (str) {
  let hasBackslash = false
  let escaped = "'"

  if (str == null) {
    return "''"
  }

  if (typeof str !== 'string') {
    return "''"
  }

  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === "'") {
      escaped += c + c
    } else if (c === '\\') {
      escaped += c + c
      hasBackslash = true
    } else {
      escaped += c
    }
  }

  escaped += "'"

  if (hasBackslash === true) {
    escaped = ' E' + escaped
  }

  return escaped
}

module.exports = {
  prepareValue: function prepareValueWrapper(value) {
    // this ensures that extra arguments do not get passed into prepareValue
    // by accident, eg: from calling values.map(utils.prepareValue)
    return prepareValue(value)
  },
  normalizeQueryConfig,
  escapeIdentifier,
  escapeLiteral,
}


/***/ }),

/***/ 8702:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var path = __nccwpck_require__(6928)
  , Stream = (__nccwpck_require__(2203).Stream)
  , split = __nccwpck_require__(5286)
  , util = __nccwpck_require__(9023)
  , defaultPort = 5432
  , isWin = (process.platform === 'win32')
  , warnStream = process.stderr
;


var S_IRWXG = 56     //    00070(8)
  , S_IRWXO = 7      //    00007(8)
  , S_IFMT  = 61440  // 00170000(8)
  , S_IFREG = 32768  //  0100000(8)
;
function isRegFile(mode) {
    return ((mode & S_IFMT) == S_IFREG);
}

var fieldNames = [ 'host', 'port', 'database', 'user', 'password' ];
var nrOfFields = fieldNames.length;
var passKey = fieldNames[ nrOfFields -1 ];


function warn() {
    var isWritable = (
        warnStream instanceof Stream &&
          true === warnStream.writable
    );

    if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write( util.format.apply(util, args) );
    }
}


Object.defineProperty(module.exports, "isWin", ({
    get : function() {
        return isWin;
    } ,
    set : function(val) {
        isWin = val;
    }
}));


module.exports.warnTo = function(stream) {
    var old = warnStream;
    warnStream = stream;
    return old;
};

module.exports.getFileName = function(rawEnv){
    var env = rawEnv || process.env;
    var file = env.PGPASSFILE || (
        isWin ?
          path.join( env.APPDATA || './' , 'postgresql', 'pgpass.conf' ) :
          path.join( env.HOME || './', '.pgpass' )
    );
    return file;
};

module.exports.usePgPass = function(stats, fname) {
    if (Object.prototype.hasOwnProperty.call(process.env, 'PGPASSWORD')) {
        return false;
    }

    if (isWin) {
        return true;
    }

    fname = fname || '<unkn>';

    if (! isRegFile(stats.mode)) {
        warn('WARNING: password file "%s" is not a plain file', fname);
        return false;
    }

    if (stats.mode & (S_IRWXG | S_IRWXO)) {
        /* If password file is insecure, alert the user and ignore it. */
        warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
    }

    return true;
};


var matcher = module.exports.match = function(connInfo, entry) {
    return fieldNames.slice(0, -1).reduce(function(prev, field, idx){
        if (idx == 1) {
            // the port
            if ( Number( connInfo[field] || defaultPort ) === Number( entry[field] ) ) {
                return prev && true;
            }
        }
        return prev && (
            entry[field] === '*' ||
              entry[field] === connInfo[field]
        );
    }, true);
};


module.exports.getPassword = function(connInfo, stream, cb) {
    var pass;
    var lineStream = stream.pipe(split());

    function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
            pass = entry[passKey];
            lineStream.end(); // -> calls onEnd(), but pass is set now
        }
    }

    var onEnd = function() {
        stream.destroy();
        cb(pass);
    };

    var onErr = function(err) {
        stream.destroy();
        warn('WARNING: error on reading file: %s', err);
        cb(undefined);
    };

    stream.on('error', onErr);
    lineStream
        .on('data', onLine)
        .on('end', onEnd)
        .on('error', onErr)
    ;

};


var parseLine = module.exports.parseLine = function(line) {
    if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
    }

    var curChar = '';
    var prevChar = '';
    var fieldIdx = 0;
    var startIdx = 0;
    var endIdx = 0;
    var obj = {};
    var isLastField = false;
    var addToObj = function(idx, i0, i1) {
        var field = line.substring(i0, i1);

        if (! Object.hasOwnProperty.call(process.env, 'PGPASS_NO_DEESCAPE')) {
            field = field.replace(/\\([:\\])/g, '$1');
        }

        obj[ fieldNames[idx] ] = field;
    };

    for (var i = 0 ; i < line.length-1 ; i += 1) {
        curChar = line.charAt(i+1);
        prevChar = line.charAt(i);

        isLastField = (fieldIdx == nrOfFields-1);

        if (isLastField) {
            addToObj(fieldIdx, startIdx);
            break;
        }

        if (i >= 0 && curChar == ':' && prevChar !== '\\') {
            addToObj(fieldIdx, startIdx, i+1);

            startIdx = i+2;
            fieldIdx += 1;
        }
    }

    obj = ( Object.keys(obj).length === nrOfFields ) ? obj : null;

    return obj;
};


var isValidEntry = module.exports.isValidEntry = function(entry){
    var rules = {
        // host
        0 : function(x){
            return x.length > 0;
        } ,
        // port
        1 : function(x){
            if (x === '*') {
                return true;
            }
            x = Number(x);
            return (
                isFinite(x) &&
                  x > 0 &&
                  x < 9007199254740992 &&
                  Math.floor(x) === x
            );
        } ,
        // database
        2 : function(x){
            return x.length > 0;
        } ,
        // username
        3 : function(x){
            return x.length > 0;
        } ,
        // password
        4 : function(x){
            return x.length > 0;
        }
    };

    for (var idx = 0 ; idx < fieldNames.length ; idx += 1) {
        var rule = rules[idx];
        var value = entry[ fieldNames[idx] ] || '';

        var res = rule(value);
        if (!res) {
            return false;
        }
    }

    return true;
};



/***/ }),

/***/ 3272:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var path = __nccwpck_require__(6928)
  , fs = __nccwpck_require__(9896)
  , helper = __nccwpck_require__(8702)
;


module.exports = function(connInfo, cb) {
    var file = helper.getFileName();
    
    fs.stat(file, function(err, stat){
        if (err || !helper.usePgPass(stat, file)) {
            return cb(undefined);
        }

        var st = fs.createReadStream(file);

        helper.getPassword(connInfo, st, cb);
    });
};

module.exports.warnTo = helper.warnTo;


/***/ }),

/***/ 3879:
/***/ ((__unused_webpack_module, exports) => {



exports.parse = function (source, transform) {
  return new ArrayParser(source, transform).parse()
}

class ArrayParser {
  constructor (source, transform) {
    this.source = source
    this.transform = transform || identity
    this.position = 0
    this.entries = []
    this.recorded = []
    this.dimension = 0
  }

  isEof () {
    return this.position >= this.source.length
  }

  nextCharacter () {
    var character = this.source[this.position++]
    if (character === '\\') {
      return {
        value: this.source[this.position++],
        escaped: true
      }
    }
    return {
      value: character,
      escaped: false
    }
  }

  record (character) {
    this.recorded.push(character)
  }

  newEntry (includeEmpty) {
    var entry
    if (this.recorded.length > 0 || includeEmpty) {
      entry = this.recorded.join('')
      if (entry === 'NULL' && !includeEmpty) {
        entry = null
      }
      if (entry !== null) entry = this.transform(entry)
      this.entries.push(entry)
      this.recorded = []
    }
  }

  consumeDimensions () {
    if (this.source[0] === '[') {
      while (!this.isEof()) {
        var char = this.nextCharacter()
        if (char.value === '=') break
      }
    }
  }

  parse (nested) {
    var character, parser, quote
    this.consumeDimensions()
    while (!this.isEof()) {
      character = this.nextCharacter()
      if (character.value === '{' && !quote) {
        this.dimension++
        if (this.dimension > 1) {
          parser = new ArrayParser(this.source.substr(this.position - 1), this.transform)
          this.entries.push(parser.parse(true))
          this.position += parser.position - 2
        }
      } else if (character.value === '}' && !quote) {
        this.dimension--
        if (!this.dimension) {
          this.newEntry()
          if (nested) return this.entries
        }
      } else if (character.value === '"' && !character.escaped) {
        if (quote) this.newEntry(true)
        quote = !quote
      } else if (character.value === ',' && !quote) {
        this.newEntry()
      } else {
        this.record(character.value)
      }
    }
    if (this.dimension !== 0) {
      throw new Error('array dimension not balanced')
    }
    return this.entries
  }
}

function identity (value) {
  return value
}


/***/ }),

/***/ 463:
/***/ ((module) => {



var bufferFrom = Buffer.from || Buffer

module.exports = function parseBytea (input) {
  if (/^\\x/.test(input)) {
    // new 'hex' style response (pg >9.0)
    return bufferFrom(input.substr(2), 'hex')
  }
  var output = ''
  var i = 0
  while (i < input.length) {
    if (input[i] !== '\\') {
      output += input[i]
      ++i
    } else {
      if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
        output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8))
        i += 4
      } else {
        var backslashes = 1
        while (i + backslashes < input.length && input[i + backslashes] === '\\') {
          backslashes++
        }
        for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
          output += '\\'
        }
        i += Math.floor(backslashes / 2) * 2
      }
    }
  }
  return bufferFrom(output, 'binary')
}


/***/ }),

/***/ 2690:
/***/ ((module) => {



var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/
var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/
var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/
var INFINITY = /^-?infinity$/

module.exports = function parseDate (isoDate) {
  if (INFINITY.test(isoDate)) {
    // Capitalize to Infinity before passing to Number
    return Number(isoDate.replace('i', 'I'))
  }
  var matches = DATE_TIME.exec(isoDate)

  if (!matches) {
    // Force YYYY-MM-DD dates to be parsed as local time
    return getDate(isoDate) || null
  }

  var isBC = !!matches[8]
  var year = parseInt(matches[1], 10)
  if (isBC) {
    year = bcYearToNegativeYear(year)
  }

  var month = parseInt(matches[2], 10) - 1
  var day = matches[3]
  var hour = parseInt(matches[4], 10)
  var minute = parseInt(matches[5], 10)
  var second = parseInt(matches[6], 10)

  var ms = matches[7]
  ms = ms ? 1000 * parseFloat(ms) : 0

  var date
  var offset = timeZoneOffset(isoDate)
  if (offset != null) {
    date = new Date(Date.UTC(year, month, day, hour, minute, second, ms))

    // Account for years from 0 to 99 being interpreted as 1900-1999
    // by Date.UTC / the multi-argument form of the Date constructor
    if (is0To99(year)) {
      date.setUTCFullYear(year)
    }

    if (offset !== 0) {
      date.setTime(date.getTime() - offset)
    }
  } else {
    date = new Date(year, month, day, hour, minute, second, ms)

    if (is0To99(year)) {
      date.setFullYear(year)
    }
  }

  return date
}

function getDate (isoDate) {
  var matches = DATE.exec(isoDate)
  if (!matches) {
    return
  }

  var year = parseInt(matches[1], 10)
  var isBC = !!matches[4]
  if (isBC) {
    year = bcYearToNegativeYear(year)
  }

  var month = parseInt(matches[2], 10) - 1
  var day = matches[3]
  // YYYY-MM-DD will be parsed as local time
  var date = new Date(year, month, day)

  if (is0To99(year)) {
    date.setFullYear(year)
  }

  return date
}

// match timezones:
// Z (UTC)
// -05
// +06:30
function timeZoneOffset (isoDate) {
  if (isoDate.endsWith('+00')) {
    return 0
  }

  var zone = TIME_ZONE.exec(isoDate.split(' ')[1])
  if (!zone) return
  var type = zone[1]

  if (type === 'Z') {
    return 0
  }
  var sign = type === '-' ? -1 : 1
  var offset = parseInt(zone[2], 10) * 3600 +
    parseInt(zone[3] || 0, 10) * 60 +
    parseInt(zone[4] || 0, 10)

  return offset * sign * 1000
}

function bcYearToNegativeYear (year) {
  // Account for numerical difference between representations of BC years
  // See: https://github.com/bendrucker/postgres-date/issues/5
  return -(year - 1)
}

function is0To99 (num) {
  return num >= 0 && num < 100
}


/***/ }),

/***/ 8755:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var extend = __nccwpck_require__(223)

module.exports = PostgresInterval

function PostgresInterval (raw) {
  if (!(this instanceof PostgresInterval)) {
    return new PostgresInterval(raw)
  }
  extend(this, parse(raw))
}
var properties = ['seconds', 'minutes', 'hours', 'days', 'months', 'years']
PostgresInterval.prototype.toPostgres = function () {
  var filtered = properties.filter(this.hasOwnProperty, this)

  // In addition to `properties`, we need to account for fractions of seconds.
  if (this.milliseconds && filtered.indexOf('seconds') < 0) {
    filtered.push('seconds')
  }

  if (filtered.length === 0) return '0'
  return filtered
    .map(function (property) {
      var value = this[property] || 0

      // Account for fractional part of seconds,
      // remove trailing zeroes.
      if (property === 'seconds' && this.milliseconds) {
        value = (value + this.milliseconds / 1000).toFixed(6).replace(/\.?0+$/, '')
      }

      return value + ' ' + property
    }, this)
    .join(' ')
}

var propertiesISOEquivalent = {
  years: 'Y',
  months: 'M',
  days: 'D',
  hours: 'H',
  minutes: 'M',
  seconds: 'S'
}
var dateProperties = ['years', 'months', 'days']
var timeProperties = ['hours', 'minutes', 'seconds']
// according to ISO 8601
PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function () {
  var datePart = dateProperties
    .map(buildProperty, this)
    .join('')

  var timePart = timeProperties
    .map(buildProperty, this)
    .join('')

  return 'P' + datePart + 'T' + timePart

  function buildProperty (property) {
    var value = this[property] || 0

    // Account for fractional part of seconds,
    // remove trailing zeroes.
    if (property === 'seconds' && this.milliseconds) {
      value = (value + this.milliseconds / 1000).toFixed(6).replace(/0+$/, '')
    }

    return value + propertiesISOEquivalent[property]
  }
}

var NUMBER = '([+-]?\\d+)'
var YEAR = NUMBER + '\\s+years?'
var MONTH = NUMBER + '\\s+mons?'
var DAY = NUMBER + '\\s+days?'
var TIME = '([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?'
var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function (regexString) {
  return '(' + regexString + ')?'
})
  .join('\\s*'))

// Positions of values in regex match
var positions = {
  years: 2,
  months: 4,
  days: 6,
  hours: 9,
  minutes: 10,
  seconds: 11,
  milliseconds: 12
}
// We can use negative time
var negatives = ['hours', 'minutes', 'seconds', 'milliseconds']

function parseMilliseconds (fraction) {
  // add omitted zeroes
  var microseconds = fraction + '000000'.slice(fraction.length)
  return parseInt(microseconds, 10) / 1000
}

function parse (interval) {
  if (!interval) return {}
  var matches = INTERVAL.exec(interval)
  var isNegative = matches[8] === '-'
  return Object.keys(positions)
    .reduce(function (parsed, property) {
      var position = positions[property]
      var value = matches[position]
      // no empty string
      if (!value) return parsed
      // milliseconds are actually microseconds (up to 6 digits)
      // with omitted trailing zeroes.
      value = property === 'milliseconds'
        ? parseMilliseconds(value)
        : parseInt(value, 10)
      // no zeros
      if (!value) return parsed
      if (isNegative && ~negatives.indexOf(property)) {
        value *= -1
      }
      parsed[property] = value
      return parsed
    }, {})
}


/***/ }),

/***/ 5286:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

/*
Copyright (c) 2014-2021, Matteo Collina <hello@matteocollina.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/



const { Transform } = __nccwpck_require__(2203)
const { StringDecoder } = __nccwpck_require__(3193)
const kLast = Symbol('last')
const kDecoder = Symbol('decoder')

function transform (chunk, enc, cb) {
  let list
  if (this.overflow) { // Line buffer is full. Skip to start of next line.
    const buf = this[kDecoder].write(chunk)
    list = buf.split(this.matcher)

    if (list.length === 1) return cb() // Line ending not found. Discard entire chunk.

    // Line ending found. Discard trailing fragment of previous line and reset overflow state.
    list.shift()
    this.overflow = false
  } else {
    this[kLast] += this[kDecoder].write(chunk)
    list = this[kLast].split(this.matcher)
  }

  this[kLast] = list.pop()

  for (let i = 0; i < list.length; i++) {
    try {
      push(this, this.mapper(list[i]))
    } catch (error) {
      return cb(error)
    }
  }

  this.overflow = this[kLast].length > this.maxLength
  if (this.overflow && !this.skipOverflow) {
    cb(new Error('maximum buffer reached'))
    return
  }

  cb()
}

function flush (cb) {
  // forward any gibberish left in there
  this[kLast] += this[kDecoder].end()

  if (this[kLast]) {
    try {
      push(this, this.mapper(this[kLast]))
    } catch (error) {
      return cb(error)
    }
  }

  cb()
}

function push (self, val) {
  if (val !== undefined) {
    self.push(val)
  }
}

function noop (incoming) {
  return incoming
}

function split (matcher, mapper, options) {
  // Set defaults for any arguments not supplied.
  matcher = matcher || /\r?\n/
  mapper = mapper || noop
  options = options || {}

  // Test arguments explicitly.
  switch (arguments.length) {
    case 1:
      // If mapper is only argument.
      if (typeof matcher === 'function') {
        mapper = matcher
        matcher = /\r?\n/
      // If options is only argument.
      } else if (typeof matcher === 'object' && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
        options = matcher
        matcher = /\r?\n/
      }
      break

    case 2:
      // If mapper and options are arguments.
      if (typeof matcher === 'function') {
        options = mapper
        mapper = matcher
        matcher = /\r?\n/
      // If matcher and options are arguments.
      } else if (typeof mapper === 'object') {
        options = mapper
        mapper = noop
      }
  }

  options = Object.assign({}, options)
  options.autoDestroy = true
  options.transform = transform
  options.flush = flush
  options.readableObjectMode = true

  const stream = new Transform(options)

  stream[kLast] = ''
  stream[kDecoder] = new StringDecoder('utf8')
  stream.matcher = matcher
  stream.mapper = mapper
  stream.maxLength = options.maxLength
  stream.skipOverflow = options.skipOverflow || false
  stream.overflow = false
  stream._destroy = function (err, cb) {
    // Weird Node v12 bug that we need to work around
    this._writableState.errorEmitted = false
    cb(err)
  }

  return stream
}

module.exports = split


/***/ }),

/***/ 223:
/***/ ((module) => {

module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}


/***/ }),

/***/ 4390:
/***/ ((module) => {

module.exports = eval("require")("pg-native");


/***/ }),

/***/ 6982:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("crypto");

/***/ }),

/***/ 2250:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("dns");

/***/ }),

/***/ 4434:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("events");

/***/ }),

/***/ 9896:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("fs");

/***/ }),

/***/ 9278:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("net");

/***/ }),

/***/ 6928:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("path");

/***/ }),

/***/ 2203:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("stream");

/***/ }),

/***/ 3193:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("string_decoder");

/***/ }),

/***/ 4756:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("tls");

/***/ }),

/***/ 9023:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("util");

/***/ }),

/***/ 8253:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("util/types");

/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__nccwpck_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  i: () => (/* binding */ main)
});

// EXTERNAL MODULE: ./node_modules/pg/lib/index.js
var lib = __nccwpck_require__(3273);
;// CONCATENATED MODULE: ./node_modules/pg/esm/index.mjs
// ESM wrapper for pg


// Re-export all the properties
const Client = lib.Client
const Pool = lib.Pool
const Connection = lib.Connection
const types = lib.types
const Query = lib.Query
const DatabaseError = lib.DatabaseError
const escapeIdentifier = lib.escapeIdentifier
const escapeLiteral = lib.escapeLiteral
const Result = lib.Result
const TypeOverrides = lib.TypeOverrides

// Also export the defaults
const defaults = lib.defaults

// Re-export the default
/* harmony default export */ const esm = ((/* unused pure expression or super */ null && (pg)));

;// CONCATENATED MODULE: ./lib/constants.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const SKIP_LABEL = "SKIP_MUTEX";
const TABLE_NAME = "releasetools_mutex";
//# sourceMappingURL=constants.js.map
;// CONCATENATED MODULE: ./lib/logger.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const THRESHOLDS = {
    silent: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
};
/**
 * Writes every message to stderr.
 *
 * stdout is deliberately left alone: it carries command results (and, while
 * `mutex lock ... -- <command>` runs, the wrapped process' own output), so
 * diagnostics must never be mixed into it.
 */
class ConsoleLogger {
    threshold;
    constructor(level = "info") {
        this.threshold = THRESHOLDS[level];
    }
    info(message) {
        this.write(THRESHOLDS.info, message);
    }
    warning(message) {
        this.write(THRESHOLDS.warning, `warning: ${message}`);
    }
    error(message) {
        this.write(THRESHOLDS.error, `error: ${message}`);
    }
    debug(message) {
        this.write(THRESHOLDS.debug, `debug: ${message}`);
    }
    write(level, message) {
        if (level <= this.threshold) {
            process.stderr.write(`${message}\n`);
        }
    }
}
/** Discards everything. Useful in tests and for `--quiet`-style callers. */
class SilentLogger {
    info() { }
    warning() { }
    error() { }
    debug() { }
}
//# sourceMappingURL=logger.js.map
;// CONCATENATED MODULE: ./lib/helpers.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}
function errorStack(error) {
    return error instanceof Error && error.stack ? error.stack : "N/A";
}
function prefixOf(description) {
    return description ? `${description}: ` : "";
}
function logError(log, error, description) {
    log.error(`${prefixOf(description)}${describeError(error)}`);
    log.debug(`Stack trace: ${errorStack(error)}`);
}
function logWarning(log, error, description) {
    log.warning(`${prefixOf(description)}${describeError(error)}`);
    log.debug(`Stack trace: ${errorStack(error)}`);
}
//# sourceMappingURL=helpers.js.map
// EXTERNAL MODULE: ./node_modules/pg-format/lib/index.js
var pg_format_lib = __nccwpck_require__(8787);
;// CONCATENATED MODULE: ./lib/database.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */





/**
 * The columns every read returns.
 *
 * `created_at`/`expires_at` are `TIMESTAMP WITHOUT TIME ZONE` holding UTC wall
 * time. `AT TIME ZONE 'UTC'` re-labels them as `timestamptz`, so node-postgres
 * parses them into correct `Date`s no matter what time zone the client or the
 * database session happens to run in.
 */
const LOCK_COLUMNS = `id, reason, owner,
        created_at AT TIME ZONE 'UTC' AS created_at,
        expires_at AT TIME ZONE 'UTC' AS expires_at,
        (expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE 'UTC')) AS expired`;
class DatabaseMutex {
    config;
    log;
    pool;
    closed = false;
    /** Schema creation is tried at most once per instance. */
    schemaAttempted = false;
    constructor(config, log = new SilentLogger()) {
        this.config = config;
        this.log = log;
        // Database configuration using connection string
        this.pool = new Pool({ connectionString: config.dbConnectionString });
        // Without a listener, an error on an idle client is an unhandled 'error'
        // event and takes the whole process down.
        this.pool.on("error", (error) => {
            logWarning(this.log, error, "Idle database client error");
        });
    }
    async acquireLock(name, reason, owner = null) {
        return this.withSchemaRetry(`Acquiring lock '${name}'`, () => this.acquireLockInternal(name, reason, owner));
    }
    async releaseLock(name, owner = null, fence = null) {
        return this.withSchemaRetry(`Releasing lock '${name}'`, () => this.releaseLockInternal(name, owner, fence));
    }
    /**
     * Extends a lock that `owner` currently holds.
     *
     * Strictly an UPDATE: it never inserts, so renewing something that is not
     * held fails rather than quietly taking a new lock. Both the id and the
     * owner have to match, and an expired lock is refused - by then somebody
     * else may already have taken it over.
     *
     * The new expiry is whichever is later, now + `expiration` or the expiry the
     * lock already had, so renewing can only ever buy more time. Asking for less
     * than the lock already has is a no-op rather than a silent shortening.
     */
    async renewLock(name, expiration, owner = null) {
        return this.withSchemaRetry(`Renewing lock '${name}'`, () => this.renewLockInternal(name, expiration, owner));
    }
    /** Returns the lock's current row, or null when nothing holds it. */
    async inspectLock(name) {
        return this.withSchemaRetry(`Inspecting lock '${name}'`, async () => {
            const result = await this.pool.query(pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            return result.rows.length > 0 ? toLockRecord(result.rows[0]) : null;
        });
    }
    /** Returns every lock in the table, expired ones included. */
    async listLocks() {
        return this.withSchemaRetry("Listing locks", async () => {
            const result = await this.pool.query(pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I ORDER BY id;`, TABLE_NAME));
            return result.rows.map(toLockRecord);
        });
    }
    /**
     * Deletes every expired lock. Expired rows are already dead - acquiring
     * overwrites them - so this is only housekeeping and needs no advisory lock.
     */
    async pruneExpired(dryRun = false) {
        return this.withSchemaRetry("Pruning expired locks", async () => {
            const predicate = `WHERE expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE 'UTC')`;
            const query = dryRun
                ? pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I ${predicate};`, TABLE_NAME)
                : pg_format_lib(`DELETE FROM %I ${predicate} RETURNING ${LOCK_COLUMNS};`, TABLE_NAME);
            const result = await this.pool.query(query);
            return result.rows.map(toLockRecord);
        });
    }
    /** Releases the connection pool. Required for a CLI process to exit. */
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        await this.pool.end();
    }
    async acquireLockInternal(name, reason, owner) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return {
                    acquired: false,
                    status: "Lock held by another transaction",
                };
            }
            // Insert the lock, or take it over when the existing one has expired.
            // A row whose expires_at is NULL is never taken over: an unknown
            // expiry is treated as "still held". Acquiring never extends a lock the
            // caller already holds - that is `renewLock`'s job.
            const upsertQuery = pg_format_lib(`INSERT INTO %I (id, reason, owner, expires_at)
        VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'UTC') + ($4 || ' seconds')::INTERVAL)
        ON CONFLICT (id) DO UPDATE
        SET
            expires_at = EXCLUDED.expires_at,
            reason = EXCLUDED.reason,
            owner = EXCLUDED.owner,
            created_at = (NOW() AT TIME ZONE 'UTC')
        WHERE
            %I.expires_at < (NOW() AT TIME ZONE 'UTC')
        RETURNING ${LOCK_COLUMNS};`, TABLE_NAME, TABLE_NAME);
            const result = await client.query(upsertQuery, [
                name,
                reason,
                owner,
                this.config.expiration,
            ]);
            // No row means a valid, unexpired lock already existed.
            if (result.rowCount === 0) {
                const holder = await client.query(pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
                await client.query("ROLLBACK");
                this.log.info(`Lock for "${name}" exists and has not expired.`);
                return {
                    acquired: false,
                    status: "Lock taken by another process (try again later)",
                    record: holder.rows.length > 0 ? toLockRecord(holder.rows[0]) : undefined,
                };
            }
            await client.query("COMMIT");
            this.log.info(`Lock '${name}' acquired successfully.`);
            const record = toLockRecord(result.rows[0]);
            const approximate = new Date(Date.now() + this.config.expiration * 1000).toISOString();
            return {
                acquired: true,
                status: "Lock acquired",
                expires: record.expiresAt ?? `approximately ${approximate}`,
                record,
            };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while acquiring a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async releaseLockInternal(name, owner, fence) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return { unlocked: false, outcome: "contended" };
            }
            const existing = await client.query(pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            if (existing.rows.length === 0) {
                await client.query("COMMIT");
                this.log.warning(`Lock '${name}' was not found. No release was necessary.`);
                return { unlocked: true, outcome: "not-found" };
            }
            const record = toLockRecord(existing.rows[0]);
            if (!mayModify(record, owner)) {
                await client.query("COMMIT");
                return { unlocked: false, outcome: "owned-by-another", record };
            }
            // The caller knows which acquisition it is releasing, and this is not
            // it: the lock lapsed and somebody took it over. Ownership cannot catch
            // this when neither side named an owner, which is the default.
            if (fence !== null && record.createdAt !== fence) {
                await client.query("COMMIT");
                return { unlocked: false, outcome: "superseded", record };
            }
            await client.query(pg_format_lib(`DELETE FROM %I WHERE id = $1;`, TABLE_NAME), [
                name,
            ]);
            await client.query("COMMIT");
            this.log.info(`Lock '${name}' released successfully.`);
            return { unlocked: true, outcome: "unlocked", record };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while releasing a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async renewLockInternal(name, expiration, owner) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return { renewed: false, outcome: "contended" };
            }
            const existing = await client.query(pg_format_lib(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            if (existing.rows.length === 0) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "not-found" };
            }
            const record = toLockRecord(existing.rows[0]);
            // An unowned lock has nobody to wrong, so it stays open - which is what
            // keeps Action-written locks manageable from the CLI.
            if (!mayModify(record, owner)) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "owned-by-another", record };
            }
            // An expired lock may already have been taken over by someone else, so
            // pushing its expiry forward would re-take it behind their back.
            if (record.expired) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "expired", record };
            }
            // UPDATE, never an upsert: a lock that vanished between the read and
            // here stays gone rather than being recreated.
            // GREATEST, so a renewal can only push the expiry outwards. Postgres
            // ignores NULLs here, so a row with no recorded expiry still takes the
            // computed one rather than staying NULL.
            const renewed = await client.query(pg_format_lib(`UPDATE %I
          SET expires_at = GREATEST(
              (NOW() AT TIME ZONE 'UTC') + ($2 || ' seconds')::INTERVAL,
              expires_at
          )
          WHERE id = $1
          RETURNING ${LOCK_COLUMNS};`, TABLE_NAME), [name, expiration]);
            if (renewed.rows.length === 0) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "not-found" };
            }
            await client.query("COMMIT");
            const updated = toLockRecord(renewed.rows[0]);
            const extended = updated.expiresAt !== record.expiresAt;
            this.log.info(extended
                ? `Lock '${name}' renewed for ${expiration}s.`
                : `Lock '${name}' already ran past ${expiration}s; left as it was.`);
            return {
                renewed: true,
                outcome: "renewed",
                extended,
                record: updated,
            };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while renewing a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    /**
     * Takes a transaction-scoped advisory lock on the mutex id, so no other
     * process can acquire or release the same lock concurrently. Retries once,
     * since contention here is almost always momentary.
     */
    async holdAdvisoryLock(client, name) {
        if (await this.tryAdvisoryLock(client, name)) {
            return true;
        }
        await sleep(1);
        return this.tryAdvisoryLock(client, name);
    }
    async tryAdvisoryLock(client, name) {
        const result = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired", [name]);
        if (!result.rows[0].acquired) {
            this.log.debug(`Could not acquire advisory lock '${name}'.`);
            return false;
        }
        return true;
    }
    /**
     * Runs an operation and, if it fails, makes sure the schema exists before
     * trying once more - the usual cause is a database that has never seen this
     * action before.
     */
    async withSchemaRetry(operation, run) {
        try {
            return await run();
        }
        catch (error) {
            // Creating the table is a guess at the cause, worth making once. After
            // that the schema is not what is wrong, so later failures go straight
            // back to the caller instead of re-running DDL on every operation.
            if (this.schemaAttempted) {
                throw error;
            }
            this.schemaAttempted = true;
            // Expected the first time a database is used, so this is not worth a
            // warning: if the retry fails too, the original error is thrown.
            this.log.debug(`${operation} failed; ensuring the schema exists and retrying once: ${describeError(error)}`);
            try {
                await this.initializeTable();
            }
            catch (schemaError) {
                // The original error is the more useful one, so it is what gets
                // thrown - but if the schema really was the problem and we could not
                // fix it, say so plainly and give the statement to run by hand.
                // Otherwise the only symptom is a missing column, and the actual
                // cause - no rights to add it - is invisible.
                if (isMissingSchema(error)) {
                    this.log.error(`The ${TABLE_NAME} table is missing a column this version needs, and it could not be added: ${describeError(schemaError)}\n` +
                        `  Ask someone with DDL rights to run:\n` +
                        `    ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS owner TEXT;`);
                }
                throw error;
            }
            return run();
        }
    }
    /**
     * Creates the lock table when missing, and adds the `owner` column to tables
     * created by earlier versions. Both statements are idempotent.
     */
    async initializeTable() {
        let client;
        try {
            client = await this.connect();
            await client.query(pg_format_lib(`CREATE TABLE IF NOT EXISTS %I (
            id VARCHAR(255) PRIMARY KEY,
            reason TEXT,
            owner TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
            expires_at TIMESTAMP WITHOUT TIME ZONE
          );`, TABLE_NAME));
            await client.query(pg_format_lib(`ALTER TABLE %I ADD COLUMN IF NOT EXISTS owner TEXT;`, TABLE_NAME));
            this.log.debug(`Table ${TABLE_NAME} is present and up to date.`);
        }
        catch (error) {
            // Reported by whoever asked for the schema; `withSchemaRetry` prefers to
            // surface the original failure instead.
            this.log.debug(`Could not create the table ${TABLE_NAME}: ${describeError(error)}`);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async connect() {
        this.log.debug("Attempting to connect to the database.");
        const client = await this.pool.connect();
        this.log.debug("Successfully connected to the database.");
        return client;
    }
    disconnect(client) {
        // Return the connection to the pool, whether an error occurred or not
        client?.release();
        if (client) {
            this.log.debug("Database connection released.");
        }
    }
}
/**
 * True when Postgres is telling us the table or a column is not there:
 * undefined_column (42703) or undefined_table (42P01).
 */
function isMissingSchema(error) {
    const code = error?.code;
    return code === "42703" || code === "42P01";
}
/**
 * Who may unlock or renew a lock: its owner, or anyone at all when it has none.
 *
 * Ownership is what confers protection, so a lock nobody claimed is nobody's to
 * defend - which is also what lets the CLI manage the unowned locks the Action
 * writes today. Naming an owner is the act that makes a lock yours.
 *
 * There is no override. Breaking somebody else's lock means naming them, which
 * makes it a deliberate act rather than a flag appended to a failing command.
 *
 * Exported for tests: the matrix is small, security-relevant, and worth pinning.
 */
function mayModify(record, owner) {
    if (record.owner === null) {
        return true;
    }
    return record.owner === owner;
}
async function rollback(client, log) {
    if (!client) {
        return;
    }
    try {
        await client.query("ROLLBACK");
    }
    catch (error) {
        logWarning(log, error, "Failed to roll back the transaction");
    }
}
function toLockRecord(row) {
    return {
        id: String(row.id),
        reason: row.reason ?? null,
        owner: row.owner ?? null,
        createdAt: toIsoString(row.created_at),
        expiresAt: toIsoString(row.expires_at),
        expired: row.expired === true,
    };
}
function toIsoString(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}
//# sourceMappingURL=database.js.map
;// CONCATENATED MODULE: ./lib/dotsecenv/errors.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/**
 * The dotsecenv CLI's documented exit codes (pkg/dotsecenv/output/exitcodes.go).
 * Mapping them to kinds is what lets the caller tell "this secret does not
 * exist" apart from "GPG could not decrypt it".
 */
const KIND_BY_EXIT_CODE = {
    1: "general",
    2: "config",
    3: "vault",
    4: "gpg",
    5: "auth",
    6: "validation",
    7: "fingerprint",
    8: "access-denied",
    9: "algorithm",
};
function kindForExitCode(code) {
    return KIND_BY_EXIT_CODE[code] ?? "general";
}
class DotsecenvError extends Error {
    kind;
    exitCode;
    stderr;
    hint;
    constructor(message, options) {
        super(message, { cause: options.cause });
        this.name = "DotsecenvError";
        this.kind = options.kind;
        this.exitCode = options.exitCode ?? null;
        this.stderr = options.stderr?.trim() ?? "";
        this.hint = options.hint ?? null;
    }
    /** A multi-line rendering that keeps the CLI's own message and the hint. */
    describe() {
        const lines = [this.message];
        if (this.stderr) {
            lines.push(...this.stderr.split("\n").map((line) => `  ${line}`));
        }
        if (this.hint) {
            lines.push(`  hint: ${this.hint}`);
        }
        return lines.join("\n");
    }
}
//# sourceMappingURL=errors.js.map
;// CONCATENATED MODULE: external "node:util"
const external_node_util_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:util");
;// CONCATENATED MODULE: ./lib/timing.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/**
 * How the lock durations relate to each other.
 *
 * Shared by the Action's inputs and the CLI's flags, which express the same
 * three numbers and used to derive them separately - so a change to one could
 * silently leave the other behind.
 */
const DEFAULT_EXPIRATION_SECONDS = 60;
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
/** "Wait as long as the lease would have lasted." */
const WAIT_FOR_THE_LEASE = -1;
const DEFAULT_MAX_WAIT_SECONDS = WAIT_FOR_THE_LEASE;
/** A whole number of seconds, or the fallback for anything else. */
function seconds(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}
/**
 * How long to keep trying, in milliseconds.
 *
 * `maxWait` of -1 - the default - means "for as long as this lock would have
 * lasted", which is the most useful thing to do when nobody says otherwise:
 * waiting longer than the lease you are about to take is rarely what you want.
 */
function pollTimeoutMs(expiration, maxWait) {
    const lease = Math.max(seconds(expiration, DEFAULT_EXPIRATION_SECONDS), 0);
    let wait = seconds(maxWait, WAIT_FOR_THE_LEASE);
    if (wait < WAIT_FOR_THE_LEASE) {
        wait = WAIT_FOR_THE_LEASE;
    }
    return (wait === WAIT_FOR_THE_LEASE ? lease : wait) * 1000;
}
/** How long to wait between attempts, in milliseconds. */
function pollIntervalMs(pollInterval) {
    const interval = seconds(pollInterval, DEFAULT_POLL_INTERVAL_SECONDS);
    return Math.max(interval, 0) * 1000;
}
//# sourceMappingURL=timing.js.map
;// CONCATENATED MODULE: ./lib/cli/exit-codes.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/**
 * Exit codes are part of the CLI's contract: scripts branch on them, so they
 * distinguish "the lock is held by someone else" from "something broke".
 *
 * `mutex lock <id> -- <program>` is the exception - once the program starts,
 * its own exit status is passed through, exactly like flock.
 */
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_CONFIGURATION = 3;
/** Could not acquire the lock, or it is not held (status/renew). */
const EXIT_UNAVAILABLE = 4;
/** Refused: another owner holds the lock, and the caller did not name them. */
const EXIT_REFUSED = 5;
/** The wrapped program exists but could not be run - not executable, or a
 *  directory. The shell convention. */
const EXIT_NOT_EXECUTABLE = 126;
/** The wrapped program was not found. Also the shell convention. */
const EXIT_NO_PROGRAM = 127;
/** Raised for anything the user can fix by changing the command line. */
class UsageError extends Error {
    constructor(message) {
        super(message);
        this.name = "UsageError";
    }
}
/** Raised when the connection string cannot be worked out. */
class ConfigurationError extends Error {
    hint;
    constructor(message, hint) {
        super(message);
        this.name = "ConfigurationError";
        this.hint = hint ?? null;
    }
}
//# sourceMappingURL=exit-codes.js.map
;// CONCATENATED MODULE: ./lib/cli/args.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */



/** Shared by both acquiring commands. */
const ACQUIRE_OPTIONS = ["reason", "expiration", "no-renew", "owner"];
/** Only `lock` waits, so only `lock` takes the options that describe waiting. */
const LOCK_OPTIONS = [...ACQUIRE_OPTIONS, "max-wait", "poll-interval"];
const CONNECTION_OPTIONS = [
    "env-var",
    "no-secenv",
    "dotsecenv-bin",
    "dotsecenv-config",
];
const GENERAL_OPTIONS = ["json", "quiet", "verbose", "help"];
const COMMANDS = {
    lock: {
        summary: "Acquire a lock, waiting for it to become free",
        usage: "mutex lock <id> [options] [-- <program> [args...]]",
        identifier: "required",
        acceptsProgram: true,
        options: [...LOCK_OPTIONS, ...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    "try-lock": {
        summary: "Acquire a lock in a single attempt, without waiting",
        usage: "mutex try-lock <id> [options] [-- <program> [args...]]",
        identifier: "required",
        acceptsProgram: true,
        options: [...ACQUIRE_OPTIONS, ...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    unlock: {
        summary: "Release a lock",
        usage: "mutex unlock <id> [options]",
        identifier: "required",
        acceptsProgram: false,
        options: [
            "owner",
            "max-wait",
            "poll-interval",
            ...CONNECTION_OPTIONS,
            ...GENERAL_OPTIONS,
        ],
    },
    renew: {
        summary: "Extend a lock you already hold",
        usage: "mutex renew <id> [--owner <name>] [--expiration <seconds>]",
        identifier: "required",
        acceptsProgram: false,
        options: ["expiration", "owner", ...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    status: {
        summary: "Show who holds a lock",
        usage: "mutex status <id> [options]",
        identifier: "required",
        acceptsProgram: false,
        options: [...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    list: {
        summary: "List every lock, expired ones included",
        usage: "mutex list [options]",
        identifier: "none",
        acceptsProgram: false,
        options: [...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    prune: {
        summary: "Delete locks that have already expired",
        usage: "mutex prune [--dry-run] [options]",
        identifier: "none",
        acceptsProgram: false,
        options: ["dry-run", ...CONNECTION_OPTIONS, ...GENERAL_OPTIONS],
    },
    help: {
        summary: "Show this help, or help for one command",
        usage: "mutex help [command]",
        identifier: "none",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
    version: {
        summary: "Print the mutex version",
        usage: "mutex version",
        identifier: "none",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
};
const OPTION_CONFIG = {
    reason: { type: "string", short: "r" },
    expiration: { type: "string", short: "e" },
    "max-wait": { type: "string", short: "w" },
    "poll-interval": { type: "string", short: "i" },
    "no-renew": { type: "boolean" },
    owner: { type: "string", short: "o" },
    "dry-run": { type: "boolean" },
    "env-var": { type: "string" },
    "no-secenv": { type: "boolean" },
    "dotsecenv-bin": { type: "string" },
    "dotsecenv-config": { type: "string" },
    json: { type: "boolean" },
    quiet: { type: "boolean", short: "q" },
    verbose: { type: "boolean" },
    help: { type: "boolean", short: "h" },
};
/**
 * `renew` leases longer than `lock` does, because the two answer different
 * questions: a lock says how long the work is expected to take, a renewal says
 * how much longer it needs. Renewing is also the point at which a short
 * default is most expensive - it is called by things that have already been
 * running a while.
 */
const DEFAULT_RENEW_EXPIRATION_SECONDS = 3600;
function parseCommandLine(argv) {
    // Split on `--` before parsing, so the wrapped program's own flags are never
    // mistaken for mutex's.
    const separator = argv.indexOf("--");
    const own = separator === -1 ? argv : argv.slice(0, separator);
    const program = separator === -1 ? [] : argv.slice(separator + 1);
    let parsed;
    try {
        parsed = (0,external_node_util_namespaceObject.parseArgs)({
            args: own,
            options: OPTION_CONFIG,
            allowPositionals: true,
            strict: true,
        });
    }
    catch (error) {
        throw new UsageError(error instanceof Error ? error.message : String(error));
    }
    const values = parsed.values;
    const positionals = parsed.positionals;
    // `--help`/`--version` win over whatever command was typed.
    let command;
    let topic = null;
    if (values.help) {
        command = "help";
        topic = asCommandName(positionals[0]) ?? null;
    }
    else if (positionals.length === 0) {
        throw new UsageError("no command given");
    }
    else {
        const name = asCommandName(positionals[0]);
        if (!name) {
            throw new UsageError(`unknown command '${positionals[0]}'`);
        }
        command = name;
        if (command === "help") {
            topic = asCommandName(positionals[1]) ?? null;
        }
    }
    const spec = COMMANDS[command];
    const identifier = command === "help" ? "" : (positionals[1] ?? "");
    if (command !== "help") {
        if (spec.identifier === "required" && identifier === "") {
            throw new UsageError(`'${command}' needs a lock id\n  ${spec.usage}`);
        }
        const expected = spec.identifier === "none" ? 1 : 2;
        if (positionals.length > expected) {
            throw new UsageError(`unexpected argument '${positionals[expected]}'\n  ${spec.usage}`);
        }
    }
    if (program.length > 0 && !spec.acceptsProgram) {
        throw new UsageError(`'${command}' cannot wrap a program`);
    }
    // Not when asking for help: `mutex lock id -e 30 --help` is someone who
    // wants to know what --expiration does, and answering "'help' does not take
    // --expiration" is the least useful thing to say to them.
    if (command !== "help") {
        rejectInapplicableOptions(command, spec, values);
    }
    return {
        command,
        identifier,
        program,
        topic,
        options: resolveOptions(command, values),
    };
}
function resolveOptions(command, values) {
    const expiration = readNumber(values.expiration, "expiration", command === "renew"
        ? DEFAULT_RENEW_EXPIRATION_SECONDS
        : DEFAULT_EXPIRATION_SECONDS);
    if (expiration <= 0) {
        throw new UsageError("--expiration must be greater than 0");
    }
    const pollInterval = readNumber(values["poll-interval"], "poll-interval", DEFAULT_POLL_INTERVAL_SECONDS);
    if (pollInterval < 0) {
        throw new UsageError("--poll-interval cannot be negative");
    }
    const maxWait = readNumber(values["max-wait"], "max-wait", DEFAULT_MAX_WAIT_SECONDS);
    if (maxWait < DEFAULT_MAX_WAIT_SECONDS) {
        throw new UsageError(`--max-wait cannot be below ${DEFAULT_MAX_WAIT_SECONDS}, which already means "as long as the lease"`);
    }
    return {
        reason: typeof values.reason === "string" ? values.reason : "",
        expiration,
        // try-lock is exactly one attempt: no waiting, whatever else was passed.
        pollTimeoutMs: command === "try-lock" ? 0 : pollTimeoutMs(expiration, maxWait),
        pollIntervalMs: pollIntervalMs(pollInterval),
        autoRenew: values["no-renew"] !== true,
        owner: readOwner(values.owner),
        dryRun: values["dry-run"] === true,
        envVar: typeof values["env-var"] === "string"
            ? values["env-var"]
            : "DATABASE_URL",
        useSecenv: values["no-secenv"] !== true,
        dotsecenvBin: typeof values["dotsecenv-bin"] === "string"
            ? values["dotsecenv-bin"]
            : null,
        dotsecenvConfig: typeof values["dotsecenv-config"] === "string"
            ? values["dotsecenv-config"]
            : null,
        json: values.json === true,
        logLevel: values.quiet === true
            ? "error"
            : values.verbose === true
                ? "debug"
                : "info",
    };
}
/**
 * Who is taking the lock, or null when nobody says.
 *
 * Unowned is the default on purpose: it matches what the GitHub Action writes,
 * so an unowned caller can unlock and renew an unowned lock, whichever of the
 * two took it. Naming an owner is what opts into the stricter guards.
 */
function defaultOwner() {
    return process.env.MUTEX_OWNER?.trim() || null;
}
/**
 * An owner given on the command line, or the default.
 *
 * Blank counts as unowned, so `--owner "$CI_RUN"` degrades to unowned rather
 * than to an owner literally named "" when the variable is unset.
 */
function readOwner(value) {
    if (typeof value === "string") {
        return value.trim() || null;
    }
    return defaultOwner();
}
function rejectInapplicableOptions(command, spec, values) {
    const allowed = new Set(spec.options);
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined || allowed.has(name)) {
            continue;
        }
        throw new UsageError(`'${command}' does not take --${name}\n  ${spec.usage}`);
    }
}
/** A whole number of seconds, and nothing else pretending to be one. */
const WHOLE_SECONDS = /^-?\d+$/;
function readNumber(value, name, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    // `-e=45` is a habit worth tolerating: node's parseArgs keeps the '=' for
    // short options, so the value arrives as "=45".
    const text = value.startsWith("=") ? value.slice(1) : value;
    // Number() alone is far too generous here: "" is 0, so `-e "$UNSET"` would
    // silently mean zero; "0x3c" is 60; "1e21" is an integer that reaches
    // Postgres as a syntax error. Only digits.
    if (!WHOLE_SECONDS.test(text)) {
        throw new UsageError(`--${name} must be a whole number of seconds, not '${value}'`);
    }
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed)) {
        throw new UsageError(`--${name} is out of range: '${value}'`);
    }
    return parsed;
}
function asCommandName(value) {
    // hasOwn, not `in`: `"toString" in COMMANDS` is true, and would be accepted
    // as a command whose spec is undefined.
    if (value && Object.hasOwn(COMMANDS, value)) {
        return value;
    }
    return null;
}
function helpText(topic) {
    if (topic && topic !== "help") {
        const spec = COMMANDS[topic];
        return [
            spec.summary,
            "",
            `Usage: ${spec.usage}`,
            "",
            "Options:",
            ...spec.options.map((name) => `  --${name}`),
            "",
        ].join("\n");
    }
    const commands = Object.keys(COMMANDS)
        .map((name) => `  ${name.padEnd(10)} ${COMMANDS[name].summary}`)
        .join("\n");
    return `mutex - an advisory lock service for CI/CD pipelines, backed by PostgreSQL

Usage: mutex <command> <id> [options] [-- <program> [args...]]

Commands:
${commands}

renew extends a lock you already hold: the id and the owner must both match,
and it fails - rather than taking a new lock - if the lock expired or is gone.
It only ever moves an expiry further out, never nearer.

Lock options:
  -r, --reason <text>            Why the lock is being taken
  -e, --expiration <seconds>     How long the lock lasts (default: ${DEFAULT_EXPIRATION_SECONDS};
                                 renew: ${DEFAULT_RENEW_EXPIRATION_SECONDS}, and never shortens a lease)
  -w, --max-wait <seconds>       How long to wait for it (default: -1, i.e. --expiration)
  -i, --poll-interval <seconds>  Delay between attempts (default: ${DEFAULT_POLL_INTERVAL_SECONDS})
      --no-renew                 Do not renew the lock while a wrapped program runs
  -o, --owner <name>             Who is taking the lock (default: $MUTEX_OWNER, else unowned)

Connection:
      --env-var <NAME>           Variable holding it (default: DATABASE_URL)
      --no-secenv                Do not read ./.secenv
      --dotsecenv-bin <path>     The dotsecenv binary (default: $DOTSECENV_BIN or dotsecenv)
      --dotsecenv-config <path>  Passed to dotsecenv as -c

prune:
      --dry-run                  List what would be deleted, and delete nothing

General:
      --json                     Machine-readable output
  -q, --quiet                    Errors only
      --verbose                  Include debug output
  -h, --help                     Show help

The connection string is taken from $DATABASE_URL, then ./.secenv in the
working directory, resolved through the dotsecenv CLI. There is deliberately no
flag for it: a connection string on the command line is visible in shell
history, and in "ps" to every user on the machine for as long as mutex runs.

Exit codes: 0 ok, 1 error, 2 usage, 3 configuration, 4 not acquired / not held,
5 refused (owned by another). While wrapping a program, its status is returned.
`;
}
//# sourceMappingURL=args.js.map
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: ./lib/mutex.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * The two mutex operations, shared by the GitHub Action and the CLI.
 *
 * The CLI commands map onto them directly:
 *   mutex lock      -> tryLock (polls until `max-wait` elapses)
 *   mutex try-lock  -> tryLock with a zero timeout (a single attempt)
 *   mutex unlock    -> tryUnlock
 *
 * `mutex renew` is not here: extending a lock is a single UPDATE with nothing
 * to poll for, so it goes straight to `DatabaseMutex.renewLock`.
 *
 * Nothing here imports the Actions toolkit: callers supply a `Logger` for
 * output and `LockEvents` for whatever side effects they need.
 */
/**
 * Floor for the delay between attempts. A `poll-interval` of 0 would otherwise
 * turn the wait loop into a hot loop hammering Postgres.
 */
const MIN_POLL_INTERVAL_MS = 100;
function pollIntervalFor(request) {
    return request.pollIntervalMs > 0
        ? request.pollIntervalMs
        : MIN_POLL_INTERVAL_MS;
}
/**
 * The wait, in milliseconds, treating anything not a real number as zero.
 *
 * NaN arrives easily - `parseInt("")` on an unset workflow input - and every
 * comparison against it is false, which in a loop that breaks on a comparison
 * means it never breaks. Zero is the safe reading: try once, then give up.
 */
function pollTimeoutFor(request) {
    return Number.isFinite(request.pollTimeoutMs)
        ? Math.max(request.pollTimeoutMs, 0)
        : 0;
}
/**
 * Acquire the lock, retrying until `pollTimeoutMs` elapses.
 *
 * Always makes at least one attempt, so a zero timeout means "try once" rather
 * than "do nothing" - that is what `mutex try-lock` relies on.
 */
async function tryLock(request, mutex, log, events = {}) {
    const timeoutMs = pollTimeoutFor(request);
    const intervalMs = pollIntervalFor(request);
    const deadline = Date.now() + timeoutMs;
    log.info(`Attempting to acquire lock '${request.identifier}'. Timeout: ${timeoutMs / 1000}s`);
    let attempt = 0;
    let result = { acquired: false, status: "No attempt was made" };
    for (;;) {
        attempt++;
        result = await mutex.acquireLock(request.identifier, request.reason, request.owner ?? null);
        if (result.acquired) {
            log.info(`Lock '${request.identifier}' acquired on attempt ${attempt}.`);
            await events.onLocked?.(result);
            return result;
        }
        // Stop once there is no room left for another attempt before the deadline,
        // rather than sleeping past it and reporting a stale failure.
        if (Date.now() + intervalMs >= deadline) {
            break;
        }
        await events.onContended?.(result, attempt);
        log.info(`Waiting for lock '${request.identifier}' (${result.status}). Retrying in ${intervalMs / 1000}s...`);
        await sleep(intervalMs);
    }
    await events.onTimeout?.(`⌛ Timed out waiting for lock '${request.identifier}' after ${timeoutMs / 1000} seconds.`);
    return result;
}
/**
 * Release the lock, retrying while the attempt is merely contended.
 *
 * Unlocking something that is not locked succeeds: unlock is idempotent. A
 * refusal (`owned-by-another`) is a decision rather than a transient failure,
 * so it short-circuits the retry loop.
 */
async function tryUnlock(request, mutex, log, events = {}) {
    const timeoutMs = pollTimeoutFor(request);
    const intervalMs = pollIntervalFor(request);
    const deadline = Date.now() + timeoutMs;
    log.info(`Attempting to unlock '${request.identifier}'.`);
    let result = { unlocked: false, outcome: "contended" };
    for (;;) {
        result = await mutex.releaseLock(request.identifier, request.owner ?? null, request.fence ?? null);
        if (result.unlocked ||
            result.outcome === "owned-by-another" ||
            result.outcome === "superseded") {
            break;
        }
        if (Date.now() + intervalMs >= deadline) {
            break;
        }
        log.info(`Could not unlock '${request.identifier}' yet (${result.outcome}). Retrying in ${intervalMs / 1000}s...`);
        await sleep(intervalMs);
    }
    if (result.unlocked) {
        log.info(`Lock '${request.identifier}' released.`);
        await events.onUnlocked?.(result);
    }
    else if (result.outcome === "owned-by-another" ||
        result.outcome === "superseded") {
        const message = result.outcome === "superseded"
            ? `Refusing to unlock '${request.identifier}': it has since been taken by somebody else.`
            : `Refusing to unlock '${request.identifier}': it is held by another owner.`;
        log.warning(message);
        await (events.onRefused
            ? events.onRefused(result)
            : events.onTimeout?.(message));
    }
    else {
        await events.onTimeout?.(`⌛ Timed out waiting to unlock '${request.identifier}' after ${timeoutMs / 1000} seconds.`);
    }
    return result;
}
//# sourceMappingURL=mutex.js.map
;// CONCATENATED MODULE: ./lib/cli/output.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/**
 * Command results.
 *
 * Two streams, because the two kinds of output serve different readers:
 *
 * - Acting commands (`lock`, `unlock`) report to **stderr**. What they produce
 *   is a status report, not data, and keeping it off stdout means the same
 *   command behaves identically whether or not it is wrapping a program.
 * - Querying commands (`status`, `list`, `prune`) write to **stdout**, so
 *   `mutex list > locks.txt` captures what it should.
 * - `--json` always goes to stdout - that is the machine-readable channel -
 *   except while wrapping a program, which owns stdout outright.
 */
class Output {
    humanStream;
    jsonStream;
    json;
    quiet;
    constructor(humanStream, jsonStream, json, 
    /**
     * Suppresses the human rendering, leaving the exit code to speak. What
     * `if mutex status deploy --quiet; then` relies on. `--json` is unaffected:
     * asking for machine-readable output and then silencing it is not a
     * combination worth honouring.
     */
    quiet = false) {
        this.humanStream = humanStream;
        this.jsonStream = jsonStream;
        this.json = json;
        this.quiet = quiet;
    }
    /** The ordinary outcome. Silenced by `--quiet`, which the exit code covers. */
    result(payload, human) {
        this.write(payload, human, this.quiet, this.humanStream);
    }
    /**
     * An outcome that is not what was asked for: a lock not acquired, a release
     * refused, a renewal declined.
     *
     * Printed even under `--quiet`, and always to stderr. Quiet means "do not
     * narrate the ordinary", not "say nothing when something is wrong" - and
     * these are the cases where the exit code alone leaves someone guessing
     * which of several reasons applied.
     */
    problem(payload, human) {
        this.write(payload, human, false, process.stderr);
    }
    write(payload, human, silenced, stream) {
        if (this.json) {
            this.jsonStream.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
        }
        if (silenced) {
            return;
        }
        for (const line of Array.isArray(human) ? human : [human]) {
            stream.write(`${line}\n`);
        }
    }
}
/**
 * Explains an operation refused because the two owners are not the same, and
 * says exactly what to pass to go ahead anyway.
 *
 * Naming the holder is the confirmation: there is no flag that means "do it
 * regardless", so breaking a lock is always a deliberate statement of whose.
 */
function describeOwnerMismatch(identifier, held, caller, verb) {
    const lock = held ? `is held by '${held}'` : "is unowned";
    const call = caller ? `this call is '${caller}'` : "this call is unowned";
    const remedy = held
        ? `Pass --owner '${held}' to ${verb} it.`
        : `Retry without --owner to ${verb} it.`;
    return `'${identifier}' ${lock}; ${call}. ${remedy}`;
}
/**
 * The headline plus stats printed when a lock is taken or extended: the id
 * matters most when it was generated, and the expiry is what the caller has to
 * plan around.
 */
function describeLockAction(verb, record, fallbackId) {
    if (!record) {
        return [`${verb} lock '${fallbackId}'`];
    }
    return [
        `${verb} lock '${record.id}'`,
        `  owner:   ${record.owner ?? "(none)"}`,
        `  reason:  ${record.reason || "(none)"}`,
        `  created: ${record.createdAt ?? "(unknown)"}`,
        `  expires: ${describeExpiry(record)}`,
    ];
}
function describeRecord(record) {
    return [
        `id:      ${record.id}`,
        `state:   ${record.expired ? "expired" : "held"}`,
        `owner:   ${record.owner ?? "(none)"}`,
        `reason:  ${record.reason || "(none)"}`,
        `created: ${record.createdAt ?? "(unknown)"}`,
        `expires: ${describeExpiry(record)}`,
    ];
}
function describeExpiry(record) {
    if (!record.expiresAt) {
        return "(never)";
    }
    const remaining = Date.parse(record.expiresAt) - Date.now();
    if (Number.isNaN(remaining)) {
        return record.expiresAt;
    }
    return remaining >= 0
        ? `${record.expiresAt} (in ${formatDuration(remaining)})`
        : `${record.expiresAt} (${formatDuration(-remaining)} ago)`;
}
/** A one-line summary, used by `mutex list` and by contention messages. */
function summarizeRecord(record) {
    const owner = record.owner ?? "-";
    const state = record.expired ? "expired" : "held";
    const reason = record.reason ? ` "${record.reason}"` : "";
    return `${record.id}\t${state}\t${owner}\t${record.expiresAt ?? "-"}${reason}`;
}
function formatDuration(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
//# sourceMappingURL=output.js.map
;// CONCATENATED MODULE: ./lib/cli/commands.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */






const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
/**
 * How long the post-program release keeps trying.
 *
 * A `contended` release right after a wrapped program is almost always this
 * job's own background renewal still inside its transaction, which clears in
 * milliseconds - so a brief retry is worth far more than a report. Short,
 * because this runs between the program exiting and mutex exiting.
 */
const CLEANUP_TIMEOUT_MS = 5_000;
const CLEANUP_INTERVAL_MS = 250;
/** Interrupts during the release before mutex stops waiting and gives up. */
const IMPATIENT_SIGNALS = 3;
/**
 * Floor for the background renewal.
 *
 * Low on purpose. At the previous 1000 ms, a one-second lease renewed at the
 * exact moment it expired - a coin flip on whether the lock survived - which
 * quietly defeated renewal for the shortest leases instead of protecting them.
 */
const MIN_RENEWAL_INTERVAL_MS = 250;
/**
 * `mutex lock` and `mutex try-lock`, which differ only in how long they wait -
 * `parseCommandLine` has already zeroed the timeout for `try-lock`.
 *
 * With a program after `--`, the lock is held for exactly as long as that
 * program runs and is released on every exit path.
 */
async function commandLock(ctx, identifier, program, command = "lock") {
    const result = await tryLock(requestFor(ctx, identifier), ctx.mutex, ctx.log, {
        onContended: (contended) => {
            if (contended.record) {
                ctx.log.info(`  ${summarizeRecord(contended.record)}`);
            }
        },
    });
    if (!result.acquired) {
        ctx.out.problem({
            command,
            ok: false,
            id: identifier,
            status: result.status,
            holder: result.record ?? null,
        }, [
            `Could not acquire '${identifier}': ${result.status}`,
            ...(result.record ? describeRecord(result.record) : []),
        ]);
        return EXIT_UNAVAILABLE;
    }
    if (program.length === 0) {
        ctx.out.result({
            command,
            ok: true,
            id: identifier,
            owner: ctx.options.owner,
            expires: result.expires ?? null,
            lock: result.record ?? null,
        }, describeLockAction("Acquired", result.record, identifier));
        return EXIT_OK;
    }
    return runProgram(ctx, identifier, program, result, command);
}
/** `mutex unlock`. */
async function commandUnlock(ctx, identifier) {
    const result = await tryUnlock(requestFor(ctx, identifier), ctx.mutex, ctx.log);
    if (result.outcome === "owned-by-another") {
        ctx.out.problem({
            command: "unlock",
            ok: false,
            id: identifier,
            outcome: result.outcome,
            holder: result.record ?? null,
        }, describeOwnerMismatch(identifier, result.record?.owner, ctx.options.owner, "unlock"));
        return EXIT_REFUSED;
    }
    if (!result.unlocked) {
        ctx.out.problem({ command: "unlock", ok: false, id: identifier, outcome: result.outcome }, `Could not unlock '${identifier}' (${result.outcome}).`);
        return EXIT_ERROR;
    }
    ctx.out.result({
        command: "unlock",
        ok: true,
        id: identifier,
        outcome: result.outcome,
        lock: result.record ?? null,
    }, result.outcome === "not-found"
        ? `'${identifier}' was not held; nothing to unlock.`
        : `Unlocked '${identifier}'.`);
    return EXIT_OK;
}
/**
 * `mutex renew`: extend a lock this owner already holds.
 *
 * Never takes a lock. If the id is not held, or is held by somebody else, or
 * has expired, that is a failure - the caller has lost the lock and needs to
 * know, not to silently acquire a new one.
 */
async function commandRenew(ctx, identifier) {
    const result = await ctx.mutex.renewLock(identifier, ctx.options.expiration, ctx.options.owner);
    if (result.renewed) {
        ctx.out.result({
            command: "renew",
            ok: true,
            id: identifier,
            owner: ctx.options.owner,
            extended: result.extended !== false,
            expires: result.record?.expiresAt ?? null,
            lock: result.record ?? null,
        }, describeLockAction(result.extended === false ? "Kept" : "Renewed", result.record, identifier));
        return EXIT_OK;
    }
    const explanation = {
        "not-found": `'${identifier}' is not held, so there is nothing to renew.`,
        "owned-by-another": describeOwnerMismatch(identifier, result.record?.owner, ctx.options.owner, "renew"),
        expired: `'${identifier}' expired at ${result.record?.expiresAt}; it may already have been taken over.`,
        contended: `'${identifier}' is being changed by another process; try again.`,
    };
    ctx.out.problem({
        command: "renew",
        ok: false,
        id: identifier,
        owner: ctx.options.owner,
        outcome: result.outcome,
        lock: result.record ?? null,
    }, explanation[result.outcome] ?? `Could not renew '${identifier}'.`);
    if (result.outcome === "owned-by-another") {
        return EXIT_REFUSED;
    }
    return result.outcome === "contended" ? EXIT_ERROR : EXIT_UNAVAILABLE;
}
/** `mutex status`: exit 0 while the lock is held, 4 once it is free. */
async function commandStatus(ctx, identifier) {
    const record = await ctx.mutex.inspectLock(identifier);
    if (!record) {
        ctx.out.result({ command: "status", id: identifier, held: false, lock: null }, `'${identifier}' is not held.`);
        return EXIT_UNAVAILABLE;
    }
    ctx.out.result({ command: "status", id: identifier, held: !record.expired, lock: record }, describeRecord(record));
    return record.expired ? EXIT_UNAVAILABLE : EXIT_OK;
}
/** `mutex list`. */
async function commandList(ctx) {
    const records = await ctx.mutex.listLocks();
    ctx.out.result({ command: "list", count: records.length, locks: records }, [
        ...(records.length === 0 ? ["No locks."] : renderTable(records)),
    ]);
    return EXIT_OK;
}
/** `mutex prune`. */
async function commandPrune(ctx) {
    const removed = await ctx.mutex.pruneExpired(ctx.options.dryRun);
    const verb = ctx.options.dryRun ? "Would delete" : "Deleted";
    ctx.out.result({
        command: "prune",
        dryRun: ctx.options.dryRun,
        count: removed.length,
        locks: removed,
    }, removed.length === 0
        ? "No expired locks."
        : [`${verb} ${removed.length} expired lock(s):`, ...renderTable(removed)]);
    return EXIT_OK;
}
function requestFor(ctx, identifier) {
    return {
        identifier,
        reason: ctx.options.reason,
        pollTimeoutMs: ctx.options.pollTimeoutMs,
        pollIntervalMs: ctx.options.pollIntervalMs,
        owner: ctx.options.owner,
    };
}
async function runProgram(ctx, identifier, program, lock, command) {
    ctx.out.result({
        command,
        ok: true,
        id: identifier,
        owner: ctx.options.owner,
        expires: lock.expires ?? null,
        program,
    }, [
        ...describeLockAction("Acquired", lock.record, identifier),
        `  running: ${program.join(" ")}`,
    ]);
    const renewal = ctx.options.autoRenew ? startRenewal(ctx, identifier) : null;
    const signals = relaySignals(ctx.log, identifier);
    try {
        return await spawnProgram(program, signals);
    }
    catch (error) {
        // Shell convention, which scripts branch on: 127 is "no such command",
        // 126 is "there it is, but I cannot run it". Collapsing the second into a
        // generic failure makes it indistinguishable from mutex itself breaking.
        const code = error.code;
        if (code === "ENOENT" || code === "ENOTDIR") {
            ctx.log.error(`${program[0]}: command not found`);
            return EXIT_NO_PROGRAM;
        }
        if (code === "EACCES" || code === "EPERM" || code === "EISDIR") {
            ctx.log.error(`${program[0]}: not executable`);
            return EXIT_NOT_EXECUTABLE;
        }
        throw error;
    }
    finally {
        renewal?.stop();
        // Signals stay handled across the release, so an impatient second Ctrl-C
        // cannot kill mutex between the program exiting and the lock going back.
        signals.enterRelease();
        try {
            // The lock must go back even when the program crashed, so a failure here
            // is reported rather than thrown - it must not mask the program's status.
            await unlockQuietly(ctx, identifier, lock.record?.createdAt ?? null);
        }
        finally {
            signals.dispose();
        }
    }
}
/**
 * Keeps the lock alive for as long as the wrapped program runs.
 *
 * Without this the promise `mutex lock <id> -- <program>` makes would be false:
 * a program outliving `--expiration` would carry on with a lapsed lock while
 * somebody else picked it up.
 */
function startRenewal(ctx, identifier) {
    // A third of the lease, so a renewal can fail twice before the lock lapses.
    // The floor is only there to stop a pathological zero becoming a busy loop;
    // it must stay well under the shortest usable lease, or it would schedule
    // the renewal at or after the expiry it exists to prevent.
    const intervalMs = Math.max(Math.floor((ctx.options.expiration * 1000) / 3), MIN_RENEWAL_INTERVAL_MS);
    let inFlight = false;
    const timer = setInterval(() => {
        if (inFlight) {
            return;
        }
        inFlight = true;
        ctx.mutex
            .renewLock(identifier, ctx.options.expiration, ctx.options.owner)
            .then((result) => {
            if (result.renewed) {
                ctx.log.debug(`Renewed '${identifier}'.`);
            }
            else {
                ctx.log.warning(`Could not renew '${identifier}' (${result.outcome}); it may lapse before the program finishes.`);
            }
        })
            .catch((error) => logWarning(ctx.log, error, `Could not renew '${identifier}'`))
            .finally(() => {
            inFlight = false;
        });
    }, intervalMs);
    return { stop: () => clearInterval(timer) };
}
/**
 * Releases the lock once a wrapped program has finished.
 *
 * Never throws - the program's exit status is what the caller asked for, and a
 * cleanup problem must not replace it. But it is reported at error level, not
 * warning: `--quiet` lowers the threshold to errors, and "the lock is still
 * held" is precisely what someone running quietly still needs to be told.
 */
async function unlockQuietly(ctx, identifier, fence) {
    const stranded = (detail) => {
        const owner = ctx.options.owner ? ` --owner '${ctx.options.owner}'` : "";
        ctx.log.error(`${detail}\n` +
            `  '${identifier}' stays held until it expires. Release it with:\n` +
            `    mutex unlock ${identifier}${owner}`);
    };
    try {
        const result = await tryUnlock({
            ...requestFor(ctx, identifier),
            pollTimeoutMs: CLEANUP_TIMEOUT_MS,
            pollIntervalMs: CLEANUP_INTERVAL_MS,
            fence,
        }, ctx.mutex, ctx.log);
        if (result.unlocked) {
            ctx.log.info(`Unlocked '${identifier}'.`);
            return;
        }
        if (result.outcome === "superseded") {
            // Not stranded: the lease lapsed, somebody else holds it now, and
            // deleting theirs would be the worse outcome by far.
            ctx.log.error(`'${identifier}' expired while the program ran and has been taken by somebody else; left alone.`);
            return;
        }
        stranded(`Could not unlock '${identifier}' (${result.outcome}).`);
    }
    catch (error) {
        stranded(`Could not unlock '${identifier}': ${describeError(error)}`);
    }
}
/**
 * Runs the program with our own stdio, and forwards the signals that would
 * otherwise kill mutex without giving it a chance to release the lock.
 *
 * Running what the caller asked for is the whole point of the `--` form, the
 * same contract flock has, so the program name being caller-controlled is the
 * feature rather than a flaw. What matters is that it stays a plain execve:
 * never a shell, and arguments passed as an array, so nothing in them can be
 * reinterpreted as syntax.
 */
/**
 * Keeps SIGINT/SIGTERM/SIGHUP handled for the whole of the wrapper's life, not
 * just while the program runs.
 *
 * While there is a child, signals go to it. Once it has gone and the lock is
 * being handed back, they are absorbed instead - because removing the last
 * SIGINT listener restores Node's kill-immediately default, and a release is a
 * database round-trip, so a second impatient Ctrl-C in that window would kill
 * mutex with the lock still held. Three of them and it gives up anyway; a tool
 * that cannot be interrupted is its own kind of broken.
 */
function relaySignals(log, identifier) {
    let child = null;
    let releasing = false;
    let nudges = 0;
    const handler = (signal) => {
        if (child) {
            child.kill(signal);
            return;
        }
        if (!releasing) {
            return;
        }
        nudges++;
        if (nudges >= IMPATIENT_SIGNALS) {
            log.error(`Abandoning the release: '${identifier}' stays held until it expires.`);
            dispose();
            process.exit(128 + (external_node_os_namespaceObject.constants.signals[signal] ?? 0));
        }
        log.warning(`Releasing '${identifier}' - one moment. Interrupt ${IMPATIENT_SIGNALS - nudges} more time(s) to abandon it.`);
    };
    const dispose = () => {
        for (const signal of SIGNALS) {
            process.removeListener(signal, handler);
        }
    };
    for (const signal of SIGNALS) {
        process.on(signal, handler);
    }
    return {
        attach: (started) => {
            child = started;
        },
        /** The child has gone; from here signals mean "wait, I am cleaning up". */
        enterRelease: () => {
            child = null;
            releasing = true;
        },
        dispose,
    };
}
function spawnProgram(program, signals) {
    return new Promise((resolve, reject) => {
        if (!program[0]) {
            reject(Object.assign(new Error("no program to run"), { code: "ENOENT" }));
            return;
        }
        const child = (0,external_node_child_process_namespaceObject.spawn)(program[0], program.slice(1), {
            stdio: "inherit",
            shell: false,
        });
        signals.attach(child);
        child.on("error", (error) => reject(error));
        child.on("close", (code, signal) => {
            if (signal) {
                // The shell convention for "killed by a signal".
                resolve(128 + (external_node_os_namespaceObject.constants.signals[signal] ?? 0));
                return;
            }
            resolve(code ?? 0);
        });
    });
}
function renderTable(records) {
    const rows = [
        ["ID", "STATE", "OWNER", "EXPIRES", "REASON"],
        ...records.map((record) => [
            record.id,
            record.expired ? "expired" : "held",
            record.owner ?? "-",
            record.expiresAt ?? "-",
            record.reason || "-",
        ]),
    ];
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
    return rows.map((row) => row
        .map((cell, column) => column === row.length - 1 ? cell : cell.padEnd(widths[column]))
        .join("  "));
}
//# sourceMappingURL=commands.js.map
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: ./lib/dotsecenv/secenv.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */


/**
 * A parser for `.secenv` files.
 *
 * The rules mirror `_dotsecenv_parse_line` in the dotsecenv shell plugin, so a
 * file behaves the same whether it is loaded by the shell or by this client:
 *
 *   KEY=value                    plain value
 *   KEY="value" / KEY='value'    plain value, surrounding quotes stripped
 *   KEY={dotsecenv}              secret named KEY
 *   KEY={dotsecenv/}             secret named KEY
 *   KEY={dotsecenv/SECRET}       secret named SECRET
 *   KEY={dotsecenv/ns::SECRET}   secret named ns::SECRET
 *   # comment / empty            ignored
 */
const SECENV_FILENAME = ".secenv";
/** Environment variable names: a letter or underscore, then word characters. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Secret keys, optionally carrying a single `namespace::` prefix. */
const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)?$/;
const SECRET_REFERENCE = /^\{dotsecenv\/(.*)\}$/;
function parseSecenv(content, file) {
    const entries = [];
    const issues = [];
    content.split("\n").forEach((raw, index) => {
        const line = index + 1;
        // Trim both ends, which also drops the trailing CR of a CRLF file so a
        // `{dotsecenv/}` reference keeps a clean closing brace.
        const trimmed = raw.trim();
        if (trimmed === "" || trimmed.startsWith("#")) {
            return;
        }
        const separator = trimmed.indexOf("=");
        if (separator < 0) {
            return;
        }
        const key = trimmed.slice(0, separator);
        if (!KEY_PATTERN.test(key)) {
            return;
        }
        const value = stripQuotes(trimmed.slice(separator + 1));
        if (value === "{dotsecenv}") {
            entries.push({ key, kind: "secret", value: key, file, line });
            return;
        }
        const reference = SECRET_REFERENCE.exec(value);
        if (!reference) {
            entries.push({ key, kind: "plain", value, file, line });
            return;
        }
        const name = reference[1];
        if (name === "") {
            // `{dotsecenv/}` means the same as `{dotsecenv}`.
            entries.push({ key, kind: "secret", value: key, file, line });
            return;
        }
        if (name.includes("/")) {
            issues.push({
                file,
                line,
                message: `invalid syntax '${value}' - only one '/' allowed`,
            });
            return;
        }
        if (!SECRET_NAME_PATTERN.test(name)) {
            issues.push({
                file,
                line,
                message: `invalid secret name '${name}' in '${value}'`,
            });
            return;
        }
        entries.push({ key, kind: "secret", value: name, file, line });
    });
    return { file, entries, issues };
}
async function readSecenv(file) {
    const content = await external_node_fs_namespaceObject.promises.readFile(file, "utf8");
    return parseSecenv(content, file);
}
/**
 * The `.secenv` in `cwd`, or null when there is none.
 *
 * Deliberately does not walk upwards. An upward search has to stop somewhere,
 * and outside a git repository there is no sensible somewhere: from
 * /tmp/build-1234 it reaches /tmp, which anybody can write to, and a planted
 * `.secenv` there would decide which database mutex locks against. Reading one
 * directory is predictable and cannot be steered from outside it.
 *
 * Point `--secenv-dir` at the project root to use a file that lives higher up.
 */
function findSecenvFile(cwd = process.cwd()) {
    const candidate = external_node_path_namespaceObject.join(external_node_path_namespaceObject.resolve(cwd), SECENV_FILENAME);
    return isFile(candidate) ? candidate : null;
}
function stripQuotes(value) {
    if (value.length >= 2) {
        const quote = value[0];
        if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
            return value.slice(1, -1);
        }
    }
    return value;
}
function isFile(candidate) {
    try {
        return external_node_fs_namespaceObject.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=secenv.js.map
;// CONCATENATED MODULE: ./lib/dotsecenv/cli.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */



/**
 * A thin wrapper around the `dotsecenv` binary.
 *
 * Decryption is delegated rather than reimplemented: the CLI owns GPG, vault
 * resolution and signature verification, and it is the only thing that can
 * read a secret. This module's job is to invoke it correctly and to turn its
 * exit codes into errors a caller can act on.
 */
const DEFAULT_TIMEOUT_MS = 60_000;
/**
 * How long a timed-out child gets to exit on SIGTERM before SIGKILL.
 *
 * SIGTERM is a request, and the likeliest reason to be here is GPG sitting on
 * a passphrase prompt that never comes - which can decline it. Since the
 * promise only settles on `close`, a child that ignores SIGTERM hangs mutex
 * for good, with stdout still buffering. SIGKILL cannot be declined, so the
 * timeout keeps its promise.
 */
const KILL_GRACE_MS = 5_000;
function dotsecenvBinary(explicit) {
    return explicit || process.env.DOTSECENV_BIN || "dotsecenv";
}
/**
 * Decrypts one secret.
 *
 * `--json` is used rather than the bare value so the result survives a value
 * that ends in a newline, and so the vault it came from is known for reporting.
 *
 * The key is checked and passed after `--`, because a flag-shaped key would
 * otherwise be read as an option by the CLI rather than as the secret to fetch:
 * `secret get --config=/etc/passwd` really does load that file as config.
 * `.secenv` parsing already rejects such names, but this is the boundary where
 * it matters, and `getSecret` is exported for callers who never went through it.
 */
async function getSecret(key, options) {
    if (!SECRET_NAME_PATTERN.test(key)) {
        throw new DotsecenvError(`'${key}' is not a valid secret key`, {
            kind: "validation",
            hint: "Keys are NAME or namespace::NAME, using letters, digits and underscores.",
        });
    }
    const result = await run([...globalFlags(options), "secret", "get", "--json", "--", key], options);
    if (result.code !== 0) {
        throw failure(`could not read secret '${key}'`, result, options);
    }
    const payload = parseJson(result, `secret '${key}'`);
    if (typeof payload?.value !== "string") {
        throw new DotsecenvError(`dotsecenv returned no value for secret '${key}'`, { kind: "parse", stderr: result.stderr });
    }
    return {
        key,
        value: payload.value,
        vault: typeof payload.vault === "string" ? payload.vault : null,
        addedAt: typeof payload.added_at === "string" ? payload.added_at : null,
    };
}
/** Lists the secret keys reachable from `options.cwd`, without decrypting. */
async function listSecrets(options) {
    const result = await run([...globalFlags(options), "secret", "get", "--json"], options);
    if (result.code !== 0) {
        throw failure("could not list secrets", result, options);
    }
    const payload = parseJson(result, "the secret listing");
    if (!Array.isArray(payload)) {
        return [];
    }
    return payload
        .filter((entry) => entry && typeof entry.key === "string")
        .map((entry) => ({ key: entry.key, vault: String(entry.vault ?? "") }));
}
async function version(options) {
    const result = await run(["version"], options);
    if (result.code !== 0) {
        throw failure("could not read the dotsecenv version", result, options);
    }
    return result.stdout.trim();
}
function globalFlags(options) {
    // `-s` suppresses the CLI's advisory warnings, which would otherwise be
    // reported as if they were failures.
    const flags = ["-s"];
    if (options.config) {
        flags.push("-c", options.config);
    }
    for (const vault of options.vaults ?? []) {
        flags.push("-v", vault);
    }
    return flags;
}
function run(args, options) {
    const binary = dotsecenvBinary(options.binary);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
        // Never a shell, and arguments are passed as an array, so no part of a
        // secret name or path can be interpreted as syntax. The binary itself is
        // whatever the operator chose via --dotsecenv-bin or $DOTSECENV_BIN.
        const child = (0,external_node_child_process_namespaceObject.spawn)(binary, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            // stdin is inherited so a GPG passphrase prompt can reach the terminal;
            // stdout is piped so a decrypted value never leaks into our own output.
            stdio: ["inherit", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let killTimer;
        const stopTimers = () => {
            clearTimeout(timer);
            if (killTimer) {
                clearTimeout(killTimer);
            }
        };
        /** Settles once, and lets the process exit afterwards. */
        const settle = (finish) => {
            if (settled) {
                return;
            }
            settled = true;
            stopTimers();
            finish();
        };
        const abandon = () => {
            // Nothing else may keep mutex alive on this child's account.
            child.stdout?.destroy();
            child.stderr?.destroy();
            child.unref();
            settle(() => reject(new DotsecenvError(`'${binary}' timed out after ${timeoutMs / 1000}s`, {
                kind: "timeout",
                stderr,
                hint: "GPG may be waiting for a passphrase that cannot be entered here.",
            })));
        };
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            killTimer = setTimeout(() => {
                child.kill("SIGKILL");
                // Settling here rather than waiting for `close`: that event needs
                // every holder of the pipes to let go, and a grandchild outliving the
                // process we killed would keep it from ever firing.
                abandon();
            }, KILL_GRACE_MS);
            killTimer.unref();
        }, timeoutMs);
        timer.unref();
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            settle(() => {
                if (error.code === "ENOENT") {
                    reject(new DotsecenvError(`the '${binary}' CLI was not found`, {
                        kind: "not-installed",
                        cause: error,
                        hint: "Install it from https://dotsecenv.com, or point DOTSECENV_BIN at the binary.",
                    }));
                    return;
                }
                reject(new DotsecenvError(`could not run '${binary}'`, {
                    kind: "general",
                    cause: error,
                }));
            });
        });
        child.on("close", (code, signal) => {
            settle(() => resolve({ stdout, stderr, code: code ?? (signal ? 1 : 0) }));
        });
    });
}
function parseJson(result, subject) {
    try {
        return JSON.parse(result.stdout);
    }
    catch {
        // The SyntaxError is deliberately not attached as `cause`: Node quotes the
        // offending input in its message, and the input here is the decrypted
        // secret. Node prints `[cause]` for any uncaught rejection or console
        // dump, which would put the value straight into a log.
        throw new DotsecenvError(`could not parse the JSON dotsecenv returned for ${subject}`, { kind: "parse", stderr: result.stderr });
    }
}
function failure(message, result, options) {
    const kind = kindForExitCode(result.code);
    return new DotsecenvError(message, {
        kind,
        exitCode: result.code,
        stderr: result.stderr,
        hint: hintFor(kind, options),
    });
}
function hintFor(kind, options) {
    switch (kind) {
        case "vault":
            return `Checked from ${options.cwd}; run 'dotsecenv secret get' there to see which secrets are reachable.`;
        case "config":
            return "Check DOTSECENV_CONFIG, or ~/.config/dotsecenv/config, for the list of vault paths.";
        case "gpg":
            return "Confirm your GPG key is available and unlocked (gpg --list-secret-keys).";
        case "access-denied":
            return "The secret is not shared with your identity; ask a holder to run 'dotsecenv secret share'.";
        case "fingerprint":
            return "Run 'dotsecenv login' to register your GPG fingerprint.";
        default:
            return undefined;
    }
}
//# sourceMappingURL=cli.js.map
;// CONCATENATED MODULE: ./lib/dotsecenv/vault.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */



/**
 * A reader for dotsecenv vault files.
 *
 * The layout is a marker, a JSON header, a marker, then one JSON record per
 * line:
 *
 *   # === VAULT HEADER ===
 *   {"version":2,"identities":{...},"secrets":{"ns::KEY":{"secret":6,"values":[7,9]}}}
 *   # === VAULT DATA ===
 *   {"type":"identity","data":{...}}
 *   {"type":"secret","data":{...}}
 *   {"type":"value","secret":"ns::KEY","data":{...}}
 *
 * The header indexes records by 1-based line number, so which secrets a vault
 * holds - and who they are encrypted for - can be read without touching GPG.
 * Nothing here decrypts: values stay ciphertext, and `cli.ts` shells out to the
 * real dotsecenv binary for that.
 *
 * Only format v2 is read. Older vaults are rejected with a pointer at
 * `dotsecenv vault doctor` rather than parsed on a best-effort basis.
 */
const HEADER_MARKER = "# === VAULT HEADER ===";
const DATA_MARKER = "# === VAULT DATA ===";
/** The only vault format this client reads. */
const SUPPORTED_FORMAT_VERSION = 2;
const VAULT_DIRECTORY = ".dotsecenv";
const VAULT_FILENAME = "vault";
/** The conventional vault location for a directory holding a `.secenv`. */
function vaultPathFor(dir) {
    return external_node_path_namespaceObject.join(dir, VAULT_DIRECTORY, VAULT_FILENAME);
}
function parseVault(content, vaultPath) {
    const lines = content.split("\n");
    if (lines.length < 3) {
        throw new DotsecenvError(`${vaultPath} is not a vault file (truncated)`, {
            kind: "parse",
        });
    }
    const marker = lines[0].trim();
    if (marker !== HEADER_MARKER) {
        // Superseded vaults carry a versioned marker. Recognising it only to name
        // the version turns "this is not a vault" into something actionable.
        const legacy = /^# === VAULT HEADER v(\d+) ===$/.exec(marker);
        if (legacy) {
            throw unsupportedVersion(vaultPath, Number(legacy[1]));
        }
        throw new DotsecenvError(`${vaultPath} is not a vault file (unexpected header marker)`, { kind: "parse" });
    }
    let header;
    try {
        header = JSON.parse(lines[1]);
    }
    catch (cause) {
        throw new DotsecenvError(`could not parse the header of ${vaultPath}`, {
            kind: "parse",
            cause,
        });
    }
    if (header.version !== SUPPORTED_FORMAT_VERSION) {
        throw unsupportedVersion(vaultPath, header.version);
    }
    if (lines[2].trim() !== DATA_MARKER) {
        throw new DotsecenvError(`${vaultPath} is not a vault file (missing data marker)`, { kind: "parse" });
    }
    const secrets = new Map();
    for (const [key, index] of Object.entries(header.secrets ?? {})) {
        const valueLines = index?.values ?? [];
        // Values are appended, so the last one that parses is the current one -
        // the same rule the CLI applies when it decides what to decrypt.
        let latest = null;
        for (const lineNumber of valueLines) {
            const record = readRecord(lines, lineNumber);
            if (record?.type === "value") {
                latest = record;
            }
        }
        secrets.set(key, {
            key,
            availableTo: latest?.data?.available_to ?? [],
            deleted: latest?.data?.deleted === true,
            addedAt: latest?.data?.added_at ?? null,
            valueCount: valueLines.length,
        });
    }
    return {
        path: vaultPath,
        version: header.version,
        identities: Object.keys(header.identities ?? {}),
        secrets,
    };
}
/** Reads a vault, returning null when the file does not exist. */
async function readVault(vaultPath) {
    let content;
    try {
        content = await external_node_fs_namespaceObject.promises.readFile(vaultPath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw new DotsecenvError(`could not read ${vaultPath}`, {
            kind: "vault",
            cause: error,
        });
    }
    return parseVault(content, vaultPath);
}
function unsupportedVersion(vaultPath, version) {
    return new DotsecenvError(`${vaultPath} uses vault format v${version ?? "?"}; only v${SUPPORTED_FORMAT_VERSION} is supported`, {
        kind: "vault",
        hint: "Upgrade the vault with 'dotsecenv vault doctor'.",
    });
}
function readRecord(lines, lineNumber) {
    const raw = lines[lineNumber - 1];
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        // A record we cannot read is not worth failing over: the header index is
        // only used to explain failures, and the CLI remains the authority.
        return null;
    }
}
//# sourceMappingURL=vault.js.map
;// CONCATENATED MODULE: ./lib/dotsecenv/index.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */










async function loadSecenv(options = {}) {
    const log = options.log ?? new SilentLogger();
    const found = findSecenvFile(options.cwd);
    const files = found ? [found] : [];
    const issues = [];
    const winners = new Map();
    for (const file of files) {
        const parsed = await readSecenv(file);
        issues.push(...parsed.issues);
        // Two phases per file, matching the shell plugin: plain values first, so a
        // key defined both ways in one file resolves to its secret.
        for (const entry of parsed.entries.filter((e) => e.kind === "plain")) {
            winners.set(entry.key, entry);
        }
        for (const entry of parsed.entries.filter((e) => e.kind === "secret")) {
            winners.set(entry.key, entry);
        }
    }
    for (const issue of issues) {
        log.warning(`${issue.file}:${issue.line}: ${issue.message}`);
    }
    const wanted = options.only ? new Set(options.only) : null;
    const values = {};
    const resolved = new Map();
    const vaults = new VaultCache();
    const decrypted = new Map();
    for (const entry of winners.values()) {
        if (entry.kind === "plain") {
            values[entry.key] = entry.value;
            resolved.set(entry.key, {
                key: entry.key,
                value: entry.value,
                kind: "plain",
                file: entry.file,
            });
            continue;
        }
        if (wanted && !wanted.has(entry.key)) {
            continue;
        }
        const dir = external_node_path_namespaceObject.dirname(entry.file);
        const cacheKey = `${dir}\u0000${entry.value}`;
        let secret = decrypted.get(cacheKey);
        if (!secret) {
            secret = await fetchSecret(entry, dir, vaults, options, log);
            decrypted.set(cacheKey, secret);
        }
        values[entry.key] = secret.value;
        resolved.set(entry.key, {
            key: entry.key,
            value: secret.value,
            kind: "secret",
            file: entry.file,
            secret: entry.value,
            vault: secret.vault,
        });
    }
    return { files, values, resolved, issues };
}
/**
 * Resolves a single environment variable from the `.secenv` chain.
 *
 * Returns null when no `.secenv` defines it, so a caller can fall back to
 * whatever other source it prefers.
 */
async function resolveEnvValue(key, options = {}) {
    const loaded = await loadSecenv({ ...options, only: [key] });
    return loaded.resolved.get(key) ?? null;
}
async function fetchSecret(entry, dir, vaults, options, log) {
    // Read the neighbouring vault's header first. It cannot decrypt anything,
    // but it can rule out a fetch that is guaranteed to fail, and it explains
    // failures the CLI reports only as an exit code.
    const vault = await vaults.read(vaultPathFor(dir), log);
    const known = vault?.secrets.get(entry.value);
    if (known?.deleted) {
        throw new DotsecenvError(`${entry.key} cannot be resolved: secret '${entry.value}' was forgotten in ${vault?.path}`, {
            kind: "vault",
            hint: "Store it again with 'dotsecenv secret store', or drop the reference from the .secenv file.",
        });
    }
    try {
        const secret = await getSecret(entry.value, {
            // Run where the .secenv lives, so a config entry like `.dotsecenv/vault`
            // resolves to this project's vault rather than to one under the cwd.
            cwd: dir,
            binary: options.binary,
            config: options.config,
            timeoutMs: options.timeoutMs,
        });
        log.debug(`Resolved ${entry.key} from secret '${entry.value}' (${secret.vault ?? "unknown vault"}).`);
        return secret;
    }
    catch (error) {
        throw enrich(error, entry, vault, known?.availableTo);
    }
}
function enrich(error, entry, vault, availableTo) {
    if (!(error instanceof DotsecenvError)) {
        return error;
    }
    const context = `${entry.file}:${entry.line} maps ${entry.key} to secret '${entry.value}'`;
    if (error.kind === "access-denied" && availableTo?.length) {
        return new DotsecenvError(`${error.message} (${context})`, {
            kind: error.kind,
            exitCode: error.exitCode,
            stderr: error.stderr,
            cause: error,
            hint: `In ${vault?.path} it is readable by: ${availableTo.join(", ")}.`,
        });
    }
    if (error.kind === "vault" && vault && !vault.secrets.has(entry.value)) {
        const known = [...vault.secrets.keys()];
        return new DotsecenvError(`${error.message} (${context})`, {
            kind: error.kind,
            exitCode: error.exitCode,
            stderr: error.stderr,
            cause: error,
            hint: known.length
                ? `${vault.path} holds: ${known.join(", ")}.`
                : `${vault.path} holds no secrets.`,
        });
    }
    return new DotsecenvError(`${error.message} (${context})`, {
        kind: error.kind,
        exitCode: error.exitCode,
        stderr: error.stderr,
        hint: error.hint ?? undefined,
        cause: error,
    });
}
/** Reads each vault at most once, and never fails the load over a bad one. */
class VaultCache {
    cache = new Map();
    async read(vaultPath, log) {
        if (this.cache.has(vaultPath)) {
            return this.cache.get(vaultPath) ?? null;
        }
        let vault = null;
        try {
            vault = await readVault(vaultPath);
        }
        catch (error) {
            // Diagnostics only: the CLI still gets its chance to resolve the secret.
            log.debug(`Ignoring unreadable vault ${vaultPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.cache.set(vaultPath, vault);
        return vault;
    }
}
//# sourceMappingURL=index.js.map
;// CONCATENATED MODULE: ./lib/cli/config.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */




/**
 * Works out the PostgreSQL connection string, in order of precedence:
 *
 *   1. the environment (DATABASE_URL by default)
 *   2. ./.secenv, decrypted through the dotsecenv CLI
 *
 * The environment comes first, so a one-off override never has to fight with
 * whatever the project's `.secenv` says - and when it is set there is nothing
 * to resolve, so no vault is opened and no GPG prompt can appear for a value
 * that was already to hand.
 *
 * There is no flag. A connection string passed on the command line lands in
 * shell history, and in `ps` for every user on the machine to read for as long
 * as the process runs; an environment variable does neither.
 */
async function resolveConnectionString(options, log) {
    const fromEnvironment = process.env[options.envVar];
    if (fromEnvironment) {
        return {
            value: fromEnvironment,
            source: `the ${options.envVar} environment variable`,
        };
    }
    if (!options.useSecenv) {
        throw new ConfigurationError(`no connection string: ${options.envVar} is unset and --no-secenv was given`, `Export ${options.envVar}.`);
    }
    const file = findSecenvFile();
    if (!file) {
        throw new ConfigurationError(`no connection string: ${options.envVar} is unset and there is no .secenv here`, `Export ${options.envVar}, or run this from the directory whose .secenv defines it.`);
    }
    log.debug(`Reading ${file}`);
    let resolved;
    try {
        resolved = await resolveEnvValue(options.envVar, {
            binary: options.dotsecenvBin ?? undefined,
            config: options.dotsecenvConfig ?? undefined,
            log,
        });
    }
    catch (error) {
        if (error instanceof DotsecenvError) {
            throw new ConfigurationError(`could not resolve ${options.envVar} from .secenv:\n${error.describe()}`);
        }
        throw error;
    }
    if (!resolved) {
        throw new ConfigurationError(`no connection string: ${file} does not define ${options.envVar}`, `Add it there, or export ${options.envVar}.`);
    }
    const origin = resolved.kind === "secret"
        ? `${resolved.file} (secret '${resolved.secret}' in ${resolved.vault ?? "a configured vault"})`
        : resolved.file;
    return { value: resolved.value, source: origin };
}
//# sourceMappingURL=config.js.map
;// CONCATENATED MODULE: external "node:url"
const external_node_url_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:url");
;// CONCATENATED MODULE: ./lib/version.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */



/**
 * The version from the nearest package.json above this module.
 *
 * Walks up rather than using a fixed depth, because the same code ships from
 * four places at two different depths: `lib/main.js`, `lib/cli/main.js`,
 * `dist/main/index.js` and `dist/cli/index.js`. The ncc bundles also drop a
 * package.json of their own alongside them containing only `{"type":"module"}`,
 * so having a `version` field is what identifies the real one.
 *
 * Returns "unknown" rather than throwing: not knowing the version is never a
 * reason to fail an operation.
 */
function readPackageVersion() {
    let dir;
    try {
        dir = external_node_path_namespaceObject.dirname((0,external_node_url_namespaceObject.fileURLToPath)(import.meta.url));
    }
    catch {
        return "unknown";
    }
    for (let depth = 0; depth < 6; depth++) {
        try {
            const manifest = external_node_fs_namespaceObject.readFileSync(external_node_path_namespaceObject.join(dir, "package.json"), "utf8");
            const version = JSON.parse(manifest).version;
            if (typeof version === "string" && version.length > 0) {
                return version;
            }
        }
        catch {
            // No package.json here, or an unreadable one: keep walking up.
        }
        const parent = external_node_path_namespaceObject.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return "unknown";
}
//# sourceMappingURL=version.js.map
;// CONCATENATED MODULE: ./lib/cli/main.js
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */










async function main(argv) {
    let commandLine;
    try {
        commandLine = parseCommandLine(argv);
    }
    catch (error) {
        if (error instanceof UsageError) {
            process.stderr.write(`mutex: ${error.message}\n\nRun 'mutex help' for usage.\n`);
            return EXIT_USAGE;
        }
        throw error;
    }
    if (commandLine.command === "help") {
        process.stdout.write(helpText(commandLine.topic));
        return EXIT_OK;
    }
    if (commandLine.command === "version") {
        process.stdout.write(`${readPackageVersion()}\n`);
        return EXIT_OK;
    }
    const { options, identifier, program } = commandLine;
    const log = new ConsoleLogger(options.logLevel);
    // Querying commands put their data on stdout; acting commands report to
    // stderr, so `mutex lock` looks the same with or without a wrapped program
    // and never pollutes a pipeline. A wrapped program owns stdout outright.
    const wrapping = program.length > 0;
    const queries = ["status", "list", "prune"];
    const out = new Output(!wrapping && queries.includes(commandLine.command)
        ? process.stdout
        : process.stderr, wrapping ? process.stderr : process.stdout, options.json, options.logLevel === "error");
    let mutex;
    try {
        const connection = await resolveConnectionString(options, log);
        log.debug(`Using the connection string from ${connection.source}.`);
        mutex = new DatabaseMutex({
            dbConnectionString: connection.value,
            expiration: options.expiration,
        }, log);
        const context = { mutex, options, log, out };
        switch (commandLine.command) {
            case "lock":
            case "try-lock":
                return await commandLock(context, identifier, program, commandLine.command);
            case "unlock":
                return await commandUnlock(context, identifier);
            case "renew":
                return await commandRenew(context, identifier);
            case "status":
                return await commandStatus(context, identifier);
            case "list":
                return await commandList(context);
            case "prune":
                return await commandPrune(context);
            default:
                throw new UsageError(`unknown command '${commandLine.command}'`);
        }
    }
    catch (error) {
        if (error instanceof UsageError) {
            process.stderr.write(`mutex: ${error.message}\n\nRun 'mutex help' for usage.\n`);
            return EXIT_USAGE;
        }
        if (error instanceof ConfigurationError) {
            log.error(error.hint ? `${error.message}\n  hint: ${error.hint}` : error.message);
            return EXIT_CONFIGURATION;
        }
        if (error instanceof DotsecenvError) {
            log.error(error.describe());
            return EXIT_CONFIGURATION;
        }
        logError(log, error, null);
        return EXIT_ERROR;
    }
    finally {
        // Postgres keeps sockets open; without this the process lingers.
        await mutex?.close();
    }
}
main(process.argv.slice(2))
    .then((code) => {
    // Set the code rather than calling exit(), so buffered output still drains.
    process.exitCode = code;
})
    .catch((error) => {
    process.stderr.write(`mutex: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT_ERROR;
});
//# sourceMappingURL=main.js.map
var __webpack_exports__main = __webpack_exports__.i;
export { __webpack_exports__main as main };
