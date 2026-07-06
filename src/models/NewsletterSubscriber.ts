import crypto from 'crypto';
import knex from '../config/database';

export interface NewsletterSubscriber {
  id: string;
  email: string;
  unsubscribe_token: string;
  is_active: boolean;
  subscribed_at: Date;
  unsubscribed_at: Date | null;
}