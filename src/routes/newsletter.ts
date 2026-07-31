import {Router, Request, Response} from 'express';
import {z} from 'zod';
import {
    findSubscriberByEmail,
    createSubscriber,
    reactivateSubscriber,
    findSubscriberByToken,
} from '../models/NewsletterSubscriber';
import {getEmailService} from '../services/emailService';

const router = Router();

const SubscribeSchema = z.object({
    email: z.string().email({message: 'Invalid email address'}),
});

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// POST /api/v1/newsletter
router.post('/', async (req: Request, res: Response) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({error: parsed.error.errors[0].message});
    }

    const {email} = parsed.data;

    try {
        let subscriber = await findSubscriberByEmail(email);
        if (subscriber?.is_active) {
            return res.status(200).json({message: 'Already subscribed'});
        }

        if (subscriber && !subscriber.is_active) {
            subscriber = await reactivateSubscriber(email);
        } else {
            subscriber = await createSubscriber(email);
        }

        // welcome email
        const emailService = getEmailService();
        await emailService.sendEmail({
            userId: subscriber.id,
            userEmail: email,
            templateData: {
                type: 'newsletterWelcome',
                data: {
                    unsubscribeUrl: `${BASE_URL}/unsubscribe?token=${subscriber.unsubscribe_token}`,
                    privacyUrl: `${BASE_URL}/privacy`,
                },
            },
        });
        
        return res.status(201).json({message: 'Subscribed successfully'});
    } catch (err) {
        console.error('Error subscribing to newsletter:', err);
        return res.status(500).json({error: 'Internal server error'});
    }
});

// GET /api/v1/newsletter/unsubscribe?token=...
router.get('/unsubscribe', async (req: Request, res: Response) => {
    const {token} = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({error: 'Invalid unsubscribe token'});
    }

    try {
        const subscriber = await findSubscriberByToken(token);

        if (!subscriber) {
            return res.status(404).json({error: 'Token not found'});
        }

        if (!subscriber.is_active) {
            return res.status(200).json({message: 'Already unsubscribed'});
        }

        await require('../config/database')('newsletter_subscribers')
            .where({unsubscribe_token: token})
            .update({ is_active: false, unsubscribed_at: new Date()});

        return res.status(200).json({message: 'Unsubscribed successfully'});
    }   catch (err) {
        console.error('Unsubscribe error:', err);
        return res.status(500).json({error: 'Internal server error'});
    }
});

export default router;