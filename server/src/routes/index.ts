import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { router as auth } from './auth.js';
import { router as products } from './products.js';
import { router as collections } from './collections.js';
import { router as shops } from './shops.js';
import { router as orders } from './orders.js';
import { router as discounts } from './discounts.js';
import { router as content } from './content.js';
import { router as finance } from './finance.js';
import { router as customers } from './customers.js';
import { router as checkouts } from './checkouts.js';
import { router as analytics } from './analytics.js';
import { router as payments } from './payments.js';
import { router as sanmar } from './sanmar.js';

export const router = Router();

// Public: auth endpoints + public shop/product reads
router.use('/auth', auth);

// Admin routes — require a valid JWT
router.use('/products', requireAuth, products);
router.use('/collections', requireAuth, collections);
// Orders: POST / (checkout) is public; all other ops are protected in orders.ts
router.use('/orders', orders);
router.use('/discounts', requireAuth, discounts);
router.use('/content', requireAuth, content);
router.use('/finance', requireAuth, finance);
router.use('/customers', requireAuth, customers);
router.use('/checkouts', requireAuth, checkouts);
router.use('/analytics', requireAuth, analytics);

// Shops: GET /:slug is public (storefront); list/create/update are protected inside shops.ts
router.use('/shops', shops);

// Payments: create-intent is public (storefront checkout); webhook is handled in index.ts with raw body
router.use('/payments', payments);

// SanMar integration — SFTP, catalog, inventory, import (all admin-protected)
router.use('/sanmar', requireAuth, sanmar);
