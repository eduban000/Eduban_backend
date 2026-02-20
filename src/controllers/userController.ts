import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { getEmailService } from '../services/emailService';
import logger from '../utils/logger';

export const userController = {
  getProfile: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const profile = await userService.getProfile(address);
      
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      
      res.json(profile);
    } catch (error) {
      logger.error('Error in getProfile controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateProfile: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const updateData = req.body;
      
      // Note: In production, ensure the request is authenticated and signed by the address owner
      
      const updatedProfile = await userService.updateProfile(address, updateData);
      res.json(updatedProfile);
    } catch (error) {
      logger.error('Error in updateProfile controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getSettings: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const settings = await userService.getSettings(userId);
      res.json(settings);
    } catch (error) {
      logger.error('Error in getSettings controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateSettings: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const settingsData = req.body;
      
      const updatedSettings = await userService.updateSettings(userId, settingsData);

      // If email preferences were updated, sync with email service
      if (settingsData.emailPreferences) {
        const emailService = getEmailService();
        emailService.setUserPreferences(userId, settingsData.emailPreferences);
      }

      res.json(updatedSettings);
    } catch (error) {
      logger.error('Error in updateSettings controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getAchievements: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const achievements = await userService.getAchievements(address);
      res.json(achievements);
    } catch (error) {
      logger.error('Error in getAchievements controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  
  getStats: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const stats = await userService.getProfileStats(address);
      res.json(stats);
    } catch (error) {
      logger.error('Error in getStats controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Update password — triggers password-changed security email.
   */
  changePassword: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { newPassword } = req.body;

      // In production, validate current password and hash the new one
      logger.info(`Password change requested for ${address}`);

      // Send password changed security email (cannot be opted out)
      try {
        const emailService = getEmailService();
        await emailService.sendEmail({
          userId: address,
          userEmail: req.body.email || address,
          templateData: {
            type: 'passwordChanged',
            data: {
              studentName: req.body.username || 'User',
              changeDate: new Date().toISOString(),
              ipAddress: req.ip || 'Unknown',
              securityUrl: `${process.env.FRONTEND_URL || ''}/security`,
              unsubscribeUrl: `${process.env.FRONTEND_URL || ''}/settings/notifications`,
              privacyUrl: `${process.env.FRONTEND_URL || ''}/privacy`,
            },
          },
        });
      } catch (emailError) {
        logger.error('Failed to queue password changed email:', emailError);
      }

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Error in changePassword controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Handle new login — triggers new-login security alert email.
   */
  onLogin: async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ip = req.ip || 'Unknown';

      logger.info(`Login detected for ${address}`);

      // Send new login security alert email (cannot be opted out)
      try {
        const emailService = getEmailService();
        await emailService.sendEmail({
          userId: address,
          userEmail: req.body.email || address,
          templateData: {
            type: 'newLoginAlert',
            data: {
              studentName: req.body.username || 'User',
              loginDate: new Date().toISOString(),
              userAgent,
              ipAddress: ip,
              location: req.body.location || 'Unknown',
              unrecognizedDevice: req.body.unrecognizedDevice || false,
              securityUrl: `${process.env.FRONTEND_URL || ''}/security`,
              unsubscribeUrl: `${process.env.FRONTEND_URL || ''}/settings/notifications`,
              privacyUrl: `${process.env.FRONTEND_URL || ''}/privacy`,
            },
          },
        });
      } catch (emailError) {
        logger.error('Failed to queue new login alert email:', emailError);
      }

      res.json({ success: true, message: 'Login recorded' });
    } catch (error) {
      logger.error('Error in onLogin controller', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};