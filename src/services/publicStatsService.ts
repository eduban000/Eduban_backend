/**
 * Public Stats Service
 *
 * Computes aggregate, non-sensitive platform statistics for the public
 * marketing site (see issue #1): total learners, credentials issued, and
 * courses published.
 *
 * Design notes:
 * - Counts are derived from the `activity_logs` telemetry table, which is the
 *   canonical, append-only record of platform events. Each count is run via
 *   `safeQuery`, so a missing table/column degrades gracefully to 0 instead of
 *   failing the endpoint (the marketing site must never 500 on this).
 * - Results are cached in Redis with a short, env-configurable TTL
 *   (`PUBLIC_STATS_CACHE_TTL`, seconds) using a simple cache-aside strategy.
 * - No per-user or otherwise identifying data is read or returned (no PII).
 */

import { safeQuery } from '../utils/database';
import { getRedisClient } from '../utils/redis';
import logger from '../utils/logger';

export interface PublicStats {
  /** Distinct accounts that have generated any platform activity. */
  learners: number;
  /** Count of on-chain credential issuance events. */
  credentialsIssued: number;
  /** Count of published/created courses. */
  coursesPublished: number;
  /** ISO timestamp of when these figures were computed. */
  generatedAt: string;
}

// activity_logs event types used to derive the public counts.
const CREDENTIAL_ISSUED_TYPE = 'credential_issuance';
const COURSE_PUBLISHED_TYPE = 'course_created';

export const PUBLIC_STATS_CACHE_KEY = 'public:stats';

/**
 * Cache TTL in seconds. Short by default so the marketing numbers stay fresh;
 * override with PUBLIC_STATS_CACHE_TTL.
 */
export function getCacheTtlSeconds(): number {
  const parsed = parseInt(process.env.PUBLIC_STATS_CACHE_TTL || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

async function countDistinctLearners(): Promise<number> {
  const result = await safeQuery(
    'SELECT COUNT(DISTINCT source_account)::int AS count FROM activity_logs'
  );
  return result?.rows?.[0]?.count ?? 0;
}

async function countByType(type: string): Promise<number> {
  const result = await safeQuery(
    'SELECT COUNT(*)::int AS count FROM activity_logs WHERE type = $1',
    [type]
  );
  return result?.rows?.[0]?.count ?? 0;
}

/**
 * Compute fresh stats directly from the database (no caching).
 */
export async function computePublicStats(): Promise<PublicStats> {
  const [learners, credentialsIssued, coursesPublished] = await Promise.all([
    countDistinctLearners(),
    countByType(CREDENTIAL_ISSUED_TYPE),
    countByType(COURSE_PUBLISHED_TYPE),
  ]);

  return {
    learners,
    credentialsIssued,
    coursesPublished,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Return public stats using a Redis cache-aside strategy. Falls back to a
 * direct computation if Redis is unavailable, and never throws for cache
 * issues alone.
 */
export async function getPublicStats(): Promise<PublicStats> {
  const client = getRedisClient();

  if (client) {
    try {
      const cached = await client.get(PUBLIC_STATS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as PublicStats;
      }
    } catch (err) {
      logger.warn(`public stats: cache read failed, computing fresh: ${err}`);
    }
  }

  const stats = await computePublicStats();

  if (client) {
    try {
      await client.set(PUBLIC_STATS_CACHE_KEY, JSON.stringify(stats), {
        EX: getCacheTtlSeconds(),
      });
    } catch (err) {
      logger.warn(`public stats: cache write failed: ${err}`);
    }
  }

  return stats;
}
