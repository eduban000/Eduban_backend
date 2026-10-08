/**
 * /api/health endpoint tests (issue #4)
 *
 * The comprehensive health router is served at the documented public path
 * /api/health (in addition to /health). These tests mount that router on a
 * bare Express app (fast, isolated — no full-app boot) and verify the
 * liveness/readiness split, dependency reporting, and unauthenticated access.
 *
 * Kept in its own file (the broader health.test.ts is quarantined for
 * env-dependent assertions — see the quarantine tracking issue) so the
 * /api/health feature retains running coverage.
 */

import express, { Express } from 'express';
import request from 'supertest';

jest.mock('../utils/database');
jest.mock('../config/redis', () => ({
  checkRedisConnectivity: jest.fn(),
}));
jest.mock('axios');
jest.mock('../services/search/ElasticsearchService', () => ({
  default: { client: { ping: jest.fn() } },
}));

import * as database from '../utils/database';
const axios = require('axios');
const { checkRedisConnectivity } = require('../config/redis');
const healthRouter = require('../routes/health').default || require('../routes/health');

const buildApp = (): Express => {
  const app = express();
  app.use('/api/health', healthRouter);
  return app;
};

describe('Public health path: /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('liveness probe responds at /api/health/live without checking dependencies', async () => {
    const response = await request(buildApp()).get('/api/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(checkRedisConnectivity).not.toHaveBeenCalled();
  });

  it('readiness probe returns 503 at /api/health/ready when a dependency is unhealthy', async () => {
    (database.checkDatabaseConnectivity as jest.Mock).mockResolvedValue({
      status: 'unhealthy',
      latencyMs: 2000,
      error: 'Connection refused',
    });
    checkRedisConnectivity.mockResolvedValue({ status: 'healthy', latencyMs: 3 });
    axios.get.mockResolvedValue({ data: {} });

    const response = await request(buildApp()).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('status', 'not_ready');
    // Readiness must not leak detailed error text to load balancers
    expect(response.body.dependencies.postgres).not.toHaveProperty('error');
  });

  it('comprehensive check at /api/health reports DB, Redis, and Stellar status', async () => {
    (database.checkDatabaseConnectivity as jest.Mock).mockResolvedValue({
      status: 'healthy',
      latencyMs: 5,
    });
    checkRedisConnectivity.mockResolvedValue({ status: 'healthy', latencyMs: 3 });
    axios.get.mockResolvedValue({ data: {} });

    const response = await request(buildApp()).get('/api/health');

    // Always 200; must report DB, Redis, and Stellar Horizon status individually.
    expect(response.status).toBe(200);
    const validStatuses = ['healthy', 'unhealthy'];
    for (const dep of ['postgres', 'redis', 'stellar']) {
      expect(response.body.dependencies).toHaveProperty(dep);
      expect(validStatuses).toContain(response.body.dependencies[dep].status);
    }
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('uptime');
    expect(['healthy', 'degraded']).toContain(response.body.status);
  });

  it('comprehensive check at /api/health does not require authentication', async () => {
    (database.checkDatabaseConnectivity as jest.Mock).mockResolvedValue({
      status: 'healthy',
      latencyMs: 5,
    });
    checkRedisConnectivity.mockResolvedValue({ status: 'healthy', latencyMs: 3 });
    axios.get.mockResolvedValue({ data: {} });

    // No Authorization header
    const response = await request(buildApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('dependencies');
  });
});
