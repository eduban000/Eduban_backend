/**
 * Admin Moderation Routes
 * Endpoints for content moderation queue management.
 * Only users with MODERATOR or ADMIN roles can access.
 */

import { Router, Request, Response } from 'express';
import { moderationService } from '../../services/moderationService';
import { ModerationStatus, ContentType, FlagSource } from '../../models/ModerationFlag';
import { UserRole } from '../../models/User';
import { requireRole } from '../../middleware/auth';

const router = Router();

// All moderation routes require MODERATOR or ADMIN role
const requireModerator = requireRole([UserRole.MODERATOR, UserRole.ADMIN]);

// ─── Queue ───────────────────────────────────────────────────────

/**
 * GET /api/admin/moderation/queue
 * Get the moderation queue with filtering and pagination.
 */
router.get('/queue', requireModerator, async (req: Request, res: Response) => {
  try {
    const {
      status,
      contentType,
      flaggedBy,
      authorId,
      courseId,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      page,
      limit,
    } = req.query;

    const result = moderationService.getQueue({
      status: status ? (status as string).split(',') as ModerationStatus[] : undefined,
      contentType: contentType ? (contentType as string).split(',') as ContentType[] : undefined,
      flaggedBy: flaggedBy as string,
      authorId: authorId as string,
      courseId: courseId as string,
      dateRange: dateFrom && dateTo ? { from: new Date(dateFrom as string), to: new Date(dateTo as string) } : undefined,
      sortBy: (sortBy as any) || 'createdAt',
      sortOrder: (sortOrder as any) || 'desc',
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting moderation queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve moderation queue',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/admin/moderation/stats
 * Get moderation queue statistics.
 */
router.get('/stats', requireModerator, async (_req: Request, res: Response) => {
  try {
    const { stats } = moderationService.getQueue();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting moderation stats:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve stats' });
  }
});

// ─── Flag Operations ────────────────────────────────────────────

/**
 * GET /api/admin/moderation/flags/:id
 * Get a single moderation flag.
 */
router.get('/flags/:id', requireModerator, async (req: Request, res: Response) => {
  try {
    const flag = moderationService.getFlag(req.params.id);
    if (!flag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }
    res.json({ success: true, data: flag });
  } catch (error) {
    console.error('Error getting flag:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve flag' });
  }
});

/**
 * POST /api/admin/moderation/flags/:id/moderate
 * Apply a moderation action to a single flag.
 */
router.post('/flags/:id/moderate', requireModerator, async (req: Request, res: Response) => {
  try {
    const { action, reason, note } = req.body;
    const moderatorId = (req as any).user?.id;

    if (!['approve', 'reject', 'request_revision'].includes(action)) {
      return res.status(400).json({ success: false, message: `Invalid action: ${action}` });
    }

    const result = moderationService.moderateFlag(req.params.id, {
      action,
      moderatorId,
      reason,
      note,
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error moderating flag:', error);
    res.status(500).json({ success: false, message: 'Failed to moderate flag' });
  }
});

/**
 * POST /api/admin/moderation/batch
 * Batch moderate multiple flags.
 */
router.post('/batch', requireModerator, async (req: Request, res: Response) => {
  try {
    const { action, flagIds, reason, note } = req.body;
    const moderatorId = (req as any).user?.id;

    if (!Array.isArray(flagIds) || flagIds.length === 0) {
      return res.status(400).json({ success: false, message: 'flagIds must be a non-empty array' });
    }

    if (!['approve', 'reject', 'request_revision'].includes(action)) {
      return res.status(400).json({ success: false, message: `Invalid action: ${action}` });
    }

    const result = moderationService.batchModerate({
      action,
      flagIds,
      moderatorId,
      reason,
      note,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error batch moderating:', error);
    res.status(500).json({ success: false, message: 'Failed to batch moderate' });
  }
});

// ─── Reporting (User-side) ──────────────────────────────────────

/**
 * POST /api/admin/moderation/report
 * Report content for moderation (any authenticated user).
 */
router.post('/report', async (req: Request, res: Response) => {
  try {
    const { contentType, contentId, reason, authorId, courseId } = req.body;
    const userId = (req as any).user?.id || 'anonymous';

    if (!contentType || !contentId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'contentType, contentId, and reason are required',
      });
    }

    const flag = moderationService.flagContent(
      contentType,
      contentId,
      userId,
      reason,
      authorId || userId,
      courseId,
    );

    res.status(201).json({ success: true, data: flag });
  } catch (error) {
    console.error('Error reporting content:', error);
    res.status(500).json({ success: false, message: 'Failed to report content' });
  }
});

// ─── Audit Log ──────────────────────────────────────────────────

/**
 * GET /api/admin/moderation/audit
 * Get moderation audit log.
 */
router.get('/audit', requireModerator, async (req: Request, res: Response) => {
  try {
    const { flagId, moderatorId, limit } = req.query;

    const entries = moderationService.getAuditLog({
      flagId: flagId as string,
      moderatorId: moderatorId as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: entries });
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve audit log' });
  }
});

// ─── Auto-flag Rules ────────────────────────────────────────────

/**
 * GET /api/admin/moderation/auto-flag-rules
 * Get auto-flag rules.
 */
router.get('/auto-flag-rules', requireModerator, async (_req: Request, res: Response) => {
  try {
    const rules = moderationService.getAutoFlagRules();
    res.json({ success: true, data: rules });
  } catch (error) {
    console.error('Error getting auto-flag rules:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve rules' });
  }
});

/**
 * POST /api/admin/moderation/auto-flag-rules
 * Create or update an auto-flag rule.
 */
router.post('/auto-flag-rules', requireModerator, async (req: Request, res: Response) => {
  try {
    const rule = moderationService.upsertAutoFlagRule(req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    console.error('Error upserting auto-flag rule:', error);
    res.status(500).json({ success: false, message: 'Failed to save rule' });
  }
});

export default router;
