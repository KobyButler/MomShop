process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    process.exit(1);
});

console.log('Starting server...');

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';

console.log('Core modules loaded');

import { config } from './config.js';

console.log('Config loaded, port:', config.port);

import { router as api } from './routes/index';
import { stripeWebhookHandler } from './routes/payments.js';
import { syncInventoryDip } from './vendors/sanmar-sftp.js';

console.log('Routes loaded');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));

// Stripe webhook MUST receive the raw body — register before express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());
app.use(morgan('dev'));

// Serve uploaded product images as static files
const uploadsDir = process.env.UPLOADS_DIR ?? path.join(__dirname, '../../public/uploads');
app.use('/uploads', express.static(uploadsDir));

app.use('/api', api);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, '0.0.0.0', () => {
    console.log(`server listening on port ${config.port}`);
    scheduleInventorySync();
});

/* ─── SanMar hourly inventory DIP sync ───────────────────────────────────── */
// sanmar_dip.txt is updated hourly by SanMar — we mirror that cadence.

function scheduleInventorySync() {
    if (!config.sanmar.sftp.enable) return;

    // Delay first run by 5 minutes to let the server fully stabilize after boot,
    // then repeat every hour. Running immediately on boot caused OOM on 512MB instances.
    setTimeout(() => {
        runInventorySync();
        setInterval(runInventorySync, 60 * 60 * 1000);
    }, 5 * 60 * 1000);
}

async function runInventorySync() {
    try {
        console.log('[SanMar] Starting hourly inventory DIP sync…');
        const result = await syncInventoryDip();
        if (result.status === 'SUCCESS') {
            console.log(`[SanMar] Inventory sync complete — ${result.rowsProcessed} keys updated in ${result.durationMs}ms`);
        } else {
            console.error('[SanMar] Inventory sync failed:', result.error);
        }
    } catch (err) {
        console.error('[SanMar] Inventory sync threw:', err);
    }
}
