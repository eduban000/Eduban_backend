/**
 * Course Model
 * Defines the structure and interfaces for course data
 */

export interface Instructor {
  id: string;
  name: string;
  bio: string;
  avatar: string;
  rating: number;
}

export interface CourseMetadata {
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: number; // in hours
  language: string;
  subtitle: string;
  prerequisiteCourses: string[]; // IDs of prerequisite courses
  maxStudents: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseCategory {
  id: string;
  name: string;
  description: string;
  parentCategory?: string;
}

export interface CourseRating {
  userId: string;
  rating: number; // 1-5
  review?: string;
  createdAt: Date;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  category: CourseCategory;
  subcategories?: CourseCategory[];
  instructor: Instructor;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number; // Average rating
  ratingCount: number;
  reviews: CourseRating[];
  enrollmentCount: number;
  thumbnail: string;
  coverImage: string;
  tags: string[];
  skills: string[];
  objectives: string[];
  curriculum: CurriculumModule[];
  metadata: CourseMetadata;
  searchScore?: number; // Used for relevance scoring
}

export interface CurriculumModule {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
  duration: number; // in hours
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  duration: number; // in minutes
  videoUrl?: string;
  resourceUrls?: string[];
  order: number;
}

export interface SearchFilter {
  category?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  priceRange?: {
    min: number;
    max: number;
  };
  rating?: number; // Minimum rating
  language?: string;
  instructor?: string;
  durationRange?: {
    min: number;
    max: number;
  };
  tags?: string[];
  sortBy?: 'relevance' | 'rating' | 'price-low' | 'price-high' | 'newest' | 'popular';
  page?: number;
  limit?: number;
}

export interface SearchResult {
  courses: Course[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface SearchAnalytics {
  id: string;
  query: string;
  filters: SearchFilter;
  resultCount: number;
  timestamp: Date;
  userId?: string;
  sessionId: string;
  resultsClicked?: string[]; // Course IDs that were clicked
}

export interface RecommendationContext {
  userId: string;
  enrolledCourseIds: string[];
  browsedCourseIds: string[];
  preferredCategories: string[];
  preferredLevels: ('beginner' | 'intermediate' | 'advanced')[];
  lastSearchQuery?: string;
  ratings: { courseId: string; rating: number }[];
}

export interface Recommendation {
  courseId: string;
  course: Course;
  score: number;
  reason: string;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  generatedAt: Date;
}
