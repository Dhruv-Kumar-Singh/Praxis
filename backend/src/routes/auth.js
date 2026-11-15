import { Router } from 'express';
import { authController as c } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/register', authLimiter, c.validateRegister, c.register);
router.post('/login',    authLimiter, c.validateLogin,    c.login);
router.post('/refresh',  authLimiter, c.validateRefresh,  c.refresh);
router.post('/logout',   auth, c.logout);
router.get('/me',        auth, c.me);

export default router;
