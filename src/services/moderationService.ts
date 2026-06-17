/**
 * Moderation Service
 * Handles content moderation queue management — flagging, reviewing,
 * approving, rejecting, auto-flagging, and audit logging.
 */

import {
  ModerationFlag,
  ModerationFlagFilter,
  ModerationStatus,
  ModerationAction,
  BatchModerationAction,
  ModerationAuditEntry,
  AutoFlagRule,
  ModerationQueueStats,
  ContentType,
  FlagSource,
  DEFAULT_AUTO_FLAG_KEYWORDS,
} from '../models/ModerationFlag';
import logger from '../utils/logger';

export class ModerationService {
  private flags: Map<string, ModerationFlag> = new Map();
  private auditLog: ModerationAuditEntry[] = [];
  private autoFlagRules: AutoFlagRule[] = [];
  private idCounter = 0;

  constructor() {
    this.initDefaultRules();
    logger.info('ModerationService initialized');
  }

  private initDefaultRules(): void {
    for (const keyword of DEFAULT_AUTO_FLAG_KEYWORDS) {
      this.autoFlagRules.push({
        id: `rule_${++this.idCounter}`,
        contentType: ContentType.DISCUSSION_POST,
        keyword,
        severity: 'medium',
        enabled: true,
        createdAt: new Date(),
      });
    }
  }

  // ─── Flagging ──────────────────────────────────────────────────

  /**
   * Create a moderation flag (user report or auto-flag).
   */
  flagContent(
    contentType: ContentType,
    contentId: string,
    flaggedBy: string,
    reason: string,
    authorId: string,
    courseId?: string,
    flagSource: FlagSource = FlagSource.USER_REPORT,
    matchedKeywords?: string[],
  ): ModerationFlag {
    const flag: ModerationFlag = {
      id: `flag_${Date.now()}_${++this.idCounter}`,
      contentType,
      contentId,
      flaggedBy,
      flagSource,
      reason,
      matchedKeywords,
      status: ModerationStatus.PENDING,
      authorId,
      courseId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.flags.set(flag.id, flag);
    logger.info(`Content flagged: ${flag.id} by ${flaggedBy} (${flagSource}) — ${reason}`);
    return flag;
  }

  /**
   * Auto-flag content based on keyword/pattern matching.
   * Returns the created flag if any keywords matched, or null.
   */
  autoFlagContent(
    contentType: ContentType,
    contentId: string,
    content: string,
    authorId: string,
    courseId?: string,
  ): ModerationFlag | null {
    const matchedKeywords: string[] = [];

    for (const rule of this.autoFlagRules) {
      if (!rule.enabled) continue;
      if (rule.contentType !== contentType) continue;

      const lowerContent = content.toLowerCase();
      const lowerKeyword = rule.keyword.toLowerCase();

      if (rule.pattern) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(content)) {
            matchedKeywords.push(rule.keyword);
          }
        } catch {
          // Invalid regex — fall through to simple match
          if (lowerContent.includes(lowerKeyword)) {
            matchedKeywords.push(rule.keyword);
          }
        }
      } else if (lowerContent.includes(lowerKeyword)) {
        matchedKeywords.push(rule.keyword);
      }
    }

    if (matchedKeywords.length === 0) {
      return null;
    }

    const reason = `Auto-flagged: matched keywords [${matchedKeywords.join(', ')}]`;
    return this.flagContent(
      contentType,
      contentId,
      'system',
      reason,
      authorId,
      courseId,
      FlagSource.AUTO,
      matchedKeywords,
    );
  }

  // ─── Queue Management ─────────────────────────────────────────

  /**
   * Get the moderation queue with filtering and pagination.
   */
  getQueue(filter?: ModerationFlagFilter): { flags: ModerationFlag[]; totalCount: number; stats: ModerationQueueStats } {
    let results = Array.from(this.flags.values());

    // Apply filters
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(f => statuses.includes(f.status));
    }
    if (filter?.contentType) {
      const types = Array.isArray(filter.contentType) ? filter.contentType : [filter.contentType];
      results = results.filter(f => types.includes(f.contentType));
    }
    if (filter?.flaggedBy) {
      results = results.filter(f => f.flaggedBy === filter.flaggedBy);
    }
    if (filter?.authorId) {
      results = results.filter(f => f.authorId === filter.authorId);
    }
    if (filter?.courseId) {
      results = results.filter(f => f.courseId === filter.courseId);
    }
    if (filter?.dateRange) {
      results = results.filter(
        f => f.createdAt >= filter.dateRange!.from && f.createdAt <= filter.dateRange!.to,
      );
    }

    // Sort
    const sortBy = filter?.sortBy || 'createdAt';
    const sortOrder = filter?.sortOrder || 'desc';
    results.sort((a, b) => {
      const aVal = a[sortBy]?.getTime?.() ?? 0;
      const bVal = b[sortBy]?.getTime?.() ?? 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const totalCount = results.length;

    // Paginate
    const page = filter?.page || 1;
    const limit = filter?.limit || 20;
    const start = (page - 1) * limit;
    results = results.slice(start, start + limit);

    // Calculate stats
    const allFlags = Array.from(this.flags.values());
    const stats: ModerationQueueStats = {
      total: allFlags.length,
      pending: allFlags.filter(f => f.status === ModerationStatus.PENDING).length,
      approved: allFlags.filter(f => f.status === ModerationStatus.APPROVED).length,
      rejected: allFlags.filter(f => f.status === ModerationStatus.REJECTED).length,
      revisionRequested: allFlags.filter(f => f.status === ModerationStatus.REVISION_REQUESTED).length,
      resolved: allFlags.filter(f => f.status === ModerationStatus.RESOLVED).length,
      autoFlagged: allFlags.filter(f => f.flagSource === FlagSource.AUTO).length,
      userReported: allFlags.filter(f => f.flagSource === FlagSource.USER_REPORT).length,
    };

    return { flags: results, totalCount, stats };
  }

  /**
   * Get a single moderation flag by ID.
   */
  getFlag(flagId: string): ModerationFlag | null {
    return this.flags.get(flagId) || null;
  }

  // ─── Moderation Actions ───────────────────────────────────────

  /**
   * Apply a moderation action (approve/reject/request revision) to a single flag.
   */
  moderateFlag(flagId: string, action: ModerationAction): ModerationFlag | null {
    const flag = this.flags.get(flagId);
    if (!flag) {
      logger.warn(`Moderation flag not found: ${flagId}`);
      return null;
    }

    const previousStatus = flag.status;

    switch (action.action) {
      case 'approve':
        flag.status = ModerationStatus.APPROVED;
        break;
      case 'reject':
        flag.status = ModerationStatus.REJECTED;
        break;
      case 'request_revision':
        flag.status = ModerationStatus.REVISION_REQUESTED;
        break;
      default:
        throw new Error(`Unknown moderation action: ${action.action}`);
    }

    flag.moderatorId = action.moderatorId;
    flag.moderatorNote = action.note;
    flag.moderatedAt = new Date();
    flag.updatedAt = new Date();

    this.flags.set(flagId, flag);

    // Record audit entry
    this.recordAudit(flagId, action, previousStatus, flag.status);

    logger.info(
      `Moderation action: ${action.action} on flag ${flagId} by ${action.moderatorId} — ${action.reason || ''}`,
    );

    return flag;
  }

  /**
   * Batch moderate multiple flags with the same action.
   */
  batchModerate(action: BatchModerationAction): { successCount: number; failedCount: number; errors: string[] } {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const flagId of action.flagIds) {
      try {
        const result = this.moderateFlag(flagId, {
          action: action.action,
          moderatorId: action.moderatorId,
          reason: action.reason,
          note: action.note,
        });

        if (result) {
          successCount++;
        } else {
          failedCount++;
          errors.push(`Flag not found: ${flagId}`);
        }
      } catch (error) {
        failedCount++;
        errors.push(`Error moderating ${flagId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logger.info(`Batch moderation: ${successCount} succeeded, ${failedCount} failed`);
    return { successCount, failedCount, errors };
  }

  // ─── Audit Logging ────────────────────────────────────────────

  private recordAudit(
    flagId: string,
    action: ModerationAction,
    previousStatus: ModerationStatus,
    newStatus: ModerationStatus,
  ): void {
    const entry: ModerationAuditEntry = {
      id: `audit_${Date.now()}_${++this.idCounter}`,
      flagId,
      action: action.action,
      moderatorId: action.moderatorId,
      reason: action.reason,
      timestamp: new Date(),
      previousStatus,
      newStatus,
    };

    this.auditLog.push(entry);

    // Keep only last 10000 audit entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
  }

  /**
   * Get audit log entries for a flag or moderator.
   */
  getAuditLog(filter?: {
    flagId?: string;
    moderatorId?: string;
    limit?: number;
  }): ModerationAuditEntry[] {
    let results = [...this.auditLog];

    if (filter?.flagId) results = results.filter(e => e.flagId === filter.flagId);
    if (filter?.moderatorId) results = results.filter(e => e.moderatorId === filter.moderatorId);

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit) results = results.slice(0, filter.limit);

    return results;
  }

  // ─── Auto-flag Rules ──────────────────────────────────────────

  /**
   * Add or update an auto-flag rule.
   */
  upsertAutoFlagRule(rule: Omit<AutoFlagRule, 'id' | 'createdAt'> & { id?: string }): AutoFlagRule {
    const existing = rule.id ? this.autoFlagRules.find(r => r.id === rule.id) : undefined;

    if (existing) {
      existing.keyword = rule.keyword;
      existing.pattern = rule.pattern;
      existing.severity = rule.severity;
      existing.enabled = rule.enabled;
      logger.info(`Auto-flag rule updated: ${existing.id}`);
      return existing;
    }

    const newRule: AutoFlagRule = {
      ...rule,
      id: `rule_${++this.idCounter}`,
      createdAt: new Date(),
    };

    this.autoFlagRules.push(newRule);
    logger.info(`Auto-flag rule created: ${newRule.id}`);
    return newRule;
  }

  /**
   * Get all auto-flag rules.
   */
  getAutoFlagRules(): AutoFlagRule[] {
    return [...this.autoFlagRules];
  }

  /**
   * Clear all data (useful for testing).
   */
  clearAll(): void {
    this.flags.clear();
    this.auditLog = [];
    logger.debug('ModerationService data cleared');
  }
}

export const moderationService = new ModerationService();
