import { Router } from 'express';
import { prisma } from '../prisma.js';
import { triggerVendorFulfillment } from '../vendors/fulfill.js';
import { requireAuth } from '../middleware/auth.js';
import { sendOrderConfirmation, sendOfflinePaymentNotification } from '../utils/email.js';

export const router = Router();

// list; optional ?status=UNFULFILLED, ?groupBy=collection, ?limit=N, ?page=1 (admin only)
router.get('/', requireAuth, async (req, res) => {
    const status = (req.query.status as string) ?? undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string, 10)) : 1;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where: status ? { status } : undefined,
            include: { items: { include: { product: { include: { collection: true } } } }, shop: true, vendorOrders: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip
        }),
        prisma.order.count({ where: status ? { status } : undefined })
    ]);

    if (req.query.groupBy === 'collection') {
        const grouped: Record<string, any[]> = {};
        for (const o of orders) {
            const set: Set<string> = new Set(o.items.map(i => i.product.collection.name));
            for (const cName of set) {
                if (!grouped[cName]) grouped[cName] = [];
                grouped[cName].push(o);
            }
        }
        return res.json(grouped);
    }

    res.json({ data: orders, total, page, limit, pages: Math.ceil(total / limit) });
});

// create order (public checkout posts here — used for cash/check payments)
// Online card payments use POST /api/payments/create-intent instead
router.post('/', async (req, res) => {
    const {
        shopSlug, customerName, customerEmail,
        shipAddress1, shipAddress2, shipCity, shipState, shipZip, residential = true,
        items, discountCode,
        paymentMethod   // 'pickup' | 'cash' | 'check'  (card goes through /payments/create-intent)
    } = req.body;

    const shop = shopSlug ? await prisma.shop.findFirst({ where: { slug: shopSlug } }) : null;

    const products = await prisma.product.findMany({
        where: { id: { in: items.map((i: any) => i.productId) } }
    });
    if (products.length !== items.length) return res.status(400).json({ error: 'invalid product(s)' });

    let subtotal = 0;
    const orderItems = items.map((i: any) => {
        const p = products.find(pp => pp.id === i.productId)!;
        const price = p.priceCents;
        subtotal += price * i.quantity;
        return { productId: p.id, quantity: i.quantity, size: i.size ?? null, color: i.color ?? null, priceCents: price };
    });

    let discountId: string | undefined;
    if (discountCode) {
        const d = await prisma.discountCode.findFirst({
            where: { code: discountCode, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        });
        if (d && (d.maxUses === null || d.usedCount < d.maxUses)) {
            if (d.type === 'PERCENT') subtotal = Math.max(0, Math.round(subtotal * (100 - d.value) / 100));
            else subtotal = Math.max(0, subtotal - d.value);
            discountId = d.id;
        }
    }

    // upsert customer
    const customer = await prisma.customer.upsert({
        where: { email: customerEmail },
        update: { name: customerName },
        create: { email: customerEmail, name: customerName }
    });

    const isOffline = paymentMethod === 'pickup' || paymentMethod === 'cash' || paymentMethod === 'check';
    const payStatus = isOffline ? 'OFFLINE_PENDING' : 'UNPAID';

    const order = await prisma.order.create({
        data: {
            shopId: shop?.id, status: 'UNFULFILLED',
            paymentStatus: payStatus,
            paymentMethod: isOffline ? 'pickup' : null,
            customerId: customer.id,
            customerName, customerEmail, shipAddress1, shipAddress2, shipCity, shipState, shipZip, residential,
            totalCents: subtotal, items: { createMany: { data: orderItems } }, discountCodeId: discountId
        },
        include: { items: { include: { product: true } } }
    });

    // mark related checkout (if any) recovered
    if (shop?.id) {
        await prisma.checkout.updateMany({
            where: { shopId: shop.id, email: customerEmail, status: 'ABANDONED' },
            data: { status: 'RECOVERED' }
        });
    }

    triggerVendorFulfillment(order).catch(err => console.error('fulfillment error', err));

    const emailItems = order.items.map(i => ({
        name: i.product.name, quantity: i.quantity,
        size: i.size, color: i.color, priceCents: i.priceCents
    }));

    if (isOffline) {
        // Notify admin + send customer a "payment due" receipt
        sendOfflinePaymentNotification({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            totalCents: order.totalCents,
            shopName: shop?.name,
            paymentMethod: 'cash',
            items: emailItems
        }).catch(err => console.error('offline payment email error', err));
    } else {
        // Standard paid confirmation
        sendOrderConfirmation({
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            totalCents: order.totalCents,
            shopName: shop?.name,
            items: emailItems
        }).catch(err => console.error('email error', err));
    }

    res.json(order);
});

router.post('/:id/fulfill', requireAuth, async (req, res) => {
    const o = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status: 'FULFILLED' } });
    res.json(o);
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
    const existing = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'order not found' });
    if (existing.status === 'FULFILLED') return res.status(400).json({ error: 'cannot cancel a fulfilled order' });
    const o = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status: 'CANCELLED' } });
    res.json(o);
});

// CSV of shipping addresses for label tools (admin only)
router.get('/shipping/export', requireAuth, async (req, res) => {
    const status = (req.query.status as string) ?? 'UNFULFILLED';
    const orders = await prisma.order.findMany({ where: { status } });
    const rows = [
        ['OrderId', 'Name', 'Address1', 'Address2', 'City', 'State', 'Zip', 'Residential', 'Email'].join(','),
        ...orders.map(o => [
            o.id, q(o.customerName), q(o.shipAddress1), q(o.shipAddress2 ?? ''), q(o.shipCity),
            q(o.shipState), q(o.shipZip), o.residential ? 'Y' : 'N', q(o.customerEmail)
        ].join(','))
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="shipping_${status.toLowerCase()}.csv"`);
    res.send(rows.join('\n'));

    function q(s: string) { return `"${String(s).replaceAll('"', '""')}"`; }
});
