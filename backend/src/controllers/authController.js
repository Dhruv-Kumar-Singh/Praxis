import { z } from 'zod';
import { authService } from '../services/authService.js';
import { userRepo } from '../repositories/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { Errors } from '../utils/errors.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['candidate', 'interviewer']).optional(),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refreshSchema = z.object({ refreshToken: z.string().uuid() });

export const authController = {
  validateRegister: validate(registerSchema),
  validateLogin: validate(loginSchema),
  validateRefresh: validate(refreshSchema),

  register: asyncHandler(async (req, res) => {
    const data = await authService.register(req.body, req.ip);
    res.status(201).json(data);
  }),

  login: asyncHandler(async (req, res) => {
    const data = await authService.login(req.body, req.ip);
    res.json(data);
  }),

  refresh: asyncHandler(async (req, res) => {
    const data = await authService.refresh(req.body.refreshToken, req.ip);
    res.json(data);
  }),

  logout: asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken;
    await authService.logout(refreshToken, req.user.sub, req.ip);
    res.status(204).end();
  }),

  me: asyncHandler(async (req, res) => {
    const user = await userRepo.findById(req.user.sub);
    if (!user) throw Errors.NOT_FOUND('User');
    const { passwordHash: _, ...safe } = user;
    res.json(safe);
  }),
};
