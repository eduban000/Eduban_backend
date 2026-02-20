/**
 * Content Version Model
 * Defines the structure for course content version control
 */

import { ContentVersion as IContentVersion } from './Content';

export interface ContentVersion extends IContentVersion {
  // Additional fields can be added here if needed
}

export interface ContentVersionCreateRequest {
  contentId: string;
  title: string;
  description: string;
  content: any;
  changes: string[];
  createdBy: string;
}

export interface ContentVersionUpdateRequest {
  title?: string;
  description?: string;
  content?: any;
  changes?: string[];
}

export interface VersionComparison {
  version1: ContentVersion;
  version2: ContentVersion;
  differences: {
    field: string;
    oldValue: any;
    newValue: any;
    changeType: 'added' | 'modified' | 'removed';
  }[];
  summary: {
    totalChanges: number;
    additions: number;
    modifications: number;
    removals: number;
  };
}

export interface VersionRestoreRequest {
  contentId: string;
  versionId: string;
  restoreReason?: string;
  restoredBy: string;
}

export interface VersionFilter {
  contentId?: string;
  createdBy?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  isCurrent?: boolean;
  versionRange?: {
    min?: number;
    max?: number;
  };
  sortBy?: 'version' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface VersionHistoryResult {
  versions: ContentVersion[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface VersionValidationRule {
  field: string;
  rule: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
}

export interface VersionValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
  warnings: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

// Content version validation rules
export const VERSION_VALIDATION_RULES: VersionValidationRule[] = [
  { field: 'contentId', rule: 'required', message: 'Content ID is required' },
  { field: 'version', rule: 'required', message: 'Version number is required' },
  { field: 'title', rule: 'required', message: 'Version title is required' },
  { field: 'title', rule: 'minLength', value: 3, message: 'Title must be at least 3 characters' },
  { field: 'description', rule: 'required', message: 'Version description is required' },
  { field: 'content', rule: 'required', message: 'Version content is required' },
  { field: 'changes', rule: 'required', message: 'Changes list is required' },
  { field: 'createdBy', rule: 'required', message: 'Creator ID is required' },
];

// Helper functions for version operations
export class VersionControlUtils {
  /**
   * Generate a unique version ID
   */
  static generateVersionId(): string {
    return `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the next version number for a content
   */
  static getNextVersionNumber(currentVersions: ContentVersion[]): number {
    if (currentVersions.length === 0) return 1;
    return Math.max(...currentVersions.map(v => v.version)) + 1;
  }

  /**
   * Compare two versions and return differences
   */
  static compareVersions(version1: ContentVersion, version2: ContentVersion): VersionComparison {
    const differences: VersionComparison['differences'] = [];
    
    // Compare title
    if (version1.title !== version2.title) {
      differences.push({
        field: 'title',
        oldValue: version1.title,
        newValue: version2.title,
        changeType: 'modified'
      });
    }

    // Compare description
    if (version1.description !== version2.description) {
      differences.push({
        field: 'description',
        oldValue: version1.description,
        newValue: version2.description,
        changeType: 'modified'
      });
    }

    // Compare content (deep comparison)
    const contentDiff = this.deepCompare(version1.content, version2.content);
    if (contentDiff.length > 0) {
      differences.push({
        field: 'content',
        oldValue: version1.content,
        newValue: version2.content,
        changeType: 'modified'
      });
    }

    // Compare media files
    const mediaDiff = this.compareMediaFiles(version1.mediaFiles, version2.mediaFiles);
    differences.push(...mediaDiff);

    const summary = {
      totalChanges: differences.length,
      additions: differences.filter(d => d.changeType === 'added').length,
      modifications: differences.filter(d => d.changeType === 'modified').length,
      removals: differences.filter(d => d.changeType === 'removed').length
    };

    return {
      version1,
      version2,
      differences,
      summary
    };
  }

  /**
   * Deep comparison of two objects
   */
  private static deepCompare(obj1: any, obj2: any): any[] {
    const differences: any[] = [];
    
    if (obj1 === obj2) return differences;
    
    if (typeof obj1 !== typeof obj2) {
      differences.push({ type: 'type_change', old: typeof obj1, new: typeof obj2 });
      return differences;
    }

    if (obj1 === null || obj2 === null || typeof obj1 !== 'object') {
      if (obj1 !== obj2) {
        differences.push({ type: 'value_change', old: obj1, new: obj2 });
      }
      return differences;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    const allKeys = new Set([...keys1, ...keys2]);

    for (const key of allKeys) {
      if (!(key in obj1)) {
        differences.push({ type: 'added', key, value: obj2[key] });
      } else if (!(key in obj2)) {
        differences.push({ type: 'removed', key, value: obj1[key] });
      } else {
        const nestedDiff = this.deepCompare(obj1[key], obj2[key]);
        if (nestedDiff.length > 0) {
          differences.push({ type: 'nested_change', key, changes: nestedDiff });
        }
      }
    }

    return differences;
  }

  /**
   * Compare media files arrays
   */
  private static compareMediaFiles(files1: any[], files2: any[]): VersionComparison['differences'] {
    const differences: VersionComparison['differences'] = [];
    
    const fileMap1 = new Map(files1.map(f => [f.id, f]));
    const fileMap2 = new Map(files2.map(f => [f.id, f]));

    // Check for added files
    for (const [id, file] of fileMap2) {
      if (!fileMap1.has(id)) {
        differences.push({
          field: 'mediaFiles',
          oldValue: null,
          newValue: file,
          changeType: 'added'
        });
      }
    }

    // Check for removed files
    for (const [id, file] of fileMap1) {
      if (!fileMap2.has(id)) {
        differences.push({
          field: 'mediaFiles',
          oldValue: file,
          newValue: null,
          changeType: 'removed'
        });
      }
    }

    // Check for modified files
    for (const [id, file1] of fileMap1) {
      const file2 = fileMap2.get(id);
      if (file2 && JSON.stringify(file1) !== JSON.stringify(file2)) {
        differences.push({
          field: 'mediaFiles',
          oldValue: file1,
          newValue: file2,
          changeType: 'modified'
        });
      }
    }

    return differences;
  }

  /**
   * Validate version data
   */
  static validateVersion(versionData: Partial<ContentVersion>): VersionValidationResult {
    const errors: VersionValidationResult['errors'] = [];
    const warnings: VersionValidationResult['warnings'] = [];

    for (const rule of VERSION_VALIDATION_RULES) {
      const value = versionData[rule.field as keyof ContentVersion];
      
      if (rule.rule === 'required' && (!value || (Array.isArray(value) && value.length === 0))) {
        errors.push({
          field: rule.field,
          message: rule.message,
          value
        });
      }

      if (rule.rule === 'minLength' && typeof value === 'string' && value.length < (rule.value || 0)) {
        errors.push({
          field: rule.field,
          message: rule.message,
          value
        });
      }

      if (rule.rule === 'maxLength' && typeof value === 'string' && value.length > (rule.value || 0)) {
        errors.push({
          field: rule.field,
          message: rule.message,
          value
        });
      }
    }

    // Additional validations
    if (versionData.version && versionData.version <= 0) {
      errors.push({
        field: 'version',
        message: 'Version number must be positive',
        value: versionData.version
      });
    }

    if (versionData.changes && versionData.changes.length === 0) {
      warnings.push({
        field: 'changes',
        message: 'No changes specified for this version',
        value: versionData.changes
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a version snapshot from content data
   */
  static createVersionSnapshot(
    contentId: string,
    contentData: any,
    changes: string[],
    createdBy: string,
    versionNumber: number
  ): Omit<ContentVersion, 'id' | 'createdAt'> {
    return {
      contentId,
      version: versionNumber,
      title: contentData.title || '',
      description: contentData.description || '',
      content: JSON.parse(JSON.stringify(contentData.content || {})),
      mediaFiles: JSON.parse(JSON.stringify(contentData.mediaFiles || [])),
      changes: [...changes],
      createdBy,
      isCurrent: true,
      publishedAt: contentData.publishedAt
    };
  }
}
