/**
 * Public (unauthenticated) API routes.
 *
 * These endpoints expose aggregate, non-sensitive data for the marketing site.
 * They are cached and rate-limited, and must never require authentication or
 * return PII.
 */

import { Router, Request, Response } from 'express';
import { getPublicStats, getCacheTtlSeconds } from '../services/publicStatsService';
import { rateLimits } from '../middleware/rateLimit';
import logger from '../utils/logger';

const router: Router = Router();

/**
 * GET /api/v1/public/stats
 * Aggregate platform counts for the landing page (learners, credentials
 * issued, courses published). Read-only, cached, and rate-limited.
 */
router.get('/stats', rateLimits.readOnly, async (_req: Request, res: Response) => {
  try {
    const stats = await getPublicStats();

    // Allow shared/CDN caches to hold the response for the same short window.
    res.set('Cache-Control', `public, max-age=${getCacheTtlSeconds()}`);
    return res.json(stats);
  } catch (err) {
    logger.error(`Failed to retrieve public stats: ${err}`);
    return res.status(500).json({ error: 'Failed to retrieve public stats' });
  }
});

export default router;
