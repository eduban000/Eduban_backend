/**
 * Unit tests for the new aggregation methods on DataAggregationService
 * (Issue #26 — "Real course analytics with database aggregation pipeline").
 *
 * These tests use `jest.spyOn` on the actual exports of `../src/utils/database`
 * so they work correctly even though `tests/setup.js` warms the module
 * cache by requiring `src/index` at the top of the suite.
 */

const database = require('../src/utils/database');
const { DataAggregationService } = require('../src/services/dataAggregation');

describe('DataAggregationService — Issue #26 aggregations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getEnrollmentTrends', () => {
    test('returns bucketed enrollment counts without any PII', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({
        rows: [
          { bucket: new Date('2026-06-01T00:00:00Z'), enrollments: 7 },
          { bucket: new Date('2026-06-02T00:00:00Z'), enrollments: 12 },
        ],
      });

      const result = await DataAggregationService.getEnrollmentTrends({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-03'),
        granularity: 'day',
      });

      expect(result.granularity).toBe('day');
      expect(result.points).toEqual([
        { bucket: '2026-06-01', courseId: null, enrollments: 7 },
        { bucket: '2026-06-02', courseId: null, enrollments: 12 },
      ]);

      // PII safety: the result must never expose per-user or per-account ids.
      const json = JSON.stringify(result);
      expect(json).not.toMatch(/source_account/);
      expect(json).not.toMatch(/userId/);
    });

    test('preserves courseId when filtered to a single course', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({
        rows: [
          { bucket: new Date('2026-06-01T00:00:00Z'), course_id: 'C-101', enrollments: 5 },
        ],
      });

      const result = await DataAggregationService.getEnrollmentTrends({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        granularity: 'day',
        courseId: 'C-101',
      });

      expect(result.points).toHaveLength(1);
      expect(result.points[0].courseId).toBe('C-101');
      expect(result.points[0].enrollments).toBe(5);
    });

    test('passes the correct granularity + date params into the SQL', async () => {
      const spy = jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({ rows: [] });

      await DataAggregationService.getEnrollmentTrends({
        startDate: new Date('2026-06-01T00:00:00Z'),
        endDate: new Date('2026-06-30T00:00:00Z'),
        granularity: 'week',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const sql = spy.mock.calls[0][0];
      expect(sql).toMatch(/DATE_TRUNC\(\$1/);
      const params = spy.mock.calls[0][1];
      expect(params[0]).toBe('week');
      expect(params[1]).toBe('2026-06-01T00:00:00.000Z');
      expect(params[2]).toBe('2026-06-30T00:00:00.000Z');
    });

    test('rejects unsupported granularity values', async () => {
      await expect(
        DataAggregationService.getEnrollmentTrends({
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-06-02'),
          granularity: 'fortnight',
        })
      ).rejects.toThrow(/Invalid granularity/);
    });

    test('returns empty result when safeQuery returns null (table missing)', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce(null);

      const result = await DataAggregationService.getEnrollmentTrends({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        granularity: 'day',
      });

      expect(result).toEqual({ granularity: 'day', points: [] });
    });
  });

  describe('getCompletionRates', () => {
    test('computes overall + per-course completion rates without PII', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({
        rows: [
          { course_id: 'C-101', total_enrollments: 20, completed_count: 12 },
          { course_id: 'C-102', total_enrollments: 5, completed_count: 1 },
        ],
      });

      const result = await DataAggregationService.getCompletionRates({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(result.totalEnrollments).toBe(25);
      expect(result.completedCount).toBe(13);
      expect(result.completionRate).toBe(52);
      expect(result.byCourse).toHaveLength(2);

      const json = JSON.stringify(result);
      expect(json).not.toMatch(/source_account/);
      expect(json).not.toMatch(/ip/);
    });

    test('returns zero rate when no enrollments exist (no division by zero)', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({ rows: [] });

      const result = await DataAggregationService.getCompletionRates({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(result.totalEnrollments).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.byCourse).toEqual([]);
    });

    test('returns only overall rate (no byCourse) when courseId is provided', async () => {
      jest.spyOn(database, 'safeQuery').mockResolvedValueOnce({
        rows: [{ total_enrollments: 10, completed_count: 7 }],
      });

      const result = await DataAggregationService.getCompletionRates({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        courseId: 'C-101',
      });

      expect(result.totalEnrollments).toBe(10);
      expect(result.completedCount).toBe(7);
      expect(result.completionRate).toBe(70);
      expect(result.byCourse).toBeUndefined();
    });

    test('gracefully degrades if the SQL query throws', async () => {
      jest
        .spyOn(database, 'safeQuery')
        .mockRejectedValueOnce(new Error('connection terminated'));

      const result = await DataAggregationService.getCompletionRates({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(result.totalEnrollments).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.completionRate).toBe(0);
    });
  });

  describe('getStudentPerformanceMetrics', () => {
    test('returns anonymized aggregates only (no per-user fields)', async () => {
      jest.spyOn(database, 'safeQuery')
        .mockResolvedValueOnce({ rows: [{ total_events: 150, active_users: 25 }] })
        .mockResolvedValueOnce({ rows: [{ avg_days: 12.5, samples: 8 }] });

      const result = await DataAggregationService.getStudentPerformanceMetrics({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(result.activeUsers).toBe(25);
      expect(result.averageEventsPerUser).toBe(6);
      expect(result.courseCompletionAverageDays).toBe(12.5);
      expect(result.period.start).toBeDefined();
      expect(result.period.end).toBeDefined();

      expect(result).not.toHaveProperty('users');
      expect(result).not.toHaveProperty('userIds');
      const json = JSON.stringify(result);
      expect(json).not.toMatch(/source_account/);
    });

    test('reports null courseCompletionAverageDays when no enrollment/completion pairs exist', async () => {
      jest.spyOn(database, 'safeQuery')
        .mockResolvedValueOnce({ rows: [{ total_events: 0, active_users: 0 }] })
        .mockResolvedValueOnce({ rows: [{ avg_days: null, samples: 0 }] });

      const result = await DataAggregationService.getStudentPerformanceMetrics({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(result.averageEventsPerUser).toBe(0);
      expect(result.courseCompletionAverageDays).toBeNull();
    });
  });
});
