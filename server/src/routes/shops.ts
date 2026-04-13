import { Router } from 'express';
import { prisma } from '../prisma.js';
import slugify from '../utils/slugify.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// List all shops (admin only)
router.get('/', requireAuth, async (_req, res) => {
    const data = await prisma.shop.findMany({
        include: { collection: true },
        orderBy: { createdAt: 'desc' }
    });
    res.json(data);
});

// Create shop (admin only)
router.post('/', requireAuth, async (req, res) => {
    const { name, collectionId, expiresAt, notes } = req.body;
    if (!name || !collectionId) {
        return res.status(400).json({ error: 'name and collectionId are required' });
    }
    const slug = slugify(name) + '-' + Math.random().toString(36).slice(2, 6);
    const s = await prisma.shop.create({
        data: {
            name,
            slug,
            collectionId,
            notes: notes ?? null,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        },
        include: { collection: true }
    });
    res.json(s);
});

// Get single shop by slug (public storefront) — enforces active + expiry
router.get('/:slug', async (req, res) => {
    const now = new Date();
    const s = await prisma.shop.findFirst({
        where: {
            slug: req.params.slug,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        include: { collection: { include: { products: true } } }
    });
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
});

// Update shop (toggle active, update name/notes/collection/expiry) — admin only
router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, collectionId, expiresAt, notes, active } = req.body;

    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'shop not found' });

    const updated = await prisma.shop.update({
        where: { id },
        data: {
            ...(name !== undefined && { name }),
            ...(collectionId !== undefined && { collectionId }),
            ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
            ...(notes !== undefined && { notes: notes ?? null }),
            ...(active !== undefined && { active })
        },
        include: { collection: true }
    });
    res.json(updated);
});
