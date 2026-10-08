/**
 * Public Stats API Tests (issue #1)
 *
 * Covers the GET /api/v1/public/stats endpoint and its backing service:
 * - returns aggregate counts (learners, credentials issued, courses published)
 * - exposes no PII and no unexpected fields
 * - is cached (Redis cache-aside) and sets a Cache-Control header
 * - degrades gracefully to zeros when the telemetry table is unavailable
 *
 * Modules are isolated per-test so the mocked database/redis layers are the
 * ones the freshly-required service uses (the global test setup eagerly loads
 * the full app, which would otherwise capture the real implementations).
 */

// Dynamic require() is used intentionally below to re-import modules after
// jest.resetModules(), so the mocked database/redis layers reach the service.
/* eslint-disable @typescript-eslint/no-var-requires */
import express, { Express } from 'express';
import request from 'supertest';

jest.mock('../utils/database', () => ({ safeQuery: jest.fn() }));
jest.mock('../utils/redis', () => ({ getRedisClient: jest.fn() }));

describe('Public Stats API (#1)', () => {
  let safeQuery: jest.Mock;
  let getRedisClient: jest.Mock;
  let publicRouter: express.Router;
  let service: typeof import('../services/publicStatsService');

  const wireCounts = (learners: number, creds: number, courses: number) => {
    safeQuery.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('DISTINCT source_account')) return { rows: [{ count: learners }] };
      if (params && params[0] === 'credential_issuance') return { rows: [{ count: creds }] };
      if (params && params[0] === 'course_created') return { rows: [{ count: courses }] };
      return { rows: [{ count: 0 }] };
    });
  };

  const buildApp = (): Express => {
    const app = express();
    app.use('/api/v1/public', publicRouter);
    return app;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../utils/database', () => ({ safeQuery: jest.fn() }));
    jest.mock('../utils/redis', () => ({ getRedisClient: jest.fn() }));

    safeQuery = require('../utils/database').safeQuery as jest.Mock;
    getRedisClient = require('../utils/redis').getRedisClient as jest.Mock;
    service = require('../services/publicStatsService');
    publicRouter = require('../routes/public').default;
  });

  describe('GET /api/v1/public/stats', () => {
    it('returns aggregate counts as JSON', async () => {
      getRedisClient.mockReturnValue(null); // no cache layer for this test
      wireCounts(1234, 567, 89);

      const response = await request(buildApp()).get('/api/v1/public/stats');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        learners: 1234,
        credentialsIssued: 567,
        coursesPublished: 89,
      });
      expect(response.body).toHaveProperty('generatedAt');
    });

    it('exposes only the expected non-PII fields', async () => {
      getRedisClient.mockReturnValue(null);
      wireCounts(10, 20, 30);

      const response = await request(buildApp()).get('/api/v1/public/stats');

      expect(Object.keys(response.body).sort()).toEqual([
        'coursesPublished',
        'credentialsIssued',
        'generatedAt',
        'learners',
      ]);
    });

    it('sets a Cache-Control header for shared caches', async () => {
      getRedisClient.mockReturnValue(null);
      wireCounts(1, 2, 3);

      const response = await request(buildApp()).get('/api/v1/public/stats');

      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toContain('max-age=');
    });

    it('degrades to zeros when the telemetry table is unavailable', async () => {
      getRedisClient.mockReturnValue(null);
      safeQuery.mockResolvedValue(null); // safeQuery returns null for a missing table

      const response = await request(buildApp()).get('/api/v1/public/stats');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        learners: 0,
        credentialsIssued: 0,
        coursesPublished: 0,
      });
    });

    it('returns 500 if the stats computation throws', async () => {
      getRedisClient.mockReturnValue(null);
      safeQuery.mockRejectedValue(new Error('unexpected db failure'));

      const response = await request(buildApp()).get('/api/v1/public/stats');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('service caching (cache-aside)', () => {
    it('computes once, then serves subsequent calls from the Redis cache', async () => {
      const store = new Map<string, string>();
      const fakeClient = {
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        set: jest.fn(async (...args: any[]) => {
          store.set(args[0], args[1]);
          return 'OK';
        }),
      };
      getRedisClient.mockReturnValue(fakeClient);
      wireCounts(500, 42, 7);

      const first = await service.getPublicStats();
      const second = await service.getPublicStats();

      expect(first).toEqual(second);
      expect(first).toMatchObject({ learners: 500, credentialsIssued: 42, coursesPublished: 7 });
      // Three COUNT queries for the first (uncached) call only.
      expect(safeQuery).toHaveBeenCalledTimes(3);
      // Written to cache exactly once, with a TTL.
      expect(fakeClient.set).toHaveBeenCalledTimes(1);
      expect(fakeClient.set.mock.calls[0][2]).toHaveProperty('EX');
    });

    it('recomputes when Redis is unavailable (no cache)', async () => {
      getRedisClient.mockReturnValue(null);
      wireCounts(1, 1, 1);

      await service.getPublicStats();
      await service.getPublicStats();

      // No cache, so both calls hit the database: 3 queries x 2 calls.
      expect(safeQuery).toHaveBeenCalledTimes(6);
    });
  });
});
