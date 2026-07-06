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

export async function findSubscriberByEmail(
    email: string
): Promise<NewsletterSubscriber | null> {
    const row = await knex('newsletter_subscribers').where({ email }).first();
    return row || null;
}

export async function findSubscriberByToken(
    token: string
): Promise<NewsletterSubscriber | null> {}

export async function createSubscriber(
    email: string
): Promise<NewsletterSubscriber> {}

export async function reactivateSubscriber(
    email: string
): Promise<NewsletterSubscriber> {}