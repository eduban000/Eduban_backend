import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import logger from '../utils/logger';
import { emailTemplates, RenderedEmail, EmailTemplateData } from './emailTemplates';
import { getQueueManager, QueuedItem } from './queueManager';
import { EmailPreferences, DEFAULT_EMAIL_PREFERENCES } from '../models/User';

// ─── Types ───────────────────────────────────────────────────────────

export type EmailProvider = 'sendgrid' | 'ses' | 'smtp';

export type EmailEventType = 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed' | 'complained';

export type EmailType =
  | 'enrollmentConfirmation'
  | 'credentialIssued'
  | 'paymentReceipt'
  | 'assignmentGraded'
  | 'passwordChanged'
  | 'newLoginAlert'
  | 'newsletterWelcome';

export interface EmailEvent {
  id: string;
  emailId: string;
  userId: string;
  emailType: EmailType;
  eventType: EmailEventType;
  recipient: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EmailSendRequest {
  userId: string;
  userEmail: string;
  templateData: EmailTemplateData;
  metadata?: Record<string, any>;
}

export interface EmailSendResult {
  emailId: string;
  queued: boolean;
  messageId?: string;
}

export interface EmailRateLimitInfo {
  count: number;
  windowStart: Date;
  nextAllowedAt?: Date;
}

// Re-export for convenience
export { EmailPreferences, DEFAULT_EMAIL_PREFERENCES };

// Security email types that users cannot opt out of
const SECURITY_EMAIL_TYPES: Set<EmailType> = new Set(['passwordChanged', 'newLoginAlert']);

// ─── Configuration ───────────────────────────────────────────────────

interface EmailServiceConfig {
  provider: EmailProvider;
  maxRetries: number;
  retryDelayMs: number;
  maxEmailsPerHour: number;
  rateLimitWindowMs: number;
  fromAddress: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  sendgridApiKey?: string;
  sesRegion?: string;
}

const defaultConfig: EmailServiceConfig = {
  provider: (process.env.EMAIL_PROVIDER as EmailProvider) || 'smtp',
  maxRetries: 3,
  retryDelayMs: 1000,
  maxEmailsPerHour: 10,
  rateLimitWindowMs: 60 * 60 * 1000, // 1 hour
  fromAddress: process.env.EMAIL_FROM || 'noreply@eduban.edu',
  smtp: {
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
  },
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sesRegion: process.env.AWS_SES_REGION || 'us-east-1',
};

// ─── Service ─────────────────────────────────────────────────────────

class EmailService {
  private transporter: Transporter;
  private config: EmailServiceConfig;
  private events: EmailEvent[] = [];
  private rateLimitMap: Map<string, { count: number; windowStart: number }> = new Map();
  private userPreferencesMap: Map<string, EmailPreferences> = new Map();
  private idCounter = 0;

  constructor(configOverrides?: Partial<EmailServiceConfig>) {
    this.config = { ...defaultConfig, ...configOverrides };

    this.transporter = this.createTransporter();
    logger.info(`EmailService initialized with provider: ${this.config.provider}`);
  }

  /**
   * Create a nodemailer transporter based on the configured provider.
   */
  private createTransporter(): Transporter {
    switch (this.config.provider) {
      case 'sendgrid':
        return nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: this.config.sendgridApiKey || '',
          },
        });

      case 'ses': {
        // Use nodemailer's SES transport via aws-sdk v2 (already a dependency)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const aws = require('aws-sdk');
        aws.config.update({ region: this.config.sesRegion });
        return nodemailer.createTransport({
          SES: new aws.SES({ apiVersion: '2010-12-01' }),
        });
      }

      case 'smtp':
      default:
        return nodemailer.createTransport({
          host: this.config.smtp?.host || 'localhost',
          port: this.config.smtp?.port || 587,
          secure: this.config.smtp?.secure || false,
          auth: {
            user: this.config.smtp?.auth.user || '',
            pass: this.config.smtp?.auth.pass || '',
          },
        });
    }
  }

  // ─── Rate Limiting ──────────────────────────────────────────────

  /**
   * Check if a user has exceeded the email rate limit.
   * Returns remaining sends or throws if limit exceeded.
   */
  private checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);

    // No previous sends or window expired — reset
    if (!entry || now - entry.windowStart > this.config.rateLimitWindowMs) {
      this.rateLimitMap.set(userId, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.config.maxEmailsPerHour - 1 };
    }

    // Within window
    if (entry.count >= this.config.maxEmailsPerHour) {
      return { allowed: false, remaining: 0 };
    }

    entry.count += 1;
    return { allowed: true, remaining: this.config.maxEmailsPerHour - entry.count };
  }

  getRateLimitInfo(userId: string): EmailRateLimitInfo {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);

    if (!entry || now - entry.windowStart > this.config.rateLimitWindowMs) {
      return { count: 0, windowStart: new Date(now) };
    }

    const windowEnd = entry.windowStart + this.config.rateLimitWindowMs;
    const nextAllowedAt = entry.count >= this.config.maxEmailsPerHour
      ? new Date(windowEnd)
      : undefined;

    return {
      count: entry.count,
      windowStart: new Date(entry.windowStart),
      nextAllowedAt,
    };
  }

  // ─── Preferences ────────────────────────────────────────────────

  /**
   * Set a user's email preferences.
   */
  setUserPreferences(userId: string, preferences: Partial<EmailPreferences>): void {
    const current = this.getUserPreferences(userId);
    this.userPreferencesMap.set(userId, { ...current, ...preferences });
    logger.info(`Email preferences updated for user ${userId}`);
  }

  /**
   * Get a user's email preferences, with defaults.
   */
  getUserPreferences(userId: string): EmailPreferences {
    if (!this.userPreferencesMap.has(userId)) {
      return { ...DEFAULT_EMAIL_PREFERENCES };
    }
    return this.userPreferencesMap.get(userId)!;
  }

  /**
   * Check if a user has opted in to receive a specific email type.
   * Security emails are always sent regardless of preferences.
   */
  canSendEmailType(userId: string, emailType: EmailType): boolean {
    // Security emails cannot be opted out
    if (SECURITY_EMAIL_TYPES.has(emailType)) {
      return true;
    }

    const prefs = this.getUserPreferences(userId);
    // Use a type-safe lookup with a switch/map instead of index signature
    const prefMap: Record<EmailType, boolean> = {
      enrollmentConfirmation: prefs.enrollmentConfirmation,
      credentialIssued: prefs.credentialIssued,
      paymentReceipt: prefs.paymentReceipt,
      assignmentGraded: prefs.assignmentGraded,
      passwordChanged: prefs.passwordChanged,
      newLoginAlert: prefs.newLoginAlert,
    };
    return prefMap[emailType] !== false;
  }

  // ─── Event Tracking ────────────────────────────────────────────

  private recordEvent(
    emailId: string,
    userId: string,
    emailType: EmailType,
    eventType: EmailEventType,
    recipient: string,
    metadata?: Record<string, any>,
  ): void {
    const event: EmailEvent = {
      id: `evt_${Date.now()}_${++this.idCounter}`,
      emailId,
      userId,
      emailType,
      eventType,
      recipient,
      timestamp: new Date(),
      metadata,
    };
    this.events.push(event);

    // Keep only the last 10000 events to bound memory
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }

    logger.info(`Email event: ${eventType} for ${emailType} to ${recipient} (emailId: ${emailId})`);
  }

  /**
   * Get email events for a user or email.
   */
  getEvents(filter?: {
    userId?: string;
    emailId?: string;
    emailType?: EmailType;
    eventType?: EmailEventType;
    limit?: number;
  }): EmailEvent[] {
    let results = [...this.events];

    if (filter?.userId) results = results.filter(e => e.userId === filter.userId);
    if (filter?.emailId) results = results.filter(e => e.emailId === filter.emailId);
    if (filter?.emailType) results = results.filter(e => e.emailType === filter.emailType);
    if (filter?.eventType) results = results.filter(e => e.eventType === filter.eventType);

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit) results = results.slice(0, filter.limit);

    return results;
  }

  // ─── Core Send Logic ───────────────────────────────────────────

  /**
   * Send an email asynchronously.
   * The email is queued for delivery via the queueManager.
   * Returns immediately with an emailId for tracking.
   */
  async sendEmail(request: EmailSendRequest): Promise<EmailSendResult> {
    const emailId = `email_${Date.now()}_${++this.idCounter}`;
    const emailType = request.templateData.type;

    // Check rate limit
    const rateCheck = this.checkRateLimit(request.userId);
    if (!rateCheck.allowed) {
      const limitInfo = this.getRateLimitInfo(request.userId);
      logger.warn(`Rate limit exceeded for user ${request.userId}`);
      this.recordEvent(emailId, request.userId, emailType, 'failed', request.userEmail, {
        reason: 'rate_limited',
        nextAllowedAt: limitInfo.nextAllowedAt?.toISOString(),
      });
      throw new Error(
        `Email rate limit exceeded. Try again after ${limitInfo.nextAllowedAt?.toISOString() || '1 hour'}.`,
      );
    }

    // Check preferences
    if (!this.canSendEmailType(request.userId, emailType)) {
      logger.info(`User ${request.userId} has opted out of ${emailType} emails`);
      return { emailId, queued: false };
    }

    // Queue the email for async delivery
    const queueManager = getQueueManager();
    queueManager.enqueue({
      userId: request.userId,
      deviceId: 'email-service',
      entityType: 'notification' as any,
      entityId: emailId,
      operation: 'create',
      version: 1,
      payload: { emailRequest: request, emailId },
    });

    logger.info(`Email ${emailId} (${emailType}) queued for user ${request.userId}`);

    return { emailId, queued: true };
  }

  /**
   * Actually send the email via the transporter.
   * Called by the queueManager when processing the queue.
   */
  async deliverEmail(emailId: string, request: EmailSendRequest): Promise<{ messageId: string }> {
    const { templateData, userEmail, userId, metadata } = request;
    const emailType = templateData.type;

    try {
      // Render the email template
      const rendered: RenderedEmail = emailTemplates.render(templateData);

      // Send via nodemailer
      const info = await this.transporter.sendMail({
        from: this.config.fromAddress,
        to: userEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text || undefined,
      });

      this.recordEvent(emailId, userId, emailType, 'sent', userEmail, {
        messageId: info.messageId,
        ...metadata,
      });

      logger.info(`Email ${emailId} sent successfully to ${userEmail}, messageId: ${info.messageId}`);

      return { messageId: info.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordEvent(emailId, userId, emailType, 'failed', userEmail, {
        error: errorMessage,
        ...metadata,
      });
      logger.error(`Failed to send email ${emailId} to ${userEmail}:`, error);
      throw error;
    }
  }

  /**
   * Send an email with retry and exponential backoff.
   * Used by the queueManager's process handler.
   */
  async deliverWithRetry(emailId: string, request: EmailSendRequest): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.deliverEmail(emailId, request);
        return result.messageId; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          logger.warn(
            `Email ${emailId} attempt ${attempt}/${this.config.maxRetries} failed, retrying in ${delay}ms`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    logger.error(
      `Email ${emailId} failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    );
    throw lastError;
  }

  // ─── Admin Operations ──────────────────────────────────────────

  /**
   * Admin resend of a specific email.
   * This bypasses rate limiting and preferences.
   */
  async adminResend(
    emailId: string,
    request: EmailSendRequest,
  ): Promise<EmailSendResult> {
    const newEmailId = `email_${Date.now()}_${++this.idCounter}`;
    logger.info(`Admin resend requested for email ${emailId} → new id ${newEmailId}`);

    try {
      const messageId = await this.deliverWithRetry(newEmailId, request);
      return { emailId: newEmailId, queued: false, messageId };
    } catch (error) {
      logger.error(`Admin resend of ${emailId} failed:`, error);
      throw error;
    }
  }

  /**
   * Get all email send history with optional filters.
   */
  getEmailHistory(filter?: {
    userId?: string;
    emailType?: EmailType;
    limit?: number;
  }): EmailEvent[] {
    return this.getEvents(filter);
  }

  /**
   * Reset rate limit for a user (admin function).
   */
  resetRateLimit(userId: string): void {
    this.rateLimitMap.delete(userId);
    logger.info(`Rate limit reset for user ${userId}`);
  }

  /**
   * Clear all tracked events (useful for testing).
   */
  clearEvents(): void {
    this.events = [];
    logger.debug('Email events cleared');
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let emailServiceInstance: EmailService | null = null;

export function getEmailService(configOverrides?: Partial<EmailServiceConfig>): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService(configOverrides);
  }
  return emailServiceInstance;
}

/**
 * Register the queue handler for email delivery.
 * Call this explicitly at app startup (e.g., in index.ts).
 */
export function registerEmailQueueHandler(): void {
  const queueManager = getQueueManager();
  queueManager.setProcessHandler(async (item: QueuedItem) => {
    if (item.payload?.emailRequest) {
      const { emailId, emailRequest } = item.payload as {
        emailId: string;
        emailRequest: EmailSendRequest;
      };
      await getEmailService().deliverWithRetry(emailId, emailRequest);
    }
  });
  logger.info('Email queue handler registered');
}

export { EmailService };
export default EmailService;
