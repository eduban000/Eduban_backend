/**
 * Version Control Utility Functions
 * Helper functions for content version operations
 */

import { Content, ContentVersion } from '../models/Content';
import { ContentVersion as ContentVersionModel, VersionControlUtils, VersionComparison, VersionFilter, VersionHistoryResult } from '../models/ContentVersion';
import logger from './logger';

export class VersionControlService {
  /**
   * Create a new version when content is updated
   */
  static async createVersion(
    content: Content,
    changes: string[],
    createdBy: string,
    autoVersioning: boolean = true
  ): Promise<ContentVersion> {
    try {
      // Check if auto-versioning is enabled
      if (!autoVersioning && !content.version.autoVersioning) {
        logger.info(`Auto-versioning disabled for content ${content.id}, skipping version creation`);
        return null as any;
      }

      // Get next version number
      const nextVersionNumber = VersionControlUtils.getNextVersionNumber(content.version.history);
      
      // Create version snapshot
      const versionSnapshot = VersionControlUtils.createVersionSnapshot(
        content.id,
        content,
        changes,
        createdBy,
        nextVersionNumber
      );

      // Create full version object
      const newVersion: ContentVersion = {
        id: VersionControlUtils.generateVersionId(),
        ...versionSnapshot,
        createdAt: new Date(),
        isCurrent: true
      };

      // Update previous versions to not be current
      content.version.history.forEach(version => {
        version.isCurrent = false;
      });

      // Add new version to history
      content.version.history.push(newVersion);
      
      // Update current version
      content.version.current = nextVersionNumber;
      content.version.lastVersionUpdate = new Date();

      // Clean up old versions if maxVersions is set
      if (content.version.maxVersions > 0) {
        await this.cleanupOldVersions(content);
      }

      logger.info(`Created version ${nextVersionNumber} for content ${content.id}`);
      return newVersion;
    } catch (error) {
      logger.error('Error creating version:', error);
      throw error;
    }
  }

  /**
   * Get version history for content
   */
  static async getVersionHistory(
    contentId: string,
    filter: VersionFilter = {}
  ): Promise<VersionHistoryResult> {
    try {
      // This would typically query the database
      // For now, we'll return a mock implementation
      const versions: ContentVersion[] = []; // Would be fetched from database
      
      let filteredVersions = versions;

      // Apply filters
      if (filter.createdBy) {
        filteredVersions = filteredVersions.filter(v => v.createdBy === filter.createdBy);
      }

      if (filter.isCurrent !== undefined) {
        filteredVersions = filteredVersions.filter(v => v.isCurrent === filter.isCurrent);
      }

      if (filter.versionRange) {
        const { min, max } = filter.versionRange;
        filteredVersions = filteredVersions.filter(v => {
          if (min !== undefined && v.version < min) return false;
          if (max !== undefined && v.version > max) return false;
          return true;
        });
      }

      if (filter.dateRange) {
        const { from, to } = filter.dateRange;
        filteredVersions = filteredVersions.filter(v => {
          if (from && v.createdAt < from) return false;
          if (to && v.createdAt > to) return false;
          return true;
        });
      }

      // Sort
      const sortBy = filter.sortBy || 'version';
      const sortOrder = filter.sortOrder || 'desc';
      
      filteredVersions.sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'version':
            comparison = a.version - b.version;
            break;
          case 'createdAt':
            comparison = a.createdAt.getTime() - b.createdAt.getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
        }
        
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Pagination
      const page = filter.page || 1;
      const limit = filter.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      
      const paginatedVersions = filteredVersions.slice(startIndex, endIndex);

      return {
        versions: paginatedVersions,
        total: filteredVersions.length,
        page,
        limit,
        hasMore: endIndex < filteredVersions.length
      };
    } catch (error) {
      logger.error('Error getting version history:', error);
      throw error;
    }
  }

  /**
   * Compare two versions
   */
  static async compareVersions(
    version1Id: string,
    version2Id: string
  ): Promise<VersionComparison> {
    try {
      // This would typically fetch versions from database
      const version1 = {} as ContentVersion; // Would be fetched from database
      const version2 = {} as ContentVersion; // Would be fetched from database

      const comparison = VersionControlUtils.compareVersions(version1, version2);
      
      logger.info(`Compared versions ${version1Id} and ${version2Id}`);
      return comparison;
    } catch (error) {
      logger.error('Error comparing versions:', error);
      throw error;
    }
  }

  /**
   * Restore content to a specific version
   */
  static async restoreVersion(
    contentId: string,
    versionId: string,
    restoreReason?: string,
    restoredBy?: string
  ): Promise<Content> {
    try {
      // This would typically fetch content and version from database
      const content = {} as Content; // Would be fetched from database
      const version = {} as ContentVersion; // Would be fetched from database

      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      // Create a new version with the restored content
      const changes = [
        `Restored to version ${version.version}`,
        restoreReason ? `Reason: ${restoreReason}` : ''
      ].filter(Boolean);

      // Update content with version data
      content.title = version.title;
      content.description = version.description;
      content.content = JSON.parse(JSON.stringify(version.content));
      content.mediaFiles = JSON.parse(JSON.stringify(version.mediaFiles));
      content.updatedAt = new Date();

      // Create a new version for the restoration
      await this.createVersion(content, changes, restoredBy || 'system');

      logger.info(`Restored content ${contentId} to version ${versionId}`);
      return content;
    } catch (error) {
      logger.error('Error restoring version:', error);
      throw error;
    }
  }

  /**
   * Clean up old versions based on maxVersions setting
   */
  private static async cleanupOldVersions(content: Content): Promise<void> {
    try {
      if (content.version.maxVersions <= 0) return;

      const versions = content.version.history.sort((a, b) => b.version - a.version);
      
      if (versions.length > content.version.maxVersions) {
        const versionsToDelete = versions.slice(content.version.maxVersions);
        
        // Remove old versions from history
        content.version.history = versions.slice(0, content.version.maxVersions);
        
        // In a real implementation, you would delete from database here
        logger.info(`Cleaned up ${versionsToDelete.length} old versions for content ${content.id}`);
      }
    } catch (error) {
      logger.error('Error cleaning up old versions:', error);
      throw error;
    }
  }

  /**
   * Get current version of content
   */
  static getCurrentVersion(content: Content): ContentVersion | null {
    return content.version.history.find(v => v.isCurrent) || null;
  }

  /**
   * Get version by version number
   */
  static getVersionByNumber(content: Content, versionNumber: number): ContentVersion | null {
    return content.version.history.find(v => v.version === versionNumber) || null;
  }

  /**
   * Check if content has versions
   */
  static hasVersions(content: Content): boolean {
    return content.version.history.length > 0;
  }

  /**
   * Get version count
   */
  static getVersionCount(content: Content): number {
    return content.version.history.length;
  }

  /**
   * Enable/disable auto-versioning for content
   */
  static setAutoVersioning(content: Content, enabled: boolean): void {
    content.version.autoVersioning = enabled;
    logger.info(`Auto-versioning ${enabled ? 'enabled' : 'disabled'} for content ${content.id}`);
  }

  /**
   * Set maximum versions to keep
   */
  static setMaxVersions(content: Content, maxVersions: number): void {
    content.version.maxVersions = maxVersions;
    logger.info(`Max versions set to ${maxVersions} for content ${content.id}`);
    
    // Clean up old versions if necessary
    if (maxVersions > 0) {
      this.cleanupOldVersions(content);
    }
  }

  /**
   * Export version history
   */
  static exportVersionHistory(content: Content, format: 'json' | 'csv' = 'json'): string {
    try {
      const history = content.version.history;
      
      if (format === 'json') {
        return JSON.stringify(history, null, 2);
      }
      
      if (format === 'csv') {
        const headers = ['Version', 'Title', 'Description', 'Created By', 'Created At', 'Is Current', 'Changes'];
        const rows = history.map(v => [
          v.version,
          v.title,
          v.description,
          v.createdBy,
          v.createdAt.toISOString(),
          v.isCurrent,
          v.changes.join('; ')
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      }
      
      throw new Error(`Unsupported export format: ${format}`);
    } catch (error) {
      logger.error('Error exporting version history:', error);
      throw error;
    }
  }

  /**
   * Calculate version statistics
   */
  static getVersionStatistics(content: Content): {
    totalVersions: number;
    currentVersion: number;
    lastUpdate: Date;
    versionsByCreator: Record<string, number>;
    averageVersionsPerMonth: number;
  } {
    const history = content.version.history;
    const versionsByCreator: Record<string, number> = {};
    
    history.forEach(v => {
      versionsByCreator[v.createdBy] = (versionsByCreator[v.createdBy] || 0) + 1;
    });

    const firstVersion = history[0];
    const monthsSinceFirst = firstVersion 
      ? Math.max(1, (Date.now() - firstVersion.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 1;

    return {
      totalVersions: history.length,
      currentVersion: content.version.current,
      lastUpdate: content.version.lastVersionUpdate,
      versionsByCreator,
      averageVersionsPerMonth: history.length / monthsSinceFirst
    };
  }
}
