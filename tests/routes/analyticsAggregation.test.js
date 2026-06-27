/**
 * Endpoint tests for the two new analytics routes added in Issue #26:
 *   GET /api/v1/analytics/enrollment-trends
 *   GET /api/v1/analytics/completion-rates
 *
 * The strategy here is to spy on the static methods of `AnalyticsService`
 * directly. This sidesteps the global `tests/setup.js` cache warm-up (which
 * loads the entire app and would otherwise pin the real AnalyticsService
 * module before `jest.mock` could intercept it).
 */

const request = require('supertest');
const express = require('express');

const {
  AnalyticsService,
} = require('../../src/services/analyticsService');

const analyticsRouter = require('../../src/routes/analytics');

function buildApp() {
  const app = express();
  app.use('/api/v1/analytics', analyticsRouter);
  return app;
}

describe('Analytics Aggregation Routes — Issue #26', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /enrollment-trends', () => {
    test('returns 200 with aggregation result (PII-safe)', async () => {
      jest.spyOn(AnalyticsService, 'getEnrollmentTrends').mockResolvedValueOnce({
        granularity: 'day',
        points: [
          { bucket: '2026-06-01', courseId: null, enrollments: 7 },
          { bucket: '2026-06-02', courseId: null, enrollments: 12 },
        ],
      });

      const res = await request(buildApp())
        .get('/api/v1/analytics/enrollment-trends?granularity=day')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.granularity).toBe('day');
      expect(res.body.data.points).toHaveLength(2);

      // PII safety: no source_account / ip / userId leaks anywhere in the response.
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/source_account/);
      expect(json).not.toMatch(/userId/);
      expect(json).not.toMatch(/"ip"/);
    });

    test('forwards courseId query param when present', async () => {
      const spy = jest
        .spyOn(AnalyticsService, 'getEnrollmentTrends')
        .mockResolvedValueOnce({
          granularity: 'week',
          points: [{ bucket: '2026-06-01', courseId: 'C-101', enrollments: 4 }],
        });

      await request(buildApp())
        .get('/api/v1/analytics/enrollment-trends?courseId=C-101&granularity=week')
        .expect(200);

      expect(spy).toHaveBeenCalledTimes(1);
      const args = spy.mock.calls[0][0];
      expect(args.courseId).toBe('C-101');
      expect(args.granularity).toBe('week');
    });

    test('falls back to default granularity for unsupported values', async () => {
      const spy = jest
        .spyOn(AnalyticsService, 'getEnrollmentTrends')
        .mockResolvedValueOnce({ granularity: 'day', points: [] });

      await request(buildApp())
        .get('/api/v1/analytics/enrollment-trends?granularity=fortnight')
        .expect(200);

      expect(spy).toHaveBeenCalledTimes(1);
      const args = spy.mock.calls[0][0];
      expect(args.granularity).toBe('day');
    });

    test('returns 500 when the service throws', async () => {
      jest
        .spyOn(AnalyticsService, 'getEnrollmentTrends')
        .mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp())
        .get('/api/v1/analytics/enrollment-trends')
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /completion-rates', () => {
    test('returns overall completion rate for a given course (PII-safe)', async () => {
      jest.spyOn(AnalyticsService, 'getCompletionRates').mockResolvedValueOnce({
        totalEnrollments: 10,
        completedCount: 7,
        completionRate: 70,
      });

      const res = await request(buildApp())
        .get('/api/v1/analytics/completion-rates?courseId=C-101')
        .expect(200);

      expect(res.body.data.completionRate).toBe(70);
      expect(JSON.stringify(res.body)).not.toMatch(/source_account/);
    });

    test('returns per-course breakdown when courseId is omitted', async () => {
      jest.spyOn(AnalyticsService, 'getCompletionRates').mockResolvedValueOnce({
        totalEnrollments: 30,
        completedCount: 18,
        completionRate: 60,
        byCourse: [
          { courseId: 'C-101', totalEnrollments: 20, completedCount: 12, completionRate: 60 },
          { courseId: 'C-102', totalEnrollments: 10, completedCount: 6, completionRate: 60 },
        ],
      });

      const res = await request(buildApp())
        .get('/api/v1/analytics/completion-rates')
        .expect(200);

      expect(res.body.data.byCourse).toHaveLength(2);
    });

    test('returns 500 when the service throws', async () => {
      jest
        .spyOn(AnalyticsService, 'getCompletionRates')
        .mockRejectedValueOnce(new Error('boom'));

      const res = await request(buildApp())
        .get('/api/v1/analytics/completion-rates?courseId=C-101')
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });
});
