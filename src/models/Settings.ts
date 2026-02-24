export interface NotificationSettings {
  email: boolean;
  push: boolean;
  marketing: boolean;
  courseUpdates: boolean;
}

export interface DisplaySettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  compactMode: boolean;
}

export interface PrivacySettings {
  showEmail: boolean;
  showCourses: boolean;
  showAchievements: boolean;
  allowFriendRequests: boolean;
}

export interface UserSettings {
  userId: string;
  notifications: NotificationSettings;
  display: DisplaySettings;
  privacy: PrivacySettings;
  updatedAt: Date;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'userId' | 'updatedAt'> = {
  notifications: {
    email: true,
    push: true,
    marketing: false,
    courseUpdates: true,
  },
  display: {
    theme: 'system',
    language: 'en',
    compactMode: false,
  },
  privacy: {
    showEmail: false,
    showCourses: true,
    showAchievements: true,
    allowFriendRequests: true,
  },
};