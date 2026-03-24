import { DataAggregationService } from './dataAggregation';
import { TrendAnalysisService } from './trendAnalysis';
import { ReportService } from './reportService';
import { getRedisClient } from '../utils/redis';

export class AnalyticsService {
  private static CACHE_TTL = 3600; // 1 hour in seconds for user/course data
  private static DASHBOARD_CACHE_TTL = 300; // 5 minutes for dashboard data

  /**
   * Get admin dashboard stats with 5-minute Redis caching
   */
  static async getAdminDashboardStats() {
    const cacheKey = 'analytics:dashboard:stats';

    // Try cache first
    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      }
    } catch (error) {
      console.warn('Redis cache miss for dashboard stats:', error);
    }

    // Fetch fresh data from the database
    const stats = await DataAggregationService.getDashboardStats();

    const result = {
      ...stats,
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(result));
      }
    } catch (error) {
      console.warn('Failed to cache dashboard stats:', error);
    }

    return result;
  }

  /**
   * Invalidate dashboard cache (call when data changes)
   */
  static async invalidateDashboardCache() {
    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.del('analytics:dashboard:stats');
      }
    } catch (error) {
      console.warn('Failed to invalidate dashboard cache:', error);
    }
  }

  /**
   * Get cached or fresh analytics for a course
   */
  static async getCourseAnalytics(courseId: string) {
    const cacheKey = `analytics:course:${courseId}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      }
    } catch (error) {
      console.warn('Redis cache miss or error:', error);
    }

    const stats = await DataAggregationService.getCourseCompletionStats(courseId);

    const result = {
      ...stats,
      lastUpdated: new Date().toISOString(),
    };

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      }
    } catch (error) {
      console.warn('Failed to cache analytics:', error);
    }

    return result;
  }

  /**
   * Get user learning insights
   */
  static async getUserInsights(userId: string) {
    const activity = await DataAggregationService.getUserDailyActivity(userId, 7);

    let trend = { direction: 'flat', percentage: 0 };
    if (activity.length >= 2) {
      const current = activity[activity.length - 1].lessons_completed;
      const previous = activity[activity.length - 2].lessons_completed;
      trend = TrendAnalysisService.calculateTrend(current, previous);
    }

    return {
      userId,
      recentActivity: activity,
      learningTrend: trend,
    };
  }

  /**
   * Get time analysis for user
   */
  static async getUserTimeAnalysis(userId: string) {
    const cacheKey = `analytics:time:${userId}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) return JSON.parse(cachedData);
      }
    } catch (e) {
      /* ignore cache error */
    }

    const data = await DataAggregationService.getUserTimeAnalysis(userId);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, 1800, JSON.stringify(data));
      }
    } catch (e) {
      /* ignore cache error */
    }

    return data;
  }

  /**
   * Get aggregate analytics for a quiz
   */
  static async getQuizAnalytics(quizId: string) {
    const cacheKey = `analytics:quiz:${quizId}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) return JSON.parse(cachedData);
      }
    } catch (e) {
      /* ignore cache error */
    }

    const data = await DataAggregationService.getQuizPerformanceAnalytics(quizId);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(data));
      }
    } catch (e) {
      /* ignore cache error */
    }

    return data;
  }

  /**
   * Get specific user performance trends for quizzes
   */
  static async getUserQuizInsights(userId: string) {
    const activity = await DataAggregationService.getUserDailyActivity(userId, 30);
    const quizStats = activity.filter((a) => a.quiz_score > 0);

    return {
      userId,
      quizParticipation: quizStats.length,
      averageQuizScore:
        quizStats.length > 0
          ? quizStats.reduce((sum, a) => sum + a.quiz_score, 0) / quizStats.length
          : 0,
      recentScores: quizStats.slice(-5).map((a) => ({ date: a.date, score: a.quiz_score })),
    };
  }

  /**
   * Generate a downloadable report
   */
  static async generateReport(type: 'course' | 'user' | 'quiz', id: string) {
    if (type === 'course') {
      return await ReportService.generateCoursePerformanceReport(id);
    } else if (type === 'user') {
      return await ReportService.generateUserProgressReport(id);
    } else if (type === 'quiz') {
      return { message: 'Quiz report generation logic would go here' };
    } else {
      throw new Error('Invalid report type');
    }
  }

  /**
   * Get user activity report (admin-facing)
   */
  static async getUserActivityReport(period: string, role?: string) {
    const cacheKey = `analytics:reports:user-activity:${period}:${role || 'all'}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) return JSON.parse(cachedData);
      }
    } catch (e) {
      /* ignore cache error */
    }

    const data = await DataAggregationService.getUserActivityReport(period, role);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(data));
      }
    } catch (e) {
      /* ignore cache error */
    }

    return data;
  }

  /**
   * Get course performance report (admin-facing)
   */
  static async getCoursePerformanceReport(period: string, courseId?: string) {
    const cacheKey = `analytics:reports:course-performance:${period}:${courseId || 'all'}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cachedData = await client.get(cacheKey);
        if (cachedData) return JSON.parse(cachedData);
      }
    } catch (e) {
      /* ignore cache error */
    }

    const data = await DataAggregationService.getCoursePerformanceReport(period, courseId);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(data));
      }
    } catch (e) {
      /* ignore cache error */
    }

    return data;
  }

  /**
   * Get system logs with filtering and pagination
   */
  static async getSystemLogs(params: {
    level?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    // No caching for logs since they change frequently
    return await DataAggregationService.getSystemLogs(params);
  }

  /**
   * Get enrollment trend counts bucketed over time (day/week/month).
   * Issue #26 — real aggregation pipeline. PII-safe: only counts and bucketed dates.
   */
  static async getEnrollmentTrends(opts: {
    startDate?: Date;
    endDate?: Date;
    granularity?: 'day' | 'week' | 'month';
    courseId?: string;
  }) {
    const granularity = opts.granularity ?? 'day';
    const cacheKey = `analytics:trends:${granularity}:${opts.courseId ?? 'all'}:${
      (opts.startDate ?? new Date(0)).toISOString()
    }:${(opts.endDate ?? new Date()).toISOString()}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cached = await client.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      /* cache miss tolerated */
    }

    const data = await DataAggregationService.getEnrollmentTrends(opts);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(data));
      }
    } catch {
      /* cache failure tolerated */
    }

    return data;
  }

  /**
   * Get course completion rates aggregated from real course_enrollment +
   * course_completion events. PII-safe: counts only, no per-user identifiers.
   */
  static async getCompletionRates(opts: {
    startDate?: Date;
    endDate?: Date;
    courseId?: string;
  }) {
    const cacheKey = `analytics:completion-rates:${opts.courseId ?? 'all'}:${
      (opts.startDate ?? new Date(0)).toISOString()
    }:${(opts.endDate ?? new Date()).toISOString()}`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cached = await client.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      /* cache miss tolerated */
    }

    const data = await DataAggregationService.getCompletionRates(opts);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(data));
      }
    } catch {
      /* cache failure tolerated */
    }

    return data;
  }

  /**
   * Aggregated, anonymized student performance snapshot over a date window.
   * PII-safe: only population-level aggregates are returned.
   */
  static async getStudentPerformanceMetrics(opts: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const cacheKey = `analytics:student-perf:${(opts.startDate ?? new Date(0)).toISOString()}:${
      (opts.endDate ?? new Date()).toISOString()
    }`;

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        const cached = await client.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch {
      /* cache miss tolerated */
    }

    const data = await DataAggregationService.getStudentPerformanceMetrics(opts);

    try {
      const client = getRedisClient();
      if (client?.isOpen) {
        await client.setEx(cacheKey, this.DASHBOARD_CACHE_TTL, JSON.stringify(data));
      }
    } catch {
      /* cache failure tolerated */
    }

    return data;
  }
}
