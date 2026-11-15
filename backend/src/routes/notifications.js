import { Router } from 'express';
import { notificationsController as c } from '../controllers/notificationsController.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', c.list);
router.patch('/:id/read', c.markRead);

export default router;

