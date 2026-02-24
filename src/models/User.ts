export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  EDUCATOR = 'educator',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export enum PrivacyLevel {
  Public = 'Public',
  Private = 'Private',
  FriendsOnly = 'FriendsOnly',
}

export interface UserProfile {
  owner: string; // Stellar Address
  username: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
  achievements: number[]; // Achievement IDs
  credentials: number[]; // Credential IDs
  reputation: number;
  privacyLevel: PrivacyLevel;
  role: UserRole;
}

export interface Achievement {
  id: number;
  user: string;
  title: string;
  description: string;
  earnedAt: number;
  badgeUrl?: string;
  verified: boolean;
}

export interface UserStats {
  totalCourses: number;
  totalCredentials: number;
  totalAchievements: number;
  reputation: number;
}

/**
 * Email notification preferences per event type.
 * Security emails (passwordChanged, newLoginAlert) cannot be opted out.
 */
export interface EmailPreferences {
  enrollmentConfirmation: boolean;
  credentialIssued: boolean;
  paymentReceipt: boolean;
  assignmentGraded: boolean;
  passwordChanged: boolean;
  newLoginAlert: boolean;
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  enrollmentConfirmation: true,
  credentialIssued: true,
  paymentReceipt: true,
  assignmentGraded: true,
  passwordChanged: true,
  newLoginAlert: true,
};