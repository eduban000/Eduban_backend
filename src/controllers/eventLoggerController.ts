import { Request, Response } from 'express';
import { eventLoggerService } from '../services/eventLoggerService';
import logger from '../utils/logger';

interface EventQuery {
  userId?: string;
  eventType?: string;
  courseId?: string;
  limit?: string;
  offset?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Controller for event logging and audit trail functionality
 */
class EventLoggerController {
  /**
   * Log a course completion event
   */
  public async logCourseCompletion(req: Request, res: Response): Promise<void> {
    try {
      const { user, courseId, metadata } = req.body;
      
      if (!user || !courseId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: user and courseId'
        });
        return;
      }

      const eventId = await eventLoggerService.logCourseCompletion(user, courseId, metadata || {});
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'Course completion event logged successfully'
      });
    } catch (error) {
      logger.error('Error in logCourseCompletion controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log course completion event'
      });
    }
  }

  /**
   * Log a credential issuance event
   */
  public async logCredentialIssuance(req: Request, res: Response): Promise<void> {
    try {
      const { user, credentialId, courseId, metadata } = req.body;
      
      if (!user || !credentialId || !courseId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: user, credentialId, and courseId'
        });
        return;
      }

      const eventId = await eventLoggerService.logCredentialIssuance(
        user, 
        credentialId, 
        courseId, 
        metadata || {}
      );
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'Credential issuance event logged successfully'
      });
    } catch (error) {
      logger.error('Error in logCredentialIssuance controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log credential issuance event'
      });
    }
  }

  /**
   * Log a user achievement event
   */
  public async logUserAchievement(req: Request, res: Response): Promise<void> {
    try {
      const { user, achievementType, metadata } = req.body;
      
      if (!user || !achievementType) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: user and achievementType'
        });
        return;
      }

      const eventId = await eventLoggerService.logUserAchievement(user, achievementType, metadata || {});
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'User achievement event logged successfully'
      });
    } catch (error) {
      logger.error('Error in logUserAchievement controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log user achievement event'
      });
    }
  }

  /**
   * Log a profile update event
   */
  public async logProfileUpdate(req: Request, res: Response): Promise<void> {
    try {
      const { user, metadata } = req.body;
      
      if (!user) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: user'
        });
        return;
      }

      const eventId = await eventLoggerService.logProfileUpdate(user, metadata || {});
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'Profile update event logged successfully'
      });
    } catch (error) {
      logger.error('Error in logProfileUpdate controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log profile update event'
      });
    }
  }

  /**
   * Log a course enrollment event
   */
  public async logCourseEnrollment(req: Request, res: Response): Promise<void> {
    try {
      const { user, courseId, metadata } = req.body;
      
      if (!user || !courseId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: user and courseId'
        });
        return;
      }

      const eventId = await eventLoggerService.logCourseEnrollment(user, courseId, metadata || {});
      
      res.status(201).json({
        success: true,
        eventId,
        message: 'Course enrollment event logged successfully'
      });
    } catch (error) {
      logger.error('Error in logCourseEnrollment controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to log course enrollment event'
      });
    }
  }

  /**
   * Get event by ID
   */
  public async getEventById(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      const eventIdNum = parseInt(eventId, 10);
      
      if (isNaN(eventIdNum)) {
        res.status(400).json({
          success: false,
          error: 'Invalid event ID'
        });
        return;
      }

      const event = await eventLoggerService.getEvent(eventIdNum);
      
      if (!event) {
        res.status(404).json({
          success: false,
          error: 'Event not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        event
      });
    } catch (error) {
      logger.error('Error in getEventById controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve event'
      });
    }
  }

  /**
   * Get events for a user
   */
  public async getUserEvents(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const query = req.query as EventQuery;
      
      const filter = {
        userId,
        eventType: query.eventType,
        courseId: query.courseId,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      };

      const events = await eventLoggerService.getUserEvents(userId, filter);
      
      res.status(200).json({
        success: true,
        events,
        count: events.length
      });
    } catch (error) {
      logger.error('Error in getUserEvents controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user events'
      });
    }
  }

  /**
   * Get events by type
   */
  public async getEventsByType(req: Request, res: Response): Promise<void> {
    try {
      const { eventType } = req.params;
      const query = req.query as EventQuery;
      
      const filter = {
        eventType,
        userId: query.userId,
        courseId: query.courseId,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      };

      const events = await eventLoggerService.getEventsByType(eventType, filter);
      
      res.status(200).json({
        success: true,
        events,
        count: events.length
      });
    } catch (error) {
      logger.error('Error in getEventsByType controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve events by type'
      });
    }
  }

  /**
   * Get recent events
   */
  public async getRecentEvents(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as { limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;
      
      const events = await eventLoggerService.getRecentEvents(limit, offset);
      
      res.status(200).json({
        success: true,
        events,
        count: events.length,
        limit,
        offset
      });
    } catch (error) {
      logger.error('Error in getRecentEvents controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve recent events'
      });
    }
  }

  /**
   * Get total event count
   */
  public async getEventCount(req: Request, res: Response): Promise<void> {
    try {
      const count = await eventLoggerService.getEventCount();
      
      res.status(200).json({
        success: true,
        count
      });
    } catch (error) {
      logger.error('Error in getEventCount controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve event count'
      });
    }
  }

  /**
   * Search events with complex filters
   */
  public async searchEvents(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as EventQuery;
      
      const filter = {
        userId: query.userId,
        eventType: query.eventType,
        courseId: query.courseId,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      };

      const { events, totalCount } = await eventLoggerService.searchEvents(filter);
      
      res.status(200).json({
        success: true,
        events,
        totalCount,
        count: events.length
      });
    } catch (error) {
      logger.error('Error in searchEvents controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search events'
      });
    }
  }

  /**
   * Verify event authenticity
   */
  public async verifyEvent(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      const eventIdNum = parseInt(eventId, 10);
      
      if (isNaN(eventIdNum)) {
        res.status(400).json({
          success: false,
          error: 'Invalid event ID'
        });
        return;
      }

      const isValid = await eventLoggerService.verifyEvent(eventIdNum);
      
      res.status(200).json({
        success: true,
        eventId: eventIdNum,
        isValid,
        message: isValid ? 'Event is authentic' : 'Event verification failed'
      });
    } catch (error) {
      logger.error('Error in verifyEvent controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify event'
      });
    }
  }

  /**
   * Generate audit report for a user
   */
  public async generateUserAuditReport(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      const report = await eventLoggerService.generateUserAuditReport(userId);
      
      res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Error in generateUserAuditReport controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate audit report'
      });
    }
  }
}

export const eventLoggerController = new EventLoggerController();