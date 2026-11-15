import { Router } from 'express';
import { usersController as c } from '../controllers/usersController.js';
import { auth, roleGuard } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/',      roleGuard('admin'), c.list);
router.get('/:id',   c.getById);
router.patch('/:id', c.validateUpdate, c.update);

export default router;
