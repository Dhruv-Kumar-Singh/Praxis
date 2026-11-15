import { Router } from 'express';
import { auditController as c } from '../controllers/auditController.js';
import { auth, roleGuard } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', roleGuard('admin'), c.list);

export default router;

