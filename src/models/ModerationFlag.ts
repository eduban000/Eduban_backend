/**
 * Moderation Flag Model
 * Represents content items flagged for moderation review.
 */

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVISION_REQUESTED = 'revision_requested',
  RESOLVED = 'resolved',
}

export enum ContentType {
  COURSE_DESCRIPTION = 'course_description',
  USER_RESOURCE = 'user_resource',
  DISCUSSION_POST = 'discussion_post',
  REVIEW = 'review',
  ASSIGNMENT_SUBMISSION = 'assignment_submission',
}

export enum FlagSource {
  AUTO = 'auto',        // Auto-flagged by keyword/pattern matching
  USER_REPORT = 'user_report',
}

export interface ModerationFlag {
  id: string;
  contentType: ContentType;
  contentId: string;
  flaggedBy: string;          // User ID who reported (or 'system' for auto-flag)
  flagSource: FlagSource;
  reason: string;             // User-provided or auto-detected reason
  matchedKeywords?: string[]; // Keywords that triggered auto-flag
  status: ModerationStatus;
  moderatorId?: string;       // Who handled the flag
  moderatorNote?: string;     // Note from moderator
  moderatedAt?: Date;
  authorId: string;           // Content author (for notification)
  courseId?: string;          // Related course if applicable
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationFlagFilter {
  status?: ModerationStatus | ModerationStatus[];
  contentType?: ContentType | ContentType[];
  flaggedBy?: string;
  authorId?: string;
  courseId?: string;
  dateRange?: { from: Date; to: Date };
  sortBy?: 'createdAt' | 'updatedAt' | 'moderatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ModerationAction {
  action: 'approve' | 'reject' | 'request_revision';
  moderatorId: string;
  reason?: string;
  note?: string;
}

export interface BatchModerationAction extends ModerationAction {
  flagIds: string[];
}

export interface ModerationAuditEntry {
  id: string;
  flagId: string;
  action: ModerationAction['action'];
  moderatorId: string;
  reason?: string;
  timestamp: Date;
  previousStatus: ModerationStatus;
  newStatus: ModerationStatus;
}

export interface AutoFlagRule {
  id: string;
  contentType: ContentType;
  keyword: string;
  pattern?: string;     // Regex pattern for advanced matching
  severity: 'low' | 'medium' | 'high';
  enabled: boolean;
  createdAt: Date;
}

export const DEFAULT_AUTO_FLAG_KEYWORDS: string[] = [
  'inappropriate',
  'offensive',
  'spam',
  'scam',
  'fraud',
  'phishing',
  'malware',
  'hate speech',
  'harassment',
  'violence',
  'nsfw',
  'adult content',
  'illegal',
  'copyright',
  'plagiarism',
];

export interface ModerationQueueStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  revisionRequested: number;
  resolved: number;
  autoFlagged: number;
  userReported: number;
}
