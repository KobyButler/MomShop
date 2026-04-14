import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { router as api } from './routes/index';
import { stripeWebhookHandler } from './routes/payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

app.listen(config.port, () => {
    console.log(`server listening on http://localhost:${config.port}`);
});
