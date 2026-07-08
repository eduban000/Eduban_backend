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
    
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

router.post('/', async (req: Request, res: Response) => {});

router.get('/unsubscribe', async (req: Request, res: Response) => {});

export default router;