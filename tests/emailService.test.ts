/**
 * Email Service Tests
 * Comprehensive test suite for the email notification service.
 * Covers: template rendering, email sending, rate limiting,
 * retry logic, preferences, event tracking, and admin resend.
 */

import { EmailService, getEmailService, DEFAULT_EMAIL_PREFERENCES } from '../src/services/emailService';
import { emailTemplates, EmailTemplates } from '../src/services/emailTemplates';

// Mock nodemailer to avoid actual email sending
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'mock-message-id-123',
      accepted: ['test@example.com'],
      rejected: [],
    }),
  }),
}));

// Mock queueManager
jest.mock('../src/services/queueManager', () => {
  const queue: any[] = [];
  return {
    getQueueManager: jest.fn().mockReturnValue({
      enqueue: jest.fn((item: any) => {
        queue.push(item);
        return `q_${Date.now()}`;
      }),
      setProcessHandler: jest.fn(),
      getPendingCount: jest.fn(() => queue.length),
      getPendingItems: jest.fn(() => [...queue]),
    }),
  };
});

/**
 * Helper to create a fresh EmailService with a given SMTP config.
 */
function createTestEmailService(overrides?: Partial<any>): EmailService {
  return new EmailService({
    provider: 'smtp',
    maxEmailsPerHour: 10,
    maxRetries: 3,
    retryDelayMs: 100,
    fromAddress: 'test@eduban.edu',
    ...overrides,
  });
}

/**
 * Build minimal valid template data for each type.
 */
function enrollmentTemplateData(overrides?: Partial<any>) {
  return {
    studentName: 'Test User',
    courseName: 'Test Course',
    instructorName: 'Dr. Smith',
    enrollmentId: 'ENR-001',
    startDate: '2026-07-01',
    courseUrl: 'https://example.com',
    unsubscribeUrl: 'https://example.com/settings',
    privacyUrl: 'https://example.com/privacy',
    ...overrides,
  };
}

describe('Email Templates', () => {
  describe('Template Rendering', () => {
    it('should render enrollment confirmation template with HTML and text', () => {
      const rendered = emailTemplates.render({
        type: 'enrollmentConfirmation',
        data: enrollmentTemplateData({ studentName: 'John Doe', courseName: 'Blockchain 101' }),
      });

      expect(rendered.html).toBeDefined();
      expect(rendered.text).toBeDefined();
      expect(rendered.subject).toBeDefined();
      expect(rendered.html).toContain('John Doe');
      expect(rendered.html).toContain('Blockchain 101');
      expect(rendered.text).toContain('John Doe');
      expect(rendered.text).toContain('Blockchain 101');
      expect(rendered.subject).toContain('Blockchain 101');
    });

    it('should render credential issued template', () => {
      const rendered = emailTemplates.render({
        type: 'credentialIssued',
        data: {
          studentName: 'Jane Smith',
          credentialName: 'Blockchain Fundamentals',
          credentialId: 'CRED-456',
          courseName: 'Blockchain 101',
          issueDate: '2026-07-01',
          txHash: '0xabc123def456',
          credentialUrl: 'https://eduban.edu/credentials/456',
          verifyUrl: 'https://eduban.edu/verify/456',
          unsubscribeUrl: 'https://eduban.edu/settings',
          privacyUrl: 'https://eduban.edu/privacy',
        },
      });

      expect(rendered.html).toContain('Jane Smith');
      expect(rendered.html).toContain('CRED-456');
      expect(rendered.html).toContain('Blockchain Fundamentals');
      expect(rendered.text).toContain('Jane Smith');
      expect(rendered.text).toContain('0xabc123def456');
      expect(rendered.subject).toContain('Blockchain Fundamentals');
    });

    it('should render payment receipt template', () => {
      const rendered = emailTemplates.render({
        type: 'paymentReceipt',
        data: {
          studentName: 'Bob Johnson',
          transactionId: 'TXN-789',
          amount: '99.99',
          currency: 'USD',
          courseName: 'Smart Contracts 201',
          paymentMethod: 'Stellar',
          paymentDate: '2026-07-01',
          txHash: '0xdef456',
          receiptUrl: 'https://eduban.edu/receipts/789',
          unsubscribeUrl: 'https://eduban.edu/settings',
          privacyUrl: 'https://eduban.edu/privacy',
        },
      });

      expect(rendered.html).toContain('99.99');
      expect(rendered.html).toContain('USD');
      expect(rendered.html).toContain('Smart Contracts 201');
      expect(rendered.text).toContain('TXN-789');
      expect(rendered.text).toContain('99.99');
    });

    it('should render assignment graded template', () => {
      const rendered = emailTemplates.render({
        type: 'assignmentGraded',
        data: {
          studentName: 'Alice Brown',
          assignmentTitle: 'Final Project',
          courseName: 'Blockchain 101',
          earnedPoints: 85,
          totalPoints: 100,
          percentage: 85,
          letterGrade: 'B',
          feedback: 'Great work on the smart contract!',
          assignmentUrl: 'https://eduban.edu/assignments/final',
          unsubscribeUrl: 'https://eduban.edu/settings',
          privacyUrl: 'https://eduban.edu/privacy',
        },
      });

      expect(rendered.html).toContain('Final Project');
      expect(rendered.html).toContain('Alice Brown');
      expect(rendered.text).toContain('85');
      expect(rendered.text).toContain('Great work');
      expect(rendered.subject).toContain('Final Project');
      expect(rendered.subject).toContain('B');
    });

    it('should render password changed template', () => {
      const rendered = emailTemplates.render({
        type: 'passwordChanged',
        data: {
          studentName: 'Charlie Davis',
          changeDate: '2026-07-01T12:00:00Z',
          ipAddress: '192.168.1.1',
          securityUrl: 'https://eduban.edu/security',
          unsubscribeUrl: 'https://eduban.edu/settings',
          privacyUrl: 'https://eduban.edu/privacy',
        },
      });

      expect(rendered.html).toContain('Charlie Davis');
      expect(rendered.html).toContain('192.168.1.1');
      expect(rendered.text).toContain('password was changed');
      expect(rendered.text).toContain('192.168.1.1');
    });

    it('should render new login alert template with location details', () => {
      const rendered = emailTemplates.render({
        type: 'newLoginAlert',
        data: {
          studentName: 'Diana Evans',
          loginDate: '2026-07-01T12:00:00Z',
          userAgent: 'Chrome/120.0',
          ipAddress: '10.0.0.1',
          location: 'Lagos, Nigeria',
          unrecognizedDevice: true,
          securityUrl: 'https://eduban.edu/security',
          unsubscribeUrl: 'https://eduban.edu/settings',
          privacyUrl: 'https://eduban.edu/privacy',
        },
      });

      expect(rendered.html).toContain('Diana Evans');
      expect(rendered.html).toContain('10.0.0.1');
      expect(rendered.html).toContain('Lagos, Nigeria');
      expect(rendered.text).toContain('Lagos, Nigeria');
      expect(rendered.text).toContain('Unrecognized device');
    });
  });

  describe('Template Subject Lines', () => {
    it('should generate correct subject for each template type', () => {
      const enrollSubject = emailTemplates.render({
        type: 'enrollmentConfirmation',
        data: enrollmentTemplateData({ studentName: 'Test', courseName: 'Blockchain 101' }),
      });
      expect(enrollSubject.subject).toContain('Blockchain 101');

      const credentialSubject = emailTemplates.render({
        type: 'credentialIssued',
        data: {
          studentName: 'Test', credentialName: 'Expert Badge', credentialId: 'CRED-1',
          courseName: 'Course', issueDate: '2026-07-01', txHash: '0x1',
          credentialUrl: 'https://example.com', verifyUrl: 'https://example.com/verify',
          unsubscribeUrl: 'https://example.com/settings', privacyUrl: 'https://example.com/privacy',
        },
      });
      expect(credentialSubject.subject).toContain('Expert Badge');
    });
  });
});

describe('Email Service — Preferences', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = createTestEmailService();
    emailService.clearEvents();
  });

  it('should return default preferences for new users', () => {
    const prefs = emailService.getUserPreferences('user-1');
    expect(prefs).toEqual(DEFAULT_EMAIL_PREFERENCES);
    expect(prefs.enrollmentConfirmation).toBe(true);
    expect(prefs.credentialIssued).toBe(true);
  });

  it('should update user preferences', () => {
    emailService.setUserPreferences('user-1', { assignmentGraded: false });
    const prefs = emailService.getUserPreferences('user-1');
    expect(prefs.assignmentGraded).toBe(false);
    expect(prefs.enrollmentConfirmation).toBe(true);
  });

  it('should never opt out of security emails', () => {
    emailService.setUserPreferences('user-1', {
      passwordChanged: false,
      newLoginAlert: false,
    });
    expect(emailService.canSendEmailType('user-1', 'passwordChanged')).toBe(true);
    expect(emailService.canSendEmailType('user-1', 'newLoginAlert')).toBe(true);
  });

  it('should respect opt-out for non-security emails', () => {
    emailService.setUserPreferences('user-1', { assignmentGraded: false });
    expect(emailService.canSendEmailType('user-1', 'assignmentGraded')).toBe(false);
    expect(emailService.canSendEmailType('user-1', 'enrollmentConfirmation')).toBe(true);
  });
});

describe('Email Service — Rate Limiting', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = createTestEmailService();
    emailService.clearEvents();
  });

  it('should start with count 0', () => {
    const result = emailService.getRateLimitInfo('user-1');
    expect(result.count).toBe(0);
  });

  it('should track emails sent via rate limit map', async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await emailService.sendEmail({
          userId: 'user-rate',
          userEmail: 'test@example.com',
          templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData() },
        });
      } catch (e) {
        // May throw if rate limited
      }
    }
    const info = emailService.getRateLimitInfo('user-rate');
    expect(info.count).toBeGreaterThan(0);
  });

  it('should reset rate limit', () => {
    emailService.getRateLimitInfo('user-reset');
    emailService.resetRateLimit('user-reset');
    const info = emailService.getRateLimitInfo('user-reset');
    expect(info.count).toBe(0);
  });
});

describe('Email Service — Sending (Queuing)', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = createTestEmailService();
    emailService.clearEvents();
  });

  it('should queue an email for delivery', async () => {
    const result = await emailService.sendEmail({
      userId: 'user-1',
      userEmail: 'test@example.com',
      templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData() },
    });
    expect(result.emailId).toMatch(/^email_/);
    expect(result.queued).toBe(true);
  });

  it('should respect email preferences and skip queuing', async () => {
    emailService.setUserPreferences('user-2', { enrollmentConfirmation: false });
    const result = await emailService.sendEmail({
      userId: 'user-2',
      userEmail: 'test@example.com',
      templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData() },
    });
    expect(result.queued).toBe(false);
  });

  it('should always queue security emails regardless of preferences', async () => {
    emailService.setUserPreferences('user-3', { passwordChanged: false });
    const result = await emailService.sendEmail({
      userId: 'user-3',
      userEmail: 'test@example.com',
      templateData: {
        type: 'passwordChanged',
        data: {
          studentName: 'Test',
          changeDate: new Date().toISOString(),
          ipAddress: '127.0.0.1',
          securityUrl: 'https://example.com/security',
          unsubscribeUrl: 'https://example.com/settings',
          privacyUrl: 'https://example.com/privacy',
        },
      },
    });
    expect(result.queued).toBe(true);
  });
});

describe('Email Service — Delivery & Retry', () => {
  it('should deliver email and record sent event', async () => {
    const service = createTestEmailService();
    service.clearEvents();

    await service.deliverEmail('email-evt-test', {
      userId: 'user-events',
      userEmail: 'events@example.com',
      templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData({ studentName: 'Event User' }) },
    });

    const events = service.getEvents({ userId: 'user-events' });
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('sent');
    expect(events[0].emailType).toBe('enrollmentConfirmation');
  });

  it('should retry on failure with exponential backoff', async () => {
    // Re-mock nodemailer for this test only, then restore afterward
    const nodemailer = require('nodemailer');

    let callCount = 0;
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ messageId: 'success-after-retry' });
      }),
    });

    const service = new EmailService({
      provider: 'smtp',
      maxRetries: 3,
      retryDelayMs: 10,
    });

    const messageId = await service.deliverWithRetry('email-test-1', {
      userId: 'user-1',
      userEmail: 'test@example.com',
      templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData() },
    });

    expect(callCount).toBe(3);
    expect(messageId).toBe('success-after-retry');

    // Restore default mock to avoid breaking subsequent tests
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({
        messageId: 'mock-message-id-123',
        accepted: ['test@example.com'],
        rejected: [],
      }),
    });
  });

  it('should throw after exhausting all retries', async () => {
    const nodemailer = require('nodemailer');

    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('Permanent failure')),
    });

    const service = new EmailService({
      provider: 'smtp',
      maxRetries: 2,
      retryDelayMs: 10,
    });

    await expect(
      service.deliverWithRetry('email-fail', {
        userId: 'user-1',
        userEmail: 'test@example.com',
        templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData() },
      }),
    ).rejects.toThrow('Permanent failure');

    // Restore default mock
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({
        messageId: 'mock-message-id-123',
        accepted: ['test@example.com'],
        rejected: [],
      }),
    });
  });
});

describe('Email Service — Event Tracking', () => {
  it('should record sent events after deliverEmail', async () => {
    const service = createTestEmailService();
    service.clearEvents();

    await service.deliverEmail('evt-1', {
      userId: 'events-user',
      userEmail: 'events@example.com',
      templateData: {
        type: 'credentialIssued',
        data: {
          studentName: 'Event User', credentialName: 'Test Credential', credentialId: 'EVT-001',
          courseName: 'Test Course', issueDate: '2026-07-01', txHash: '0xabc',
          credentialUrl: 'https://example.com', verifyUrl: 'https://example.com/verify',
          unsubscribeUrl: 'https://example.com/settings', privacyUrl: 'https://example.com/privacy',
        },
      },
    });

    const events = service.getEvents({ userId: 'events-user' });
    expect(events.length).toBe(1);
    expect(events[0].recipient).toBe('events@example.com');
  });

  it('should filter events by email type', async () => {
    const service = createTestEmailService();
    service.clearEvents();

    await service.deliverEmail('fil-1', {
      userId: 'filter-user',
      userEmail: 'filter@example.com',
      templateData: {
        type: 'credentialIssued',
        data: {
          studentName: 'Filter', credentialName: 'Cred', credentialId: 'FIL-001',
          courseName: 'Course', issueDate: '2026-07-01', txHash: '0x1',
          credentialUrl: 'https://example.com', verifyUrl: 'https://example.com/verify',
          unsubscribeUrl: 'https://example.com/settings', privacyUrl: 'https://example.com/privacy',
        },
      },
    });

    const events = service.getEvents({ emailType: 'credentialIssued' });
    expect(events.length).toBe(1);
    events.forEach(e => expect(e.emailType).toBe('credentialIssued'));
  });

  it('should return empty array when no events match filter', () => {
    const service = createTestEmailService();
    service.clearEvents();
    const events = service.getEvents({ userId: 'non-existent' });
    expect(events).toEqual([]);
  });
});

describe('Email Service — Admin Operations', () => {
  it('should allow admin to resend emails and return messageId', async () => {
    const service = createTestEmailService();
    service.clearEvents();

    const result = await service.adminResend('old-email-id', {
      userId: 'admin-test',
      userEmail: 'admin@example.com',
      templateData: { type: 'enrollmentConfirmation', data: enrollmentTemplateData({ studentName: 'Admin Test' }) },
    });

    expect(result.emailId).toMatch(/^email_/);
    expect(result.messageId).toBeDefined();
  });

  it('should get email history as an array', () => {
    const service = createTestEmailService();
    const history = service.getEmailHistory({ limit: 10 });
    expect(Array.isArray(history)).toBe(true);
  });
});
