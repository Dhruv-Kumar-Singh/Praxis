import { Router } from 'express';
import { dashboardController as c } from '../controllers/dashboardController.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/summary', c.summary);

export default router;

