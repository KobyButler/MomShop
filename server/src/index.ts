import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { router as api } from './routes/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(morgan('dev'));

// Serve uploaded product images as static files
app.use('/uploads', express.static(path.join(__dirname, '../../public/uploads')));

app.use('/api', api);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
    console.log(`server listening on http://localhost:${config.port}`);
});
