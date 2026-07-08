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

router.get('/unsubscribe', async (req: Request, res: Response) => {});

export default router;