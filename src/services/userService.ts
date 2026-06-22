import { UserProfile, Achievement, PrivacyLevel, UserStats, UserRole } from '../models/User';
import { UserSettings, DEFAULT_SETTINGS } from '../models/Settings';
import logger from '../utils/logger';

class UserService {
  // In-memory storage for settings (replace with DB in production)
  private settingsStore: Map<string, UserSettings> = new Map();

  /**
   * Get user profile from smart contract
   */
  async getProfile(address: string): Promise<UserProfile | null> {
    try {
      logger.info(`Fetching profile for ${address}`);
      
      // TODO: Integrate with Soroban SDK to fetch from UserProfileContract
      // const profile = await contract.getProfile(address);
      
      // Mock response for development
      return {
        owner: address,
        username: 'student_one',
        email: 'student@starked.edu',
        bio: 'Lifelong learner exploring the Stellar ecosystem',
        avatarUrl: 'https://example.com/avatar.png',
        createdAt: Date.now() - 10000000,
        updatedAt: Date.now(),
        achievements: [1, 2],
        credentials: [101],
        reputation: 50,
        privacyLevel: PrivacyLevel.Public,
        role: UserRole.STUDENT
      };
    } catch (error) {
      logger.error(`Error fetching profile for ${address}`, error);
      throw error;
    }
  }

  /**
   * Update user profile on smart contract
   */
  async updateProfile(address: string, data: Partial<UserProfile>): Promise<UserProfile> {
    try {
      logger.info(`Updating profile for ${address}`);
      
      // TODO: Integrate with Soroban SDK to invoke create_or_update_profile
      // await contract.updateProfile(address, data);
      
      return {
        owner: address,
        username: data.username || 'student_one',
        email: data.email,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        createdAt: Date.now() - 10000000,
        updatedAt: Date.now(),
        achievements: [1, 2],
        credentials: [101],
        reputation: 50,
        privacyLevel: data.privacyLevel || PrivacyLevel.Public,
        role: data.role || UserRole.STUDENT
      };
    } catch (error) {
      logger.error(`Error updating profile for ${address}`, error);
      throw error;
    }
  }

  /**
   * Get user settings (off-chain)
   */
  async getSettings(userId: string): Promise<UserSettings> {
    if (!this.settingsStore.has(userId)) {
      return {
        userId,
        ...DEFAULT_SETTINGS,
        updatedAt: new Date()
      };
    }
    return this.settingsStore.get(userId)!;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings(userId);
    const updated = {
      ...current,
      ...settings,
      userId,
      updatedAt: new Date()
    };
    
    this.settingsStore.set(userId, updated);
    logger.info(`Updated settings for user ${userId}`);
    return updated;
  }

  /**
   * Get user achievements
   */
  async getAchievements(address: string): Promise<Achievement[]> {
    try {
      logger.info(`Fetching achievements for ${address}`);
      // TODO: Fetch from smart contract using get_user_achievements
      return [];
    } catch (error) {
      logger.error(`Error fetching achievements for ${address}`, error);
      throw error;
    }
  }

  async getProfileStats(address: string): Promise<UserStats> {
    const userProfile = await this.getProfile(address);
    if (!userProfile) {
      return { totalCourses: 0, totalCredentials: 0, totalAchievements: 0, reputation: 0 };
    }

    return { 
      totalCourses: 5, // Mock: In production, fetch from CourseService
      totalCredentials: userProfile.credentials.length, 
      totalAchievements: userProfile.achievements.length, 
      reputation: userProfile.reputation 
    };
  }
}

export const userService = new UserService();