/**
 * Analytics model facades for Course, Enrollment, User.
 *
 * Issue #26 ("Real course analytics with database aggregation pipeline")
 * requires aggregation helper methods on the Course, Enrollment, and User
 * models. In this codebase those TypeScript interfaces (`backend/src/models/
 * Course.ts`, `Enrollment.ts`, `User.ts`) are interface-only — the source of
 * truth for course events is the `activity_logs` PostgreSQL table.
 *
 * To satisfy the issue without duplicating SQL strings across the codebase,
 * these facades expose typed, PII-safe aggregation helpers that delegate to
 * the existing `AnalyticsService`. New endpoints AND tests should prefer
 * these classes over the raw service to keep model semantics consistent.
 */

import { AnalyticsService } from '../services/analyticsService';

export interface TrendQuery {
  startDate?: Date;
  endDate?: Date;
  granularity?: 'day' | 'week' | 'month';
}

export interface CompletionQuery {
  startDate?: Date;
  endDate?: Date;
  courseId?: string;
}

export interface EnrollmentTrendPoint {
  /** ISO date (YYYY-MM-DD) for the bucket boundary. */
  bucket: string;
  /** Course identifier (NOT a user identifier - safe to expose). */
  courseId: string | null;
  enrollments: number;
}

export interface EnrollmentTrendResult {
  granularity: 'day' | 'week' | 'month';
  points: EnrollmentTrendPoint[];
}

export interface CompletionRateBucket {
  courseId: string;
  totalEnrollments: number;
  completedCount: number;
  /** 0–100, rounded to nearest integer. */
  completionRate: number;
}

export interface CompletionRateResult {
  totalEnrollments: number;
  completedCount: number;
  /** 0–100, rounded to nearest integer. */
  completionRate: number;
  byCourse?: CompletionRateBucket[];
}

export interface StudentPerformanceResult {
  activeUsers: number;
  averageEventsPerUser: number;
  /** Null when no enrollment/completion pairs were available. */
  courseCompletionAverageDays: number | null;
  period: { start: string; end: string };
}

/**
 * Course-scoped analytics helpers.
 *
 * Every method returns aggregates only — never an individual enrollment or
 * user record, so PII is never present in responses.
 */
export class CourseAnalytics {
  /**
   * Bucketed enrollment counts for a single course.
   */
  static async getEnrollmentTrends(
    courseId: string,
    query: TrendQuery = {}
  ): Promise<EnrollmentTrendResult> {
    return AnalyticsService.getEnrollmentTrends({ ...query, courseId });
  }

  /**
   * Overall course completion-rate (enrollments → completions) over a window.
   */
  static async getCompletionRate(
    courseId: string,
    query: Omit<TrendQuery, 'granularity'> = {}
  ): Promise<CompletionRateResult> {
    return AnalyticsService.getCompletionRates({ ...query, courseId });
  }
}

/**
 * Enrollment-scoped analytics helpers.
 */
export class EnrollmentAnalytics {
  /**
   * Platform-wide bucketed enrollment counts.
   */
  static async getEnrollmentTrends(query: TrendQuery = {}): Promise<EnrollmentTrendResult> {
    return AnalyticsService.getEnrollmentTrends(query);
  }

  /**
   * Completion-rate aggregates either globally (per-course breakdown) or for
   * a single course.
   */
  static async getCompletionRates(query: CompletionQuery = {}): Promise<CompletionRateResult> {
    return AnalyticsService.getCompletionRates(query);
  }
}

/**
 * User-scoped analytics helpers.
 * All outputs are anonymized aggregates — no user identifier is ever returned.
 */
export class UserAnalytics {
  /**
   * Aggregated, anonymized student performance snapshot over a date window.
   */
  static async getStudentPerformanceMetrics(
    query: TrendQuery = {}
  ): Promise<StudentPerformanceResult> {
    return AnalyticsService.getStudentPerformanceMetrics({
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }
}
