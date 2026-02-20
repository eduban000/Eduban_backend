/**
 * Content Model
 * Defines the structure and interfaces for course content management
 */

export enum ContentType {
  LESSON = 'lesson',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  RESOURCE = 'resource',
  VIDEO = 'video',
  DOCUMENT = 'document',
  IMAGE = 'image',
  AUDIO = 'audio'
}

export enum ContentStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export enum MediaFormat {
  MP4 = 'mp4',
  WEBM = 'webm',
  MP3 = 'mp3',
  WAV = 'wav',
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  JPG = 'jpg',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  SVG = 'svg'
}

export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  format: MediaFormat;
  size: number;
  url: string;
  ipfsHash?: string;
  thumbnailUrl?: string;
  duration?: number; // For video/audio
  dimensions?: { width: number; height: number }; // For images/video
  uploadedBy: string;
  uploadedAt: Date;
  isProcessed: boolean;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  title: string;
  description: string;
  content: any; // JSON content structure
  mediaFiles: MediaFile[];
  changes: string[];
  createdBy: string;
  createdAt: Date;
  isCurrent: boolean;
  publishedAt?: Date;
}

export interface ContentValidationRule {
  field: string;
  rule: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
}

export interface ContentValidationResult {
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

export interface Content {
  id: string;
  courseId: string;
  moduleId?: string;
  type: ContentType;
  title: string;
  description: string;
  content: any; // JSON content structure
  status: ContentStatus;
  order: number;
  estimatedDuration: number; // in minutes
  mediaFiles: MediaFile[];
  tags: string[];
  metadata: {
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    prerequisites: string[]; // Content IDs
    learningObjectives: string[];
    assessmentCriteria?: string[];
    accessibilityFeatures?: string[];
  };
  seo: {
    slug: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  version: {
    current: number;
    history: ContentVersion[];
    autoVersioning?: boolean;
    lastVersionUpdate?: Date;
    maxVersions?: number;
  };
  analytics: {
    views: number;
    completions: number;
    averageTimeSpent: number;
    lastViewed?: Date;
    rating: number;
    ratingCount: number;
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  archivedAt?: Date;
}

export interface ContentFilter {
  courseId?: string;
  moduleId?: string;
  type?: ContentType;
  status?: ContentStatus;
  tags?: string[];
  createdBy?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  search?: string;
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'views' | 'rating';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ContentSearchResult {
  content: Content;
  relevanceScore: number;
  matchedFields: string[];
  highlights: Record<string, string>;
}

export interface ContentCreateRequest {
  courseId: string;
  moduleId?: string;
  type: ContentType;
  title: string;
  description: string;
  content: any;
  estimatedDuration: number;
  tags?: string[];
  metadata?: Partial<Content['metadata']>;
  seo?: Partial<Content['seo']>;
}

export interface ContentUpdateRequest {
  title?: string;
  description?: string;
  content?: any;
  estimatedDuration?: number;
  tags?: string[];
  status?: ContentStatus;
  metadata?: Partial<Content['metadata']>;
  seo?: Partial<Content['seo']>;
}

export interface BulkOperation {
  operation: 'publish' | 'archive' | 'delete' | 'updateTags' | 'move';
  contentIds: string[];
  data?: any; // Additional data for the operation
}

export interface ContentExportOptions {
  format: 'json' | 'csv' | 'xml' | 'zip';
  includeMedia: boolean;
  includeVersions: boolean;
  includeAnalytics: boolean;
  filters?: ContentFilter;
}

export interface ContentImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
    data?: any;
  }>;
  warnings: string[];
}

export interface ContentAnalytics {
  id: string;
  contentId: string;
  date: Date;
  metrics: {
    views: number;
    uniqueViews: number;
    completions: number;
    averageTimeSpent: number;
    dropOffRate: number;
    engagementScore: number;
  };
  demographics?: {
    ageGroups: Record<string, number>;
    locations: Record<string, number>;
    devices: Record<string, number>;
  };
  interactions?: Array<{
    type: 'pause' | 'seek' | 'bookmark' | 'note' | 'share';
    timestamp: number;
    data?: any;
  }>;
}

// Content validation schemas
export const CONTENT_VALIDATION_RULES: Record<ContentType, ContentValidationRule[]> = {
  [ContentType.LESSON]: [
    { field: 'title', rule: 'required', message: 'Lesson title is required' },
    { field: 'title', rule: 'minLength', value: 3, message: 'Title must be at least 3 characters' },
    { field: 'description', rule: 'required', message: 'Lesson description is required' },
    { field: 'content', rule: 'required', message: 'Lesson content is required' },
    { field: 'estimatedDuration', rule: 'required', message: 'Estimated duration is required' }
  ],
  [ContentType.QUIZ]: [
    { field: 'title', rule: 'required', message: 'Quiz title is required' },
    { field: 'content', rule: 'required', message: 'Quiz questions are required' },
    { field: 'content.questions', rule: 'minLength', value: 1, message: 'Quiz must have at least one question' }
  ],
  [ContentType.ASSIGNMENT]: [
    { field: 'title', rule: 'required', message: 'Assignment title is required' },
    { field: 'description', rule: 'required', message: 'Assignment description is required' },
    { field: 'content', rule: 'required', message: 'Assignment instructions are required' }
  ],
  [ContentType.RESOURCE]: [
    { field: 'title', rule: 'required', message: 'Resource title is required' },
    { field: 'description', rule: 'required', message: 'Resource description is required' }
  ],
  [ContentType.VIDEO]: [
    { field: 'title', rule: 'required', message: 'Video title is required' },
    { field: 'content.videoUrl', rule: 'required', message: 'Video URL is required' }
  ],
  [ContentType.DOCUMENT]: [
    { field: 'title', rule: 'required', message: 'Document title is required' },
    { field: 'content.documentUrl', rule: 'required', message: 'Document URL is required' }
  ],
  [ContentType.IMAGE]: [
    { field: 'title', rule: 'required', message: 'Image title is required' },
    { field: 'content.imageUrl', rule: 'required', message: 'Image URL is required' }
  ],
  [ContentType.AUDIO]: [
    { field: 'title', rule: 'required', message: 'Audio title is required' },
    { field: 'content.audioUrl', rule: 'required', message: 'Audio URL is required' }
  ]
};
