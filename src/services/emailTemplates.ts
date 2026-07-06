import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Template variable placeholders for each email type
 */
export interface EnrollmentConfirmationData {
  studentName: string;
  courseName: string;
  instructorName: string;
  enrollmentId: string;
  startDate: string;
  courseUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export interface CredentialIssuedData {
  studentName: string;
  credentialName: string;
  credentialId: string;
  courseName: string;
  issueDate: string;
  txHash: string;
  credentialUrl: string;
  verifyUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export interface PaymentReceiptData {
  studentName: string;
  transactionId: string;
  amount: string;
  currency: string;
  courseName: string;
  paymentMethod: string;
  paymentDate: string;
  txHash?: string;
  receiptUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export interface AssignmentGradedData {
  studentName: string;
  assignmentTitle: string;
  courseName: string;
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  letterGrade: string;
  feedback?: string;
  assignmentUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export interface PasswordChangedData {
  studentName: string;
  changeDate: string;
  ipAddress: string;
  securityUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export interface NewLoginAlertData {
  studentName: string;
  loginDate: string;
  userAgent: string;
  ipAddress: string;
  location: string;
  unrecognizedDevice: boolean;
  securityUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
}

export type EmailTemplateData =
  | { type: 'enrollmentConfirmation'; data: EnrollmentConfirmationData }
  | { type: 'credentialIssued'; data: CredentialIssuedData }
  | { type: 'paymentReceipt'; data: PaymentReceiptData }
  | { type: 'assignmentGraded'; data: AssignmentGradedData }
  | { type: 'passwordChanged'; data: PasswordChangedData }
  | { type: 'newLoginAlert'; data: NewLoginAlertData }
  | { type: 'newsletterWelcome'; data: NewsletterWelcomeData };

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
}

export interface NewsletterWelcomeData{
  unsubscribeUrl: string;
  privacyUrl: string;
}

const TEMPLATE_DIR = path.resolve(__dirname, '../templates/emails');

const TEMPLATE_SUBJECTS: Record<string, string> = {
  enrollmentConfirmation: '🎓 Enrollment Confirmed — Welcome to {{courseName}}!',
  credentialIssued: '🏆 New Credential Issued — {{credentialName}}',
  paymentReceipt: '💳 Payment Receipt — {{courseName}}',
  assignmentGraded: '📝 Assignment Graded — {{assignmentTitle}} ({{letterGrade}})',
  passwordChanged: '🔒 Your Eduban Password Has Been Changed',
  newLoginAlert: '🔑 New Login to Your Eduban Account',
  newsletterWelcome: '👋 Welcome to the Eduban Newsletter!',
};

const TEMPLATE_SIMPLE_TEXT: Record<string, (data: any) => string> = {
  enrollmentConfirmation: (data: EnrollmentConfirmationData) =>
    `Hi ${data.studentName},\n\n` +
    `Your enrollment in "${data.courseName}" has been confirmed!\n\n` +
    `Course: ${data.courseName}\n` +
    `Instructor: ${data.instructorName}\n` +
    `Enrollment ID: ${data.enrollmentId}\n` +
    `Start Date: ${data.startDate}\n\n` +
    `Get started: ${data.courseUrl}\n\n` +
    `— The Eduban Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  credentialIssued: (data: CredentialIssuedData) =>
    `Hi ${data.studentName},\n\n` +
    `Congratulations! You've earned a new credential on Eduban.\n\n` +
    `Credential: ${data.credentialName}\n` +
    `Credential ID: ${data.credentialId}\n` +
    `Course: ${data.courseName}\n` +
    `Issued: ${data.issueDate}\n` +
    `Transaction Hash: ${data.txHash}\n\n` +
    `View credential: ${data.credentialUrl}\n` +
    `Verify on blockchain: ${data.verifyUrl}\n\n` +
    `— The Eduban Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  paymentReceipt: (data: PaymentReceiptData) =>
    `Hi ${data.studentName},\n\n` +
    `Your payment has been processed successfully.\n\n` +
    `Transaction ID: ${data.transactionId}\n` +
    `Amount: ${data.amount} ${data.currency}\n` +
    `Course: ${data.courseName}\n` +
    `Payment Method: ${data.paymentMethod}\n` +
    `Date: ${data.paymentDate}\n` +
    (data.txHash ? `Transaction Hash: ${data.txHash}\n` : '') +
    `\nDownload receipt: ${data.receiptUrl}\n\n` +
    `— The Eduban Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  assignmentGraded: (data: AssignmentGradedData) =>
    `Hi ${data.studentName},\n\n` +
    `Your assignment "${data.assignmentTitle}" has been graded.\n\n` +
    `Course: ${data.courseName}\n` +
    `Grade: ${data.earnedPoints}/${data.totalPoints} (${data.percentage}%)\n` +
    `Letter Grade: ${data.letterGrade}\n` +
    (data.feedback ? `Feedback: "${data.feedback}"\n` : '') +
    `\nView assignment: ${data.assignmentUrl}\n\n` +
    `— The Eduban Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  passwordChanged: (data: PasswordChangedData) =>
    `Hi ${data.studentName},\n\n` +
    `Your Eduban account password was changed successfully.\n\n` +
    `Date: ${data.changeDate}\n` +
    `IP Address: ${data.ipAddress}\n\n` +
    `If you made this change, no further action is required.\n` +
    `If you did NOT change your password, please secure your account immediately:\n` +
    `${data.securityUrl}\n\n` +
    `— The Eduban Security Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  newLoginAlert: (data: NewLoginAlertData) =>
    `Hi ${data.studentName},\n\n` +
    `A new sign-in to your Eduban account was detected.\n\n` +
    `Date: ${data.loginDate}\n` +
    `Device/Browser: ${data.userAgent}\n` +
    `IP Address: ${data.ipAddress}\n` +
    `Location: ${data.location}\n` +
    (data.unrecognizedDevice ? '\n⚠️ Unrecognized device! If this wasn\'t you, secure your account now.\n' : '') +
    `\nReview activity: ${data.securityUrl}\n` +
    `If this was you, you can safely ignore this email.\n\n` +
    `— The Eduban Security Team\n\n` +
    `Manage preferences: ${data.unsubscribeUrl}`,

  newsletterWelcome: (data: NewsletterWelcomeData) =>
    `Welcome!\n\nThank you for subscribing to the Eduban Newsletter.\n\n` +
    `- The Eduban Team\n\n` +
    `Unsubscribe: ${data.unsubscribeUrl}\n` +
    `Privacy Policy: ${data.privacyUrl}`,
};

/**
 * Simple Handlebars-style template rendering.
 * Replaces {{variableName}} placeholders in the template string.
 */
function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim();
    return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : '';
  });
}

/**
 * Handlebars-style block helpers for conditional blocks.
 * Supports {{#key}}...{{/key}} syntax.
 */
function renderConditionals(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key: string, content: string) => {
    const value = data[key.trim()];
    if (value === undefined || value === null || value === false || value === '') {
      return '';
    }
    return content;
  });
}

class EmailTemplates {
  private templateCache: Map<string, string> = new Map();

  /**
   * Load an HTML template from disk with caching.
   */
  private loadTemplate(templateName: string): string {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const filePath = path.join(TEMPLATE_DIR, `${templateName}.html`);
    try {
      const html = fs.readFileSync(filePath, 'utf-8');
      this.templateCache.set(templateName, html);
      return html;
    } catch (error) {
      logger.error(`Failed to load email template "${templateName}":`, error);
      throw new Error(`Email template "${templateName}" not found at ${filePath}`);
    }
  }

  /**
   * Render an email from template data, producing both HTML and plain-text versions.
   */
  render(templateData: EmailTemplateData): RenderedEmail {
    const { type, data } = templateData;

    // Load and render HTML template
    const rawHtml = this.loadTemplate(type);
    // Apply conditionals first, then variable substitution
    const conditionalHtml = renderConditionals(rawHtml, data);
    const html = renderTemplate(conditionalHtml, data);

    // Generate plain-text fallback
    const textGenerator = TEMPLATE_SIMPLE_TEXT[type];
    const text = textGenerator ? textGenerator(data as any) : '';

    // Generate subject line
    const subjectTemplate = TEMPLATE_SUBJECTS[type] || 'Eduban Notification';
    const subject = renderTemplate(subjectTemplate, data as any);

    return { html, text, subject };
  }

  /**
   * Clear the template cache (useful for testing or hot-reload).
   */
  clearCache(): void {
    this.templateCache.clear();
    logger.debug('Email template cache cleared');
  }
}

export { EmailTemplates };
export const emailTemplates = new EmailTemplates();
