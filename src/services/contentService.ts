/**
 * Content Service
 * Handles business logic for content management and storage
 */

import { 
  Content, 
  ContentType, 
  ContentStatus, 
  MediaFile, 
  ContentVersion,
  ContentFilter,
  ContentCreateRequest,
  ContentUpdateRequest,
  ContentValidationResult,
  BulkOperation,
  ContentExportOptions,
  ContentImportResult,
  CONTENT_VALIDATION_RULES
} from '../models/Content';
import { MediaService } from './mediaService';
import logger from '../utils/logger';

export class ContentService {
  constructor(private mediaService: MediaService) {}

  /**
   * Create new content
   */
  async createContent(request: ContentCreateRequest, createdBy: string): Promise<Content> {
    try {
      // Validate content
      const validation = this.validateContent(request.type, {
        title: request.title,
        description: request.description,
        content: request.content,
        estimatedDuration: request.estimatedDuration
      });

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      const content: Content = {
        id: this.generateContentId(),
        courseId: request.courseId as string,
        moduleId: request.moduleId,
        type: request.type,
        title: request.title,
        description: request.description,
        content: request.content,
        status: ContentStatus.DRAFT,
        order: await this.getNextOrder(request.courseId, request.moduleId),
        estimatedDuration: request.estimatedDuration,
        mediaFiles: [],
        tags: request.tags || [],
        metadata: {
          difficulty: 'beginner' as const,
          prerequisites: [],
          learningObjectives: [],
          ...request.metadata
        } as any,
        seo: {
          slug: this.generateSlug(request.title),
          ...request.seo
        },
        version: {
          current: 1,
          history: []
        },
        analytics: {
          views: 0,
          completions: 0,
          averageTimeSpent: 0,
          rating: 0,
          ratingCount: 0
        },
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create initial version
      const version: ContentVersion = {
        id: this.generateVersionId(),
        contentId: content.id,
        version: 1,
        title: content.title,
        description: content.description,
        content: content.content,
        mediaFiles: [],
        changes: ['Initial version'],
        createdBy,
        createdAt: new Date(),
        isCurrent: true
      };

      content.version.history.push(version);

      // Process media files if any
      if (request.content && this.hasMediaFiles(request.content)) {
        content.mediaFiles = await this.processEmbeddedMedia(request.content, content.id);
        version.mediaFiles = content.mediaFiles;
      }

      // Store content (in a real implementation, this would save to database)
      logger.info(`Created content: ${content.id} of type ${content.type}`);
      
      return content;
    } catch (error) {
      logger.error('Error creating content:', error);
      throw error;
    }
  }

  /**
   * Update existing content
   */
  async updateContent(
    contentId: string, 
    request: ContentUpdateRequest, 
    updatedBy: string
  ): Promise<Content> {
    try {
      const existingContent = await this.getContentById(contentId);
      if (!existingContent) {
        throw new Error(`Content not found: ${contentId}`);
      }

      // Validate updates
      if (request.title || request.description || request.content || request.estimatedDuration) {
        const validation = this.validateContent(existingContent.type, {
          title: request.title || existingContent.title,
          description: request.description || existingContent.description,
          content: request.content || existingContent.content,
          estimatedDuration: request.estimatedDuration || existingContent.estimatedDuration
        });

        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }
      }

      // Track changes
      const changes: string[] = [];
      if (request.title && request.title !== existingContent.title) {
        changes.push(`Title changed from "${existingContent.title}" to "${request.title}"`);
      }
      if (request.description && request.description !== existingContent.description) {
        changes.push('Description updated');
      }
      if (request.content && JSON.stringify(request.content) !== JSON.stringify(existingContent.content)) {
        changes.push('Content updated');
      }

      // Update content
      const updatedContent = {
        ...existingContent,
        ...request,
        updatedAt: new Date()
      } as Content;

      // Update slug if title changed
      if (request.title) {
        updatedContent.seo.slug = this.generateSlug(request.title);
      }

      // Create new version if there are changes
      if (changes.length > 0) {
        const newVersion: ContentVersion = {
          id: this.generateVersionId(),
          contentId: updatedContent.id,
          version: existingContent.version.current + 1,
          title: updatedContent.title,
          description: updatedContent.description,
          content: updatedContent.content,
          mediaFiles: updatedContent.mediaFiles,
          changes,
          createdBy: updatedBy,
          createdAt: new Date(),
          isCurrent: true
        };

        // Mark previous version as not current
        existingContent.version.history.forEach(v => v.isCurrent = false);
        
        updatedContent.version.current = newVersion.version;
        updatedContent.version.history.push(newVersion);
      }

      logger.info(`Updated content: ${contentId}`);
      return updatedContent;
    } catch (error) {
      logger.error('Error updating content:', error);
      throw error;
    }
  }

  /**
   * Get content by ID
   */
  async getContentById(contentId: string): Promise<Content | null> {
    // In a real implementation, this would query the database
    // For now, return null as placeholder
    logger.info(`Fetching content: ${contentId}`);
    return null;
  }

  /**
   * Get content with filters
   */
  async getContent(filter: ContentFilter): Promise<{ content: Content[]; total: number }> {
    try {
      // In a real implementation, this would query the database with filters
      logger.info('Fetching content with filters:', filter);
      
      // Return empty result as placeholder
      return {
        content: [],
        total: 0
      };
    } catch (error) {
      logger.error('Error fetching content:', error);
      throw error;
    }
  }

  /**
   * Delete content
   */
  async deleteContent(contentId: string, deletedBy: string): Promise<void> {
    try {
      const content = await this.getContentById(contentId);
      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }

      // Soft delete by archiving
      await this.updateContent(contentId, {
        status: ContentStatus.ARCHIVED
      }, deletedBy);

      logger.info(`Deleted content: ${contentId}`);
    } catch (error) {
      logger.error('Error deleting content:', error);
      throw error;
    }
  }

  /**
   * Publish content
   */
  async publishContent(contentId: string, publishedBy: string): Promise<Content> {
    try {
      const content = await this.getContentById(contentId);
      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }

      if (content.status !== ContentStatus.DRAFT && content.status !== ContentStatus.REVIEW) {
        throw new Error('Only draft or review content can be published');
      }

      const publishedContent = await this.updateContent(contentId, {
        status: ContentStatus.PUBLISHED
      }, publishedBy);

      // Set published date on current version
      const currentVersion = publishedContent.version.history.find(v => v.isCurrent);
      if (currentVersion) {
        currentVersion.publishedAt = new Date();
      }

      publishedContent.publishedAt = new Date();

      logger.info(`Published content: ${contentId}`);
      return publishedContent;
    } catch (error) {
      logger.error('Error publishing content:', error);
      throw error;
    }
  }

  /**
   * Perform bulk operations
   */
  async performBulkOperation(operation: BulkOperation, performedBy: string): Promise<void> {
    try {
      switch (operation.operation) {
        case 'publish':
          for (const contentId of operation.contentIds) {
            await this.publishContent(contentId, performedBy);
          }
          break;
        case 'archive':
          for (const contentId of operation.contentIds) {
            await this.updateContent(contentId, {
              status: ContentStatus.ARCHIVED
            }, performedBy);
          }
          break;
        case 'delete':
          for (const contentId of operation.contentIds) {
            await this.deleteContent(contentId, performedBy);
          }
          break;
        case 'updateTags':
          for (const contentId of operation.contentIds) {
            await this.updateContent(contentId, {
              tags: operation.data.tags
            }, performedBy);
          }
          break;
        case 'move':
          for (const contentId of operation.contentIds) {
            await this.updateContent(contentId, {
              courseId: operation.data.courseId as string,
              moduleId: operation.data.moduleId
            } as any, performedBy);
          }
          break;
        default:
          throw new Error(`Unsupported bulk operation: ${operation.operation}`);
      }

      logger.info(`Performed bulk operation: ${operation.operation} on ${operation.contentIds.length} items`);
    } catch (error) {
      logger.error('Error performing bulk operation:', error);
      throw error;
    }
  }

  /**
   * Export content
   */
  async exportContent(options: ContentExportOptions): Promise<Buffer> {
    try {
      const { content } = await this.getContent(options.filters || {});
      
      let exportData: any;

      switch (options.format) {
        case 'json':
          exportData = JSON.stringify({
            exportedAt: new Date().toISOString(),
            totalItems: content.length,
            content: options.includeVersions 
              ? content 
              : content.map(({ version, ...c }) => c)
          }, null, 2);
          break;
        case 'csv':
          exportData = this.generateCSVExport(content);
          break;
        case 'xml':
          exportData = this.generateXMLExport(content);
          break;
        case 'zip':
          exportData = await this.generateZipExport(content, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      logger.info(`Exported ${content.length} content items as ${options.format}`);
      return Buffer.from(exportData);
    } catch (error) {
      logger.error('Error exporting content:', error);
      throw error;
    }
  }

  /**
   * Import content
   */
  async importContent(data: any, format: string, importedBy: string): Promise<ContentImportResult> {
    try {
      const result: ContentImportResult = {
        success: true,
        imported: 0,
        failed: 0,
        errors: [],
        warnings: []
      };

      let contentItems: any[];

      switch (format) {
        case 'json':
          contentItems = Array.isArray(data) ? data : [data];
          break;
        case 'csv':
          contentItems = this.parseCSVImport(data);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      for (let i = 0; i < contentItems.length; i++) {
        try {
          const item = contentItems[i];
          await this.createContent({
            courseId: item.courseId,
            moduleId: item.moduleId,
            type: item.type,
            title: item.title,
            description: item.description,
            content: item.content,
            estimatedDuration: item.estimatedDuration,
            tags: item.tags,
            metadata: item.metadata
          }, importedBy);
          result.imported++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            row: i + 1,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: contentItems[i]
          });
        }
      }

      if (result.failed > 0) {
        result.success = false;
      }

      logger.info(`Import completed: ${result.imported} imported, ${result.failed} failed`);
      return result;
    } catch (error) {
      logger.error('Error importing content:', error);
      throw error;
    }
  }

  /**
   * Validate content
   */
  private validateContent(type: ContentType, data: any): ContentValidationResult {
    const rules = CONTENT_VALIDATION_RULES[type] || [];
    const errors: any[] = [];
    const warnings: any[] = [];

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      
      switch (rule.rule) {
        case 'required':
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            errors.push({
              field: rule.field,
              message: rule.message,
              value
            });
          }
          break;
        case 'minLength':
          if (value && value.length < rule.value) {
            errors.push({
              field: rule.field,
              message: rule.message,
              value
            });
          }
          break;
        case 'maxLength':
          if (value && value.length > rule.value) {
            errors.push({
              field: rule.field,
              message: rule.message,
              value
            });
          }
          break;
        case 'pattern':
          if (value && !new RegExp(rule.value).test(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              value
            });
          }
          break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Generate unique content ID
   */
  private generateContentId(): string {
    return `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique version ID
   */
  private generateVersionId(): string {
    return `version_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate URL-friendly slug
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Get next order number for content
   */
  private async getNextOrder(courseId: string, moduleId?: string): Promise<number> {
    // In a real implementation, this would query the database
    // For now, return 1 as placeholder
    return 1;
  }

  /**
   * Check if content has embedded media files
   */
  private hasMediaFiles(content: any): boolean {
    const contentStr = JSON.stringify(content);
    return contentStr.includes('imageUrl') || 
           contentStr.includes('videoUrl') || 
           contentStr.includes('audioUrl') || 
           contentStr.includes('documentUrl');
  }

  /**
   * Process embedded media files
   */
  private async processEmbeddedMedia(content: any, contentId: string): Promise<MediaFile[]> {
    // In a real implementation, this would extract and process media URLs
    // For now, return empty array
    return [];
  }

  /**
   * Generate CSV export
   */
  private generateCSVExport(content: Content[]): string {
    const headers = [
      'ID', 'Title', 'Type', 'Status', 'Course ID', 'Module ID',
      'Created At', 'Updated At', 'Views', 'Rating'
    ];
    
    const rows = content.map(c => [
      c.id,
      c.title,
      c.type,
      c.status,
      c.courseId,
      c.moduleId || '',
      c.createdAt.toISOString(),
      c.updatedAt.toISOString(),
      c.analytics.views,
      c.analytics.rating
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Generate XML export
   */
  private generateXMLExport(content: Content[]): string {
    // Simple XML generation - in a real implementation, use a proper XML library
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<content>\n';
    
    for (const item of content) {
      xml += `  <item id="${item.id}">\n`;
      xml += `    <title>${this.escapeXml(item.title)}</title>\n`;
      xml += `    <type>${item.type}</type>\n`;
      xml += `    <status>${item.status}</status>\n`;
      xml += `    <description>${this.escapeXml(item.description)}</description>\n`;
      xml += `  </item>\n`;
    }
    
    xml += '</content>';
    return xml;
  }

  /**
   * Generate ZIP export
   */
  private async generateZipExport(content: Content[], options: ContentExportOptions): Promise<Buffer> {
    // In a real implementation, this would create a ZIP file
    // For now, return JSON as placeholder
    return Buffer.from(JSON.stringify(content, null, 2));
  }

  /**
   * Parse CSV import
   */
  private parseCSVImport(data: string): any[] {
    // Simple CSV parsing - in a real implementation, use a proper CSV library
    const lines = data.split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = values[index]?.trim();
      });
      return obj;
    }).filter(row => Object.keys(row).length > 0);
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
