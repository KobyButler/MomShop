import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendOrderConfirmation } from '../utils/email.js';

export const router = Router();

function getStripe() {
    if (!config.stripe.secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
    return new Stripe(config.stripe.secretKey);
}

// ─── POST /api/payments/create-intent ─────────────────────────────────────────
// Called by the storefront checkout when the customer selects online payment.
// Creates a pending order + a Stripe PaymentIntent; returns the clientSecret so
// the frontend can render the Stripe Payment Element.
router.post('/create-intent', async (req: Request, res: Response) => {
    const {
        shopSlug, customerName, customerEmail,
        shipAddress1, shipAddress2, shipCity, shipState, shipZip,
        residential = true, items, discountCode
    } = req.body;

    if (!customerEmail || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'customerEmail and items are required' });
    }

    // Resolve products and calculate subtotal
    const products = await prisma.product.findMany({
        where: { id: { in: items.map((i: any) => i.productId) } }
    });
    if (products.length !== items.length) {
        return res.status(400).json({ error: 'One or more products were not found' });
    }

    let subtotal = 0;
    const orderItems = items.map((i: any) => {
        const p = products.find(pp => pp.id === i.productId)!;
        subtotal += p.priceCents * i.quantity;
        return {
            productId: p.id,
            quantity: i.quantity,
            size: i.size ?? null,
            color: i.color ?? null,
            priceCents: p.priceCents
        };
    });

    // Apply discount if present
    let discountId: string | undefined;
    if (discountCode) {
        const d = await prisma.discountCode.findFirst({
            where: {
                code: discountCode, active: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
            }
        });
        if (d && (d.maxUses === null || d.usedCount < d.maxUses)) {
            if (d.type === 'PERCENT') subtotal = Math.max(0, Math.round(subtotal * (100 - d.value) / 100));
            else subtotal = Math.max(0, subtotal - d.value);
            discountId = d.id;
        }
    }

    // Stripe requires a minimum of 50 cents
    if (subtotal < 50) {
        return res.status(400).json({ error: 'Order total is too low for card payment (minimum $0.50)' });
    }

    const shop = shopSlug ? await prisma.shop.findFirst({ where: { slug: shopSlug } }) : null;

    // Upsert customer
    const customer = await prisma.customer.upsert({
        where: { email: customerEmail },
        update: { name: customerName },
        create: { email: customerEmail, name: customerName }
    });

    // Create the order now as UNFULFILLED/UNPAID — the webhook will flip it to PAID
    const order = await prisma.order.create({
        data: {
            shopId: shop?.id ?? null,
            status: 'UNFULFILLED',
            paymentStatus: 'UNPAID',
            paymentMethod: 'stripe',
            customerId: customer.id,
            customerName, customerEmail,
            shipAddress1,
            shipAddress2: shipAddress2 ?? null,
            shipCity, shipState, shipZip, residential,
            totalCents: subtotal,
            discountCodeId: discountId ?? null,
            items: { createMany: { data: orderItems } }
        }
    });

    // Increment discount usage counter
    if (discountId) {
        await prisma.discountCode.update({
            where: { id: discountId },
            data: { usedCount: { increment: 1 } }
        });
    }

    // Create the Stripe PaymentIntent
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
        amount: subtotal,
        currency: 'usd',
        metadata: { orderId: order.id },
        automatic_payment_methods: { enabled: true }
    });

    // Save the PI ID so the webhook can find the order later
    await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: pi.id }
    });

    res.json({ clientSecret: pi.client_secret, orderId: order.id });
});

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
// Called by Stripe (raw body required — registered with express.raw() in index.ts).
// Marks the order PAID and sends confirmation emails.
export async function stripeWebhookHandler(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) return res.status(400).send('Missing stripe-signature header');

    let event: Stripe.Event;
    try {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(
            req.body as Buffer,
            sig,
            config.stripe.webhookSecret
        );
    } catch (err: any) {
        console.error('[stripe-webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;

        const order = await prisma.order.findFirst({
            where: { stripePaymentIntentId: pi.id },
            include: { items: { include: { product: true } }, shop: true }
        });

        if (!order) {
            console.warn(`[stripe-webhook] No order found for PI ${pi.id}`);
            return res.json({ received: true });
        }

        if (order.paymentStatus !== 'PAID') {
            await prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: 'PAID' }
            });

            // Recover abandoned checkout if any
            if (order.shopId) {
                await prisma.checkout.updateMany({
                    where: { shopId: order.shopId, email: order.customerEmail, status: 'ABANDONED' },
                    data: { status: 'RECOVERED' }
                });
            }

            // Send confirmation emails (fire-and-forget)
            sendOrderConfirmation({
                orderId: order.id,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                totalCents: order.totalCents,
                shopName: order.shop?.name,
                items: order.items.map(i => ({
                    name: i.product.name,
                    quantity: i.quantity,
                    size: i.size,
                    color: i.color,
                    priceCents: i.priceCents
                }))
            }).catch(err => console.error('[stripe-webhook] email error:', err));
        }
    }

    res.json({ received: true });
}
