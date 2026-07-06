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
): Promise<NewsletterSubscriber | null> {
    const row = await knex('newsletter_subscribers')
        .where({ unsubscribe_token: token })
        .first();
    return row || null;
}

export async function createSubscriber(
    email: string
): Promise<NewsletterSubscriber> {
    const id = `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const unsubscribe_token = crypto.randomBytes(32).toString('hex');
    
    await knex('newsletter_subscribers').insert({
        id,
        email,
        unsubscribe_token,
        is_active: true,
        subscribed_at: new Date(),
    });

    return findSubscriberByEmail(email) as Promise<NewsletterSubscriber>;
}

export async function reactivateSubscriber(
    email: string
): Promise<NewsletterSubscriber> {}