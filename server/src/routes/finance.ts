import { Router } from 'express';
import { prisma } from '../prisma.js';

export const router = Router();

// Financial summary (gross revenue from orders + net after finance transactions)
router.get('/summary', async (_req, res) => {
    const [orders, txs] = await Promise.all([
        prisma.order.findMany({ where: { status: { in: ['UNFULFILLED', 'FULFILLED'] } } }),
        prisma.financeTransaction.findMany()
    ]);
    const gross = orders.reduce((a, b) => a + b.totalCents, 0);
    const net = gross + txs.reduce((a, b) => a + b.amountCents, 0);
    res.json({ grossCents: gross, netCents: net, orders: orders.length });
});

// List all finance transactions
router.get('/transactions', async (_req, res) => {
    const txs = await prisma.financeTransaction.findMany({
        include: { order: { select: { id: true, customerName: true } } },
        orderBy: { createdAt: 'desc' }
    });
    res.json(txs);
});

// Create a finance transaction
router.post('/transactions', async (req, res) => {
    const { type, amountCents, note, orderId } = req.body;

    if (!type || amountCents === undefined) {
        return res.status(400).json({ error: 'type and amountCents are required' });
    }

    const validTypes = ['INCOME', 'EXPENSE', 'REFUND', 'FEE'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    // If an orderId is provided, verify it exists
    if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return res.status(400).json({ error: 'order not found' });
    }

    const tx = await prisma.financeTransaction.create({
        data: {
            type,
            amountCents: Number(amountCents),
            note: note ?? null,
            orderId: orderId ?? null
        },
        include: { order: { select: { id: true, customerName: true } } }
    });
    res.json(tx);
});
