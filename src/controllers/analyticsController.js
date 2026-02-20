/**
 * Analytics Controller
 *
 * Routes analytics requests through the registered `AnalyticsService` so that
 * the real aggregation pipeline (Issue #26) is exercised consistently across
 * endpoints. Only the legacy `/export` raw-dump endpoint keeps its own pg
 * Pool (intentionally separate from the analytics aggregation pool) and that
 * pool is now lazily initialized so nothing is allocated at module load.
 */

const { Pool } = require('pg');

const { AnalyticsService } = require('../services/analyticsService');
const logger = require('../utils/logger');

// Lazily initialized: only the legacy `/export` endpoint needs a dedicated
// connection budget separate from the analytics aggregation pool, so we defer
// pool creation until the handler is actually invoked.
let exportPool = null;
function getExportPool() {
  if (!exportPool) {
    exportPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/starked',
    });
  }
  return exportPool;
}

/**
 * GET /api/v1/analytics/overview
 * Aggregated platform stats — delegates to AnalyticsService so caching and
 * graceful null fallback behavior are consistent with the rest of the analytics
 * API.
 */
const getOverviewStats = async (req, res) => {
  try {
    const stats = await AnalyticsService.getAdminDashboardStats();
    res.json({
      success: true,
      data: stats,
      message: 'Platform overview fetched successfully',
    });
  } catch (error) {
    logger.error('Error fetching overview stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics data' });
  }
};

/**
 * GET /api/v1/analytics/report
 * Paginated, filtered system activity report (delegates to
 * AnalyticsService.getSystemLogs).
 */
const getDetailedReport = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50, level = 'all' } = req.query;
    const data = await AnalyticsService.getSystemLogs({
      level,
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      startDate,
      endDate,
    });
    res.json({
      success: true,
      data: stripPII(data),
      message: 'Report fetched successfully',
    });
  } catch (error) {
    logger.error('Error fetching report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

/**
 * Recursively redact PII fields from a response payload. Issue #26 DoD forbids
 * exposing user identifiers (userId, source_account, source, ip) inside any
 * analytics response — including legacy endpoints we did not change.
 */
const stripPII = (value) => {
  const blockedKeys = new Set(['userId', 'source_account', 'source', 'ip', 'owner']);
  if (Array.isArray(value)) {
    return value.map(stripPII);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (blockedKeys.has(k)) {
        out[k] = null;
      } else {
        out[k] = stripPII(v);
      }
    }
    return out;
  }
  return value;
};

/**
 * GET /api/v1/analytics/enrollment-trends
 * Issue #26 — real aggregation pipeline. Returns bucketed enrollment counts
 * (day/week/month) within an optional date window and optional course filter.
 * PII-safe: only counts and bucketed dates are returned.
 *
 * Query params:
 *   startDate?   ISO date (defaults to 30 days before endDate)
 *   endDate?     ISO date (defaults to now)
 *   granularity? 'day' | 'week' | 'month' (defaults to 'day')
 *   courseId?    string (optional)
 */
const getEnrollmentTrends = async (req, res) => {
  try {
    const { startDate, endDate, granularity = 'day', courseId } = req.query;
    const validGranularities = ['day', 'week', 'month'];
    const safeGranularity = validGranularities.includes(granularity)
      ? granularity
      : 'day';

    const data = await AnalyticsService.getEnrollmentTrends({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      granularity: safeGranularity,
      courseId: typeof courseId === 'string' && courseId.length > 0 ? courseId : undefined,
    });

    res.json({
      success: true,
      data: stripPII(data),
      message: 'Enrollment trends fetched successfully',
    });
  } catch (error) {
    logger.error('Error fetching enrollment trends:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch enrollment trends' });
  }
};

/**
 * GET /api/v1/analytics/completion-rates
 * Issue #26 — completion-rate aggregates from real course_enrollment +
 * course_completion events. PII-safe.
 *
 * Query params:
 *   startDate? ISO date (defaults to 30 days before endDate)
 *   endDate?   ISO date (defaults to now)
 *   courseId?  string (optional — when present, only the overall rate is
 *              returned; when absent, a per-course breakdown is included).
 */
const getCompletionRates = async (req, res) => {
  try {
    const { startDate, endDate, courseId } = req.query;
    const data = await AnalyticsService.getCompletionRates({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      courseId: typeof courseId === 'string' && courseId.length > 0 ? courseId : undefined,
    });

    res.json({
      success: true,
      data: stripPII(data),
      message: 'Completion rates fetched successfully',
    });
  } catch (error) {
    logger.error('Error fetching completion rates:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch completion rates' });
  }
};

/**
 * GET /api/v1/analytics/export
 * Legacy raw-data dump endpoint. Lazy-creates its own pg pool so module import
 * has zero side effects. Outputs a self-describing JSON attachment (max 1000
 * rows).
 */
const exportData = async (req, res) => {
  try {
    const data = await getExportPool().query(
      'SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 1000'
    );
    const jsonContent = JSON.stringify(data.rows, null, 2);

    res.setHeader('Content-disposition', 'attachment; filename=activity_export.json');
    res.set('Content-Type', 'application/json');
    res.status(200).send(jsonContent);
  } catch (err) {
    logger.error('Export failed:', err);
    res.status(500).json({ error: 'Export failed' });
  }
};

module.exports = {
  getOverviewStats,
  getDetailedReport,
  getEnrollmentTrends,
  getCompletionRates,
  exportData,
};
