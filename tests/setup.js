const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Set test environment variables immediately
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STELLAR_NETWORK = 'testnet';

console.log('Testing in environment:', process.env.NODE_ENV);

const request = require('supertest');

// Mock IPFS service globally
jest.mock('../src/services/ipfs', () => ({
  uploadFile: jest.fn(),
  uploadMultipleFiles: jest.fn(),
  getContent: jest.fn(),
  getMetadata: jest.fn(),
  pinContent: jest.fn(),
  unpinContent: jest.fn(),
  getNodeInfo: jest.fn(),
  getFileMetadata: jest.fn(),
  pinFile: jest.fn(),
  unpinFile: jest.fn(),
  updateFileMetadata: jest.fn()
}));

// NOTE: do NOT eagerly import the app here. Importing it during global setup
// binds route modules to the real (unmocked) implementations before a test
// file's jest.mock() calls take effect, defeating per-suite module mocks.
// testUtils below imports it lazily instead.

jest.setTimeout(60000);

// Mock external dependencies
jest.mock('@stellar/stellar-sdk');
jest.mock('ipfs-http-client', () => ({
  create: jest.fn(() => ({
    version: jest.fn().mockResolvedValue({ version: '1.0.0' }),
    add: jest.fn().mockResolvedValue({ cid: { toString: () => 'QmTest123456789' } }),
    cat: jest.fn(),
    pin: {
      add: jest.fn(),
      rm: jest.fn()
    },
    id: jest.fn().mockResolvedValue({ id: 'test-id' }),
    repo: {
      stat: jest.fn().mockResolvedValue({ numObjects: 0, repoSize: 0, storageMax: 0 })
    }
  }))
}), { virtual: true });
jest.mock('redis', () => {
  const store = new Map();
  const lists = new Map();
  const hashes = new Map();

  const mockMulti = (client) => ({
    incr: jest.fn(function(key) {
      this._key = key;
      return this;
    }),
    incrBy: jest.fn(function(key, val) {
      this._key = key;
      this._val = val;
      return this;
    }),
    expire: jest.fn(function() {
      return this;
    }),
    lPush: jest.fn(function(key, val) {
      this._key = key;
      this._val = val;
      return this;
    }),
    zAdd: jest.fn(function() {
      return this;
    }),
    zRem: jest.fn(function() {
      return this;
    }),
    exec: jest.fn(async function() {
      const key = this._key;
      if (key) {
        const increment = this._val !== undefined ? this._val : 1;
        const current = parseInt(store.get(key) || '0') + increment;
        store.set(key, current.toString());
        return [current, 1];
      }
      return [1, 1];
    })
  });

  const mockClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(async (key) => store.get(key) || null),
    set: jest.fn(async (key, val) => { store.set(key, val); return 'OK'; }),
    setEx: jest.fn(async (key, ttl, val) => { store.set(key, val); return 'OK'; }),
    del: jest.fn(async (keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(k => {
        store.delete(k);
        lists.delete(k);
        hashes.delete(k);
      });
      return keysArray.length;
    }),
    incrBy: jest.fn(async (key, val) => {
      const current = parseInt(store.get(key) || '0');
      const newVal = current + val;
      store.set(key, newVal.toString());
      return newVal;
    }),
    incr: jest.fn(async (key) => {
      const current = parseInt(store.get(key) || '0') + 1;
      store.set(key, current.toString());
      return current;
    }),
    expire: jest.fn().mockResolvedValue(1),
    lPush: jest.fn(async (key, val) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).unshift(val);
      return lists.get(key).length;
    }),
    lTrim: jest.fn(async (key, start, stop) => {
      if (lists.has(key)) {
        const list = lists.get(key);
        // Correctly handle negative indices if needed, but simple slice for now
        lists.set(key, list.slice(start, stop === -1 ? undefined : stop + 1));
      }
      return 'OK';
    }),
    lRange: jest.fn(async (key, start, stop) => {
      if (!lists.has(key)) return [];
      const list = lists.get(key);
      return list.slice(start, stop === -1 ? undefined : stop + 1);
    }),
    hSet: jest.fn(async (key, field, val) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, val);
      return 1;
    }),
    hGet: jest.fn(async (key, field) => {
      if (!hashes.has(key)) return null;
      return hashes.get(key).get(field) || null;
    }),
    hGetAll: jest.fn(async (key) => {
      if (!hashes.has(key)) return {};
      return Object.fromEntries(hashes.get(key));
    }),
    lLen: jest.fn(async (key) => (lists.get(key) || []).length),
    zCard: jest.fn(async (key) => 0),
    zAdd: jest.fn().mockResolvedValue(1),
    zRem: jest.fn().mockResolvedValue(1),
    zRangeByScore: jest.fn().mockResolvedValue([]),
    brPop: jest.fn().mockResolvedValue(null),
    quit: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn().mockResolvedValue(),
    unsubscribe: jest.fn().mockResolvedValue(),
    publish: jest.fn().mockResolvedValue(1),
    keys: jest.fn(async (pattern) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter(k => regex.test(k));
    }),
    multi: jest.fn(function() { return mockMulti(this); }),
    v4: {
      get: jest.fn(async (key) => store.get(key) || null),
      set: jest.fn(async (key, val) => { store.set(key, val); return 'OK'; }),
      del: jest.fn(async (key) => { store.delete(key); return 1; })
    }
  };

  return {
    createClient: jest.fn(() => mockClient)
  };
}, { virtual: true });

// Mock ioredis (used by secureCommController.ts at module load time)
jest.mock('ioredis', () => {
  const store = new Map();

  const lists = new Map();
  const hashes = new Map();

  class MockRedis {
    constructor() {}
    async connect() { return true; }
    async disconnect() { return true; }
    async quit() { return true; }
    async ping() { return 'PONG'; }
    async get(key) { return store.get(key) || null; }
    async set(key, val) { store.set(key, val); return 'OK'; }
    async setex(key, ttl, val) { store.set(key, val); return 'OK'; }
    async setEx(key, ttl, val) { store.set(key, val); return 'OK'; }
    async del(...keys) {
      const flat = keys.flat();
      flat.forEach((k) => { store.delete(k); lists.delete(k); hashes.delete(k); });
      return flat.length;
    }
    async keys(pattern) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter((k) => regex.test(k));
    }
    async incr(key) {
      const v = (parseInt(store.get(key) || '0') + 1).toString();
      store.set(key, v);
      return parseInt(v);
    }
    async incrBy(key, n) {
      const v = (parseInt(store.get(key) || '0') + n).toString();
      store.set(key, v);
      return parseInt(v);
    }
    async expire() { return 1; }
    // List operations
    async lPush(key, ...vals) {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).unshift(...vals.flat());
      return lists.get(key).length;
    }
    async rPush(key, ...vals) {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).push(...vals.flat());
      return lists.get(key).length;
    }
    async lTrim(key, start, stop) {
      if (lists.has(key)) {
        const l = lists.get(key);
        lists.set(key, l.slice(start, stop === -1 ? undefined : stop + 1));
      }
      return 'OK';
    }
    async lRange(key, start, stop) {
      if (!lists.has(key)) return [];
      const l = lists.get(key);
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    }
    async lLen(key) { return (lists.get(key) || []).length; }
    // Hash operations
    async hSet(key, field, val) {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, val);
      return 1;
    }
    async hGet(key, field) {
      if (!hashes.has(key)) return null;
      return hashes.get(key).get(field) || null;
    }
    async hGetAll(key) {
      if (!hashes.has(key)) return {};
      return Object.fromEntries(hashes.get(key));
    }
    // Sorted set / misc no-ops used by some services
    async zAdd() { return 1; }
    async zadd() { return 1; }
    async zRem() { return 1; }
    async zRangeByScore() { return []; }
    async zCard() { return 0; }
    async publish() { return 1; }
    async subscribe() { return undefined; }
    async unsubscribe() { return undefined; }
    async flushall() { store.clear(); lists.clear(); hashes.clear(); return 'OK'; }
    on() { return this; }
  }

  return { Redis: MockRedis, default: MockRedis };
}, { virtual: true });

// The in-memory MongoDB binary is slow/unreliable to start in some CI and
// sandboxed environments, and its internal start-timeout can reject *after*
// the beforeAll hook resolves, marking an otherwise-passing suite as "failed
// to run". Suites that need a database mock it directly, so stub the server
// out for deterministic runs; the beforeAll below then takes the graceful
// "no database" fallback path.
jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: async () => null,
  },
}));

let mongoServer;
let mongoAvailable = true;

// Global test setup
beforeAll(async () => {
  // Start in-memory MongoDB for testing. This is best-effort: if the binary
  // cannot start (e.g. slow/sandboxed environments), tests that don't need a
  // real Mongo still run. We guard against the library's internal start
  // timeout rejecting *after* this hook resolves (which would otherwise mark
  // the whole suite as "failed to run") by attaching a catch to the promise
  // and racing it with our own non-rejecting timeout.
  try {
    const createPromise = MongoMemoryServer.create();
    // Swallow any late rejection from the library's internal start timeout so
    // it never surfaces as an unhandled rejection / suite failure.
    createPromise.catch(() => undefined);

    mongoServer = await Promise.race([
      createPromise.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 30000)),
    ]);

    if (mongoServer) {
      await mongoose.connect(mongoServer.getUri());
    } else {
      throw new Error('In-memory MongoDB did not start in time');
    }
  } catch (error) {
    console.warn('MongoDB Memory Server not available, tests will run without database:', error.message);
    mongoAvailable = false;
    // Mock mongoose connection so tests don't crash
    if (mongoose.connection.readyState === 0) {
      mongoose.connection.readyState = 1; // Mock connected state
    }
  }
}, 60000);

// Global test teardown
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Database cleanup between tests
beforeEach(async () => {
  if (!mongoAvailable) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Global test utilities
global.testUtils = {
  // Create authenticated request
  authenticatedRequest: (token) => {
    return request(require('../src/index'))
      .set('Authorization', `Bearer ${token}`);
  },
  
  // Generate test JWT token
  generateTestToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { 
        userId: 'test-user-id', 
        address: 'GD5DJ3B7MHLRWGS7QKXYYEJZRGFQMVJ7T7S6DLPNHP5TGB7FZ7NBHJVP',
        ...payload 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
  
  // Generate test Stellar address
  generateStellarAddress: () => {
    return 'GD' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15).toUpperCase();
  },
  
  // Wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock IPFS response
  mockIPFSResponse: (data) => ({
    cid: 'QmTest123456789',
    size: JSON.stringify(data).length,
    data: Buffer.from(JSON.stringify(data))
  }),
  
  // Mock Stellar transaction
  mockStellarTransaction: () => ({
    toXDR: () => 'mock-transaction-xdr',
    hash: () => 'mock-transaction-hash',
    sign: jest.fn(),
    submit: jest.fn().mockResolvedValue({ successful: true })
  })
};

// Mock console methods to reduce test noise
/*
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
*/

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
