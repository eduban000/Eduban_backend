/**
 * Recommendation Service
 * Provides personalized course recommendations based on user behavior and preferences
 */

import {
  Course,
  RecommendationContext,
  Recommendation,
  RecommendationResult,
} from '../models/Course';
import logger from '../utils/logger';

interface UserProfile {
  userId: string;
  enrolledCourses: Set<string>;
  browsedCourses: Map<string, number>; // courseId -> view count
  ratings: Map<string, number>; // courseId -> rating
  preferredCategories: Map<string, number>; // categoryId -> preference score
  lastActive: Date;
}

export class RecommendationService {
  private courseDatabase: Map<string, Course>;
  private userProfiles: Map<string, UserProfile>;
  private collaborativeFilteringData: Map<string, Map<string, number>>; // userId -> courseId -> score

  constructor() {
    this.courseDatabase = new Map();
    this.userProfiles = new Map();
    this.collaborativeFilteringData = new Map();
  }

  /**
   * Get personalized recommendations for a user
   * Uses collaborative filtering, content-based filtering, and popularity metrics
   */
  async getRecommendations(
    context: RecommendationContext,
    limit: number = 10
  ): Promise<RecommendationResult> {
    try {
      logger.info(
        `Generating recommendations for user: ${context.userId}, limit: ${limit}`
      );

      const userProfile = this.getUserOrCreateProfile(context);
      const candidates = this.getRecommendationCandidates(context, userProfile);

      // Score each candidate using multiple recommendation strategies
      const recommendations = await Promise.all(
        candidates.map(async (course) => {
          const score = this.calculateRecommendationScore(course, context, userProfile);
          const reason = this.generateRecommendationReason(
            course,
            context,
            score
          );

          return {
            courseId: course.id,
            course,
            score,
            reason,
          };
        })
      );

      // Sort by score and limit results
      recommendations.sort((a, b) => b.score - a.score);
      const topRecommendations = recommendations.slice(0, limit);

      logger.info(
        `Generated ${topRecommendations.length} recommendations for user: ${context.userId}`
      );

      return {
        recommendations: topRecommendations,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error generating recommendations', error);
      throw error;
    }
  }

  /**
   * Get trending courses across all users
   */
  async getTrendingCourses(limit: number = 10): Promise<Course[]> {
    try {
      const courses = Array.from(this.courseDatabase.values());

      // Score based on recent enrollments and views
      const scored = courses.map((course) => ({
        course,
        score: this.calculateTrendingScore(course),
      }));

      const trending = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.course);

      logger.info(`Retrieved ${trending.length} trending courses`);
      return trending;
    } catch (error) {
      logger.error('Error getting trending courses', error);
      throw error;
    }
  }

  /**
   * Get courses similar to the given course
   */
  async getSimilarCourses(
    courseId: string,
    limit: number = 5
  ): Promise<Recommendation[]> {
    try {
      const baseCourse = this.courseDatabase.get(courseId);
      if (!baseCourse) {
        throw new Error(`Course not found: ${courseId}`);
      }

      logger.info(`Finding similar courses for: ${courseId}`);

      const candidates = Array.from(this.courseDatabase.values()).filter(
        (c) => c.id !== courseId && c.metadata.isPublished
      );

      const similar = candidates.map((course) => ({
        courseId: course.id,
        course,
        score: this.calculateSimilarityScore(baseCourse, course),
        reason: `Similar to ${baseCourse.title}`,
      }));

      const topSimilar = similar
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info(`Found ${topSimilar.length} similar courses`);
      return topSimilar;
    } catch (error) {
      logger.error('Error getting similar courses', error);
      throw error;
    }
  }

  /**
   * Update user profile with activity
   */
  async recordUserActivity(
    userId: string,
    activityType: 'view' | 'enroll' | 'rate' | 'complete',
    courseId: string,
    data?: { rating?: number }
  ): Promise<void> {
    try {
      let profile = this.userProfiles.get(userId);
      if (!profile) {
        profile = {
          userId,
          enrolledCourses: new Set(),
          browsedCourses: new Map(),
          ratings: new Map(),
          preferredCategories: new Map(),
          lastActive: new Date(),
        };
        this.userProfiles.set(userId, profile);
      }

      const course = this.courseDatabase.get(courseId);
      if (!course) {
        throw new Error(`Course not found: ${courseId}`);
      }

      // Update profile based on activity type
      switch (activityType) {
        case 'view':
          profile.browsedCourses.set(
            courseId,
            (profile.browsedCourses.get(courseId) || 0) + 1
          );
          break;
        case 'enroll':
          profile.enrolledCourses.add(courseId);
          break;
        case 'rate':
          if (data?.rating) {
            profile.ratings.set(courseId, data.rating);
          }
          break;
        case 'complete':
          profile.enrolledCourses.add(courseId);
          break;
      }

      // Update category preferences
      const categoryId = course.category.id;
      profile.preferredCategories.set(
        categoryId,
        (profile.preferredCategories.get(categoryId) || 0) + 1
      );

      profile.lastActive = new Date();
      logger.info(
        `Recorded ${activityType} activity for user: ${userId}, course: ${courseId}`
      );
    } catch (error) {
      logger.error('Error recording user activity', error);
      throw error;
    }
  }

  /**
   * Get or create user profile from context
   */
  private getUserOrCreateProfile(context: RecommendationContext): UserProfile {
    let profile = this.userProfiles.get(context.userId);

    if (!profile) {
      profile = {
        userId: context.userId,
        enrolledCourses: new Set(context.enrolledCourseIds),
        browsedCourses: new Map(),
        ratings: new Map(context.ratings.map((r) => [r.courseId, r.rating])),
        preferredCategories: new Map(
          context.preferredCategories.map((cat) => [cat, 1])
        ),
        lastActive: new Date(),
      };

      // Add browsed courses
      context.browsedCourseIds.forEach((courseId) => {
        profile!.browsedCourses.set(courseId, 1);
      });

      this.userProfiles.set(context.userId, profile);
    }

    return profile;
  }

  /**
   * Get candidate courses for recommendation
   * Excludes already enrolled courses
   */
  private getRecommendationCandidates(
    context: RecommendationContext,
    userProfile: UserProfile
  ): Course[] {
    const excludeIds = new Set([
      ...context.enrolledCourseIds,
      ...context.browsedCourseIds,
    ]);

    return Array.from(this.courseDatabase.values()).filter(
      (course) =>
        !excludeIds.has(course.id) &&
        course.metadata.isPublished &&
        course.metadata.maxStudents > course.enrollmentCount
    );
  }

  /**
   * Calculate recommendation score using multiple factors
   */
  private calculateRecommendationScore(
    course: Course,
    context: RecommendationContext,
    userProfile: UserProfile
  ): number {
    let score = 0;

    // Category preference score (highest weight)
    const categoryScore = userProfile.preferredCategories.get(course.category.id) || 0;
    score += categoryScore * 20;

    // Preferred level score
    if (
      context.preferredLevels.length > 0 &&
      context.preferredLevels.includes(course.metadata.level)
    ) {
      score += 30;
    }

    // Course quality score (rating and reviews)
    score += course.rating * 10;
    score += Math.log(course.ratingCount + 1) * 5;

    // Popularity score (enrollment count)
    score += Math.log(course.enrollmentCount + 1) * 8;

    // Skill alignment score (if user has rated similar skill courses)
    const skillMatchCount = course.skills.filter((skill) => {
      // Check if user has shown interest in courses with similar skills
      return Array.from(userProfile.ratings.keys()).some((courseId) => {
        const ratedCourse = this.courseDatabase.get(courseId);
        return ratedCourse && ratedCourse.skills.includes(skill);
      });
    }).length;
    score += skillMatchCount * 15;

    // Collaborative filtering score
    const collaborativeScore = this.getCollaborativeFilteringScore(
      context.userId,
      course
    );
    score += collaborativeScore * 12;

    // Novelty bonus (less popular courses might be interesting)
    const maxEnrollment = Math.max(
      ...Array.from(this.courseDatabase.values()).map((c) => c.enrollmentCount)
    );
    const noveltyScore = 1 - course.enrollmentCount / (maxEnrollment + 1);
    score += noveltyScore * 5;

    // Prerequisite score (courses that build on enrolled courses)
    const prerequisiteMatch = course.metadata.prerequisiteCourses.filter((prereqId) =>
      context.enrolledCourseIds.includes(prereqId)
    ).length;
    score += prerequisiteMatch * 25;

    return score;
  }

  /**
   * Calculate similarity score between two courses
   */
  private calculateSimilarityScore(course1: Course, course2: Course): number {
    let score = 0;

    // Category match (highest weight)
    if (course1.category.id === course2.category.id) {
      score += 40;
    }

    // Level match
    if (course1.metadata.level === course2.metadata.level) {
      score += 20;
    }

    // Instructor match
    if (course1.instructor.id === course2.instructor.id) {
      score += 30;
    }

    // Tag overlap
    const commonTags = course1.tags.filter((tag) =>
      course2.tags.includes(tag)
    ).length;
    score += commonTags * 5;

    // Skill overlap
    const commonSkills = course1.skills.filter((skill) =>
      course2.skills.includes(skill)
    ).length;
    score += commonSkills * 8;

    // Language match
    if (course1.metadata.language === course2.metadata.language) {
      score += 10;
    }

    // Quality difference (similar quality courses)
    const ratingDiff = Math.abs(course1.rating - course2.rating);
    if (ratingDiff < 0.5) {
      score += 15;
    }

    return score;
  }

  /**
   * Calculate trending score based on recent activity
   */
  private calculateTrendingScore(course: Course): number {
    let score = 0;

    // Enrollment count growth
    score += Math.log(course.enrollmentCount + 1) * 10;

    // Rating
    score += course.rating * 8;

    // Recency bonus
    const ageInDays =
      (new Date().getTime() - course.metadata.createdAt.getTime()) /
      (1000 * 60 * 60 * 24);
    if (ageInDays < 30) {
      score += 50;
    } else if (ageInDays < 90) {
      score += 20;
    }

    return score;
  }

  /**
   * Calculate collaborative filtering score
   * Based on what similar users have liked
   */
  private getCollaborativeFilteringScore(userId: string, course: Course): number {
    const userScores = this.collaborativeFilteringData.get(userId);
    if (!userScores) {
      return 0;
    }

    // Find similar users (users who have rated similar courses highly)
    let similarUserScore = 0;
    let similarUserCount = 0;

    this.collaborativeFilteringData.forEach((otherUserScores, otherUserId) => {
      if (otherUserId === userId) return;

      // Check for common rated courses
      const commonCourses = Array.from(userScores.keys()).filter((courseId) =>
        otherUserScores.has(courseId)
      );

      if (commonCourses.length > 0) {
        // Similar user found
        const otherUserCourseScore = otherUserScores.get(course.id) || 0;
        similarUserScore += otherUserCourseScore;
        similarUserCount++;
      }
    });

    return similarUserCount > 0 ? similarUserScore / similarUserCount : 0;
  }

  /**
   * Generate a human-readable reason for the recommendation
   */
  private generateRecommendationReason(
    course: Course,
    context: RecommendationContext,
    score: number
  ): string {
    const reasons: string[] = [];

    // Category-based reason
    if (context.preferredCategories.includes(course.category.id)) {
      reasons.push(
        `Popular in ${course.category.name} category you follow`
      );
    }

    // Level-based reason
    if (context.preferredLevels.includes(course.metadata.level)) {
      reasons.push(`Perfect ${course.metadata.level} course for your level`);
    }

    // Instructor-based reason
    reasons.push(
      `Taught by highly-rated instructor ${course.instructor.name}`
    );

    // Popularity reason
    if (course.enrollmentCount > 5000) {
      reasons.push(`Popular course with ${course.enrollmentCount}+ students`);
    }

    // Skill-based reason
    if (course.skills.length > 0) {
      reasons.push(`Learn in-demand skills: ${course.skills.slice(0, 2).join(', ')}`);
    }

    return reasons.length > 0
      ? reasons[0]
      : 'Based on your interests and learning preferences';
  }

  /**
   * Add a course to the database
   */
  async addCourse(course: Course): Promise<void> {
    this.courseDatabase.set(course.id, course);
    logger.info(`Course added to recommendation index: ${course.id}`);
  }

  /**
   * Update a course in the database
   */
  async updateCourse(course: Course): Promise<void> {
    this.courseDatabase.set(course.id, course);
    logger.info(`Course updated in recommendation index: ${course.id}`);
  }

  /**
   * Remove a course from the database
   */
  async removeCourse(courseId: string): Promise<void> {
    this.courseDatabase.delete(courseId);
    logger.info(`Course removed from recommendation index: ${courseId}`);
  }
}

export default new RecommendationService();
