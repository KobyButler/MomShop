import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';

export const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user) {
        return res.status(401).json({ error: 'invalid credentials' });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

// POST /api/auth/me  — validate a token and return user info
router.get('/me', async (req, res) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
    const token = h.slice(7);
    try {
        const payload = jwt.verify(token, config.jwtSecret) as { sub: string; email: string; role: string };
        const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, role: true } });
        if (!user) return res.status(401).json({ error: 'user not found' });
        res.json({ user });
    } catch {
        res.status(401).json({ error: 'invalid token' });
    }
});
