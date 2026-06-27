/**
 * Moderation Service Tests
 * Tests for content moderation queue, auto-flagging, moderation actions,
 * batch operations, and audit logging.
 */

import { moderationService, ModerationService } from '../src/services/moderationService';
import { ModerationStatus, ContentType, FlagSource } from '../src/models/ModerationFlag';

describe('Moderation Service — Flagging', () => {
  beforeEach(() => {
    moderationService.clearAll();
  });

  it('should create a moderation flag for reported content', () => {
    const flag = moderationService.flagContent(
      ContentType.DISCUSSION_POST,
      'post-123',
      'user-1',
      'Inappropriate language',
      'author-1',
      'course-1',
    );

    expect(flag.id).toMatch(/^flag_/);
    expect(flag.status).toBe(ModerationStatus.PENDING);
    expect(flag.contentType).toBe(ContentType.DISCUSSION_POST);
    expect(flag.flaggedBy).toBe('user-1');
    expect(flag.flagSource).toBe(FlagSource.USER_REPORT);
  });

  it('should auto-flag content with blocked keywords', () => {
    const flag = moderationService.autoFlagContent(
      ContentType.DISCUSSION_POST,
      'post-456',
      'This post contains spam and phishing links',
      'author-2',
    );

    expect(flag).not.toBeNull();
    expect(flag!.flagSource).toBe(FlagSource.AUTO);
    expect(flag!.matchedKeywords).toContain('spam');
    expect(flag!.matchedKeywords).toContain('phishing');
    expect(flag!.status).toBe(ModerationStatus.PENDING);
  });

  it('should not auto-flag clean content', () => {
    const flag = moderationService.autoFlagContent(
      ContentType.DISCUSSION_POST,
      'post-789',
      'This is a normal discussion post about blockchain technology',
      'author-3',
    );

    expect(flag).toBeNull();
  });
});

describe('Moderation Service — Queue', () => {
  beforeEach(() => {
    moderationService.clearAll();
  });

  it('should retrieve the moderation queue', () => {
    moderationService.flagContent(
      ContentType.COURSE_DESCRIPTION, 'course-1', 'user-1', 'Bad content', 'author-1', 'course-abc',
    );
    moderationService.flagContent(
      ContentType.DISCUSSION_POST, 'post-2', 'user-2', 'Spam', 'author-2', 'course-abc',
    );

    const { flags, totalCount, stats } = moderationService.getQueue();

    expect(flags.length).toBe(2);
    expect(totalCount).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.userReported).toBe(2);
  });

  it('should filter queue by status', () => {
    const flag1 = moderationService.flagContent(
      ContentType.DISCUSSION_POST, 'post-1', 'u1', 'r1', 'a1',
    );
    moderationService.flagContent(
      ContentType.DISCUSSION_POST, 'post-2', 'u2', 'r2', 'a2',
    );

    // Approve one flag
    moderationService.moderateFlag(flag1.id, {
      action: 'approve',
      moderatorId: 'mod-1',
      reason: 'Looks fine',
    });

    const { flags, stats } = moderationService.getQueue({ status: ModerationStatus.PENDING });
    expect(flags.length).toBe(1);
    expect(stats.approved).toBe(1);
  });

  it('should filter queue by content type', () => {
    moderationService.flagContent(ContentType.COURSE_DESCRIPTION, 'c1', 'u1', 'r1', 'a1');
    moderationService.flagContent(ContentType.DISCUSSION_POST, 'p1', 'u2', 'r2', 'a2');
    moderationService.flagContent(ContentType.REVIEW, 'r1', 'u3', 'r3', 'a3');

    const { flags } = moderationService.getQueue({ contentType: ContentType.DISCUSSION_POST });
    expect(flags.length).toBe(1);
    expect(flags[0].contentType).toBe(ContentType.DISCUSSION_POST);
  });
});

describe('Moderation Service — Actions', () => {
  let flagId: string;

  beforeEach(() => {
    moderationService.clearAll();
    const flag = moderationService.flagContent(
      ContentType.DISCUSSION_POST, 'post-1', 'reporter', 'Offensive', 'author',
    );
    flagId = flag.id;
  });

  it('should approve a flag', () => {
    const result = moderationService.moderateFlag(flagId, {
      action: 'approve',
      moderatorId: 'mod-1',
      reason: 'Content is fine',
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(ModerationStatus.APPROVED);
    expect(result!.moderatorId).toBe('mod-1');
    expect(result!.moderatedAt).toBeDefined();
  });

  it('should reject a flag', () => {
    const result = moderationService.moderateFlag(flagId, {
      action: 'reject',
      moderatorId: 'mod-1',
      reason: 'Violates guidelines',
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(ModerationStatus.REJECTED);
    expect(result!.moderatorNote).toBeUndefined();
  });

  it('should request revision on a flag', () => {
    const result = moderationService.moderateFlag(flagId, {
      action: 'request_revision',
      moderatorId: 'mod-1',
      note: 'Please update the language',
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(ModerationStatus.REVISION_REQUESTED);
    expect(result!.moderatorNote).toBe('Please update the language');
  });

  it('should return null for nonexistent flag', () => {
    const result = moderationService.moderateFlag('nonexistent', {
      action: 'approve',
      moderatorId: 'mod-1',
    });

    expect(result).toBeNull();
  });
});

describe('Moderation Service — Batch Operations', () => {
  beforeEach(() => {
    moderationService.clearAll();
  });

  it('should batch approve multiple flags', () => {
    const f1 = moderationService.flagContent(ContentType.DISCUSSION_POST, 'p1', 'u1', 'r1', 'a1');
    const f2 = moderationService.flagContent(ContentType.DISCUSSION_POST, 'p2', 'u2', 'r2', 'a2');
    const f3 = moderationService.flagContent(ContentType.REVIEW, 'r1', 'u3', 'r3', 'a3');

    const result = moderationService.batchModerate({
      action: 'approve',
      flagIds: [f1.id, f2.id, f3.id],
      moderatorId: 'mod-1',
      reason: 'Batch approval',
    });

    expect(result.successCount).toBe(3);
    expect(result.failedCount).toBe(0);

    const f1After = moderationService.getFlag(f1.id);
    expect(f1After!.status).toBe(ModerationStatus.APPROVED);
  });

  it('should handle missing flags in batch', () => {
    const f1 = moderationService.flagContent(ContentType.DISCUSSION_POST, 'p1', 'u1', 'r1', 'a1');

    const result = moderationService.batchModerate({
      action: 'reject',
      flagIds: [f1.id, 'nonexistent'],
      moderatorId: 'mod-1',
    });

    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors.length).toBe(1);
  });
});

describe('Moderation Service — Audit Log', () => {
  beforeEach(() => {
    moderationService.clearAll();
  });

  it('should record audit entries for moderation actions', () => {
    const flag = moderationService.flagContent(ContentType.DISCUSSION_POST, 'p1', 'u1', 'Bad', 'a1');

    moderationService.moderateFlag(flag.id, {
      action: 'approve',
      moderatorId: 'mod-1',
      reason: 'Cleared',
    });

    const entries = moderationService.getAuditLog({ flagId: flag.id });
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('approve');
    expect(entries[0].moderatorId).toBe('mod-1');
    expect(entries[0].previousStatus).toBe(ModerationStatus.PENDING);
    expect(entries[0].newStatus).toBe(ModerationStatus.APPROVED);
  });
});

describe('Moderation Service — Auto-flag Rules', () => {
  beforeEach(() => {
    moderationService.clearAll();
  });

  it('should create a new auto-flag rule', () => {
    const rule = moderationService.upsertAutoFlagRule({
      contentType: ContentType.DISCUSSION_POST,
      keyword: 'test-keyword',
      severity: 'high',
      enabled: true,
    });

    expect(rule.id).toMatch(/^rule_/);
    expect(rule.keyword).toBe('test-keyword');
  });

  it('should get all auto-flag rules', () => {
    const rules = moderationService.getAutoFlagRules();
    expect(Array.isArray(rules)).toBe(true);
    // Default rules are initialized in constructor
    expect(rules.length).toBeGreaterThan(0);
  });
});
