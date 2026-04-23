import { Router } from 'express';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import {
    testSftpConnection,
    listSftpFiles,
    syncCatalogSDL,
    syncCatalogEPDD,
    syncInventoryDip,
} from '../vendors/sanmar-sftp.js';
import { checkSanMarInventory, getSanMarProductInfo } from '../vendors/sanmar.js';

export const router = Router();

/* ─── Status overview ─────────────────────────────────────────────────────── */

router.get('/status', async (_req, res) => {
    const [catalogCount, lastSyncLogs] = await Promise.all([
        prisma.sanmarCatalogProduct.count(),
        prisma.sanmarSyncLog.findMany({
            orderBy: { startedAt: 'desc' },
            take: 4,
            distinct: ['type'],
        }),
    ]);

    const lastByType: Record<string, any> = {};
    for (const log of lastSyncLogs) {
        lastByType[log.type] = log;
    }

    res.json({
        sftpEnabled:   config.sanmar.sftp.enable,
        soapEnabled:   config.sanmar.enable,
        sftpHost:      config.sanmar.sftp.host,
        sftpPort:      config.sanmar.sftp.port,
        sftpRemoteDir: config.sanmar.sftp.remoteDir,
        catalogCount,
        lastSync: lastByType,
    });
});

/* ─── SFTP test connection ────────────────────────────────────────────────── */

router.post('/sftp/test', async (_req, res) => {
    try {
        const result = await testSftpConnection();
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/* ─── Peek at first N lines of a remote file (diagnostic) ───────────────── */

router.get('/sftp/peek', async (req, res) => {
    const filename = req.query.file as string;
    const lines    = Math.min(parseInt(req.query.lines as string ?? '5', 10), 20);
    if (!filename) return res.status(400).json({ error: 'file query param required' });

    try {
        const { peekFile } = await import('../vendors/sanmar-sftp.js');
        const text = await peekFile(filename, lines);
        res.json({ filename, lines: text.split('\n') });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── List SFTP files ─────────────────────────────────────────────────────── */

router.get('/sftp/files', async (_req, res) => {
    try {
        const files = await listSftpFiles();
        res.json(files);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── Sync catalog (SDL_N) — fire and forget, poll /sync-logs for status ─── */

router.post('/sync/catalog-sdl', async (_req, res) => {
    // Create the log entry first so the client has an ID to poll
    const log = await prisma.sanmarSyncLog.create({ data: { type: 'CATALOG_SDL', status: 'RUNNING' } });
    res.json({ logId: log.id, status: 'RUNNING', message: 'Sync started — this file is ~185 MB and will take several minutes. Check Sync Logs for progress.' });
    // Run in background — do not await
    syncCatalogSDL(log.id).catch(err =>
        prisma.sanmarSyncLog.update({ where: { id: log.id }, data: { status: 'ERROR', error: String(err?.message ?? err).slice(0, 2000), completedAt: new Date() } }).catch(() => {})
    );
});

/* ─── Sync catalog (EPDD) — fire and forget ──────────────────────────────── */

router.post('/sync/catalog-epdd', async (_req, res) => {
    const log = await prisma.sanmarSyncLog.create({ data: { type: 'CATALOG_EPDD', status: 'RUNNING' } });
    res.json({ logId: log.id, status: 'RUNNING', message: 'Sync started — this file is ~500 MB and will take 10–20 minutes. Check Sync Logs for progress.' });
    syncCatalogEPDD(log.id).catch(err =>
        prisma.sanmarSyncLog.update({ where: { id: log.id }, data: { status: 'ERROR', error: String(err?.message ?? err).slice(0, 2000), completedAt: new Date() } }).catch(() => {})
    );
});

/* ─── Sync inventory DIP (sanmar_dip.txt) — fire and forget ─────────────── */

router.post('/sync/inventory-dip', async (_req, res) => {
    const log = await prisma.sanmarSyncLog.create({ data: { type: 'INVENTORY_DIP', status: 'RUNNING' } });
    res.json({ logId: log.id, status: 'RUNNING', message: 'Inventory DIP sync started.' });
    syncInventoryDip(log.id).catch(err =>
        prisma.sanmarSyncLog.update({ where: { id: log.id }, data: { status: 'ERROR', error: String(err?.message ?? err).slice(0, 2000), completedAt: new Date() } }).catch(() => {})
    );
});

/* ─── Sync logs ───────────────────────────────────────────────────────────── */

router.get('/sync-logs', async (req, res) => {
    const limit  = parseInt(req.query.limit as string ?? '50', 10);
    const offset = parseInt(req.query.offset as string ?? '0', 10);
    const type   = req.query.type as string | undefined;

    const [logs, total] = await Promise.all([
        prisma.sanmarSyncLog.findMany({
            where:   type ? { type } : undefined,
            orderBy: { startedAt: 'desc' },
            take:    limit,
            skip:    offset,
        }),
        prisma.sanmarSyncLog.count({ where: type ? { type } : undefined }),
    ]);

    res.json({ logs, total });
});

/* ─── Browse catalog ──────────────────────────────────────────────────────── */

router.get('/catalog', async (req, res) => {
    const q           = (req.query.q as string ?? '').trim();
    const category    = req.query.category    as string | undefined;
    const subcategory = req.query.subcategory as string | undefined;
    const brand       = req.query.brand       as string | undefined;
    const colorName   = req.query.colorName   as string | undefined;
    const style       = req.query.style       as string | undefined;
    const inStock     = req.query.inStock === 'true';
    const limit       = Math.min(parseInt(req.query.limit as string ?? '50', 10), 200);
    const page        = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
    const skip        = (page - 1) * limit;

    const where: any = {};
    if (style) {
        where.style = { equals: style, mode: 'insensitive' };
    } else if (q) {
        where.OR = [
            { style:       { contains: q, mode: 'insensitive' } },
            { title:       { contains: q, mode: 'insensitive' } },
            { brand:       { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
        ];
    }
    if (category)    where.category    = { contains: category,    mode: 'insensitive' };
    if (subcategory) where.subcategory = { contains: subcategory, mode: 'insensitive' };
    if (brand)       where.brand       = { contains: brand,       mode: 'insensitive' };
    if (colorName)   where.colorName   = { contains: colorName,   mode: 'insensitive' };
    if (inStock)     where.inventoryQty = { gt: 0 };

    const [data, total] = await Promise.all([
        prisma.sanmarCatalogProduct.findMany({ where, take: limit, skip, orderBy: [{ style: 'asc' }, { colorName: 'asc' }, { sizeName: 'asc' }] }),
        prisma.sanmarCatalogProduct.count({ where }),
    ]);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
});

/* ─── Catalog categories / brands ────────────────────────────────────────── */

router.get('/catalog/meta', async (_req, res) => {
    const [cats, subcatPairs, brands, colors] = await Promise.all([
        prisma.sanmarCatalogProduct.findMany({
            select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' },
        }),
        prisma.sanmarCatalogProduct.findMany({
            select: { category: true, subcategory: true },
            distinct: ['category', 'subcategory'],
            where: { subcategory: { not: null } },
            orderBy: [{ category: 'asc' }, { subcategory: 'asc' }],
        }),
        prisma.sanmarCatalogProduct.findMany({
            select: { brand: true }, distinct: ['brand'], orderBy: { brand: 'asc' },
        }),
        prisma.sanmarCatalogProduct.findMany({
            select: { colorName: true }, distinct: ['colorName'], orderBy: { colorName: 'asc' },
        }),
    ]);
    res.json({
        categories:    cats.map(c => c.category).filter(Boolean),
        subcategories: subcatPairs.filter(r => r.category && r.subcategory)
            .map(r => ({ category: r.category!, subcategory: r.subcategory! })),
        brands:        brands.map(b => b.brand).filter(Boolean),
        colors:        colors.map(c => c.colorName).filter(Boolean),
    });
});

/* ─── Get single style (all sizes/colors) ────────────────────────────────── */

router.get('/catalog/:style', async (req, res) => {
    const rows = await prisma.sanmarCatalogProduct.findMany({
        where:   { style: req.params.style },
        orderBy: [{ colorName: 'asc' }, { sizeName: 'asc' }],
    });
    if (!rows.length) return res.status(404).json({ error: 'Style not found in catalog' });

    // Group into a summary
    const first   = rows[0];
    const colors  = [...new Set(rows.map(r => r.colorName).filter(Boolean))];
    const sizes   = [...new Set(rows.map(r => r.sizeName).filter(Boolean))];
    const minPrice = Math.min(...rows.map(r => r.priceCents).filter(p => p > 0));

    res.json({ style: req.params.style, title: first.title, description: first.description, brand: first.brand, category: first.category, subcategory: first.subcategory, colors, sizes, priceCents: minPrice, variants: rows });
});

/* ─── Real-time SOAP inventory check ─────────────────────────────────────── */

router.get('/inventory', async (req, res) => {
    const { style, color, size } = req.query as Record<string, string>;
    if (!style || !color || !size) {
        return res.status(400).json({ error: 'style, color, and size are required' });
    }
    try {
        const result = await checkSanMarInventory(style, color, size);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── Bulk SOAP inventory check ──────────────────────────────────────────── */

router.post('/inventory/bulk', async (req, res) => {
    const items: Array<{ style: string; color: string; size: string }> = req.body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array required' });
    }
    if (items.length > 20) {
        return res.status(400).json({ error: 'max 20 items per bulk check' });
    }
    try {
        const results = await Promise.all(items.map(i => checkSanMarInventory(i.style, i.color, i.size)));
        res.json(results);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── SOAP product info ───────────────────────────────────────────────────── */

router.get('/product-info/:style', async (req, res) => {
    try {
        const info = await getSanMarProductInfo(req.params.style);
        res.json(info);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── Import catalog product into local Products ─────────────────────────── */

router.post('/import', async (req, res) => {
    const { style, collectionId, priceCents } = req.body as {
        style: string;
        collectionId: string;
        priceCents?: number;
    };

    if (!style || !collectionId) {
        return res.status(400).json({ error: 'style and collectionId are required' });
    }

    // Fetch all variants from catalog
    const rows = await prisma.sanmarCatalogProduct.findMany({ where: { style } });
    if (!rows.length) return res.status(404).json({ error: 'Style not found in SanMar catalog' });

    const first  = rows[0];
    const colors = [...new Set(rows.map(r => r.colorName).filter(Boolean))];
    const sizes  = [...new Set(rows.map(r => r.sizeName).filter(Boolean))];
    const price  = priceCents ?? Math.min(...rows.map(r => r.priceCents).filter(p => p > 0)) ?? 0;
    const image  = first.productImage ?? undefined;

    try {
        const existing = await prisma.product.findUnique({ where: { sku: style } });
        if (existing) {
            const updated = await prisma.product.update({
                where: { sku: style },
                data: {
                    name:             first.title ?? style,
                    vendor:           'SANMAR',
                    vendorIdentifier: first.inventoryKey ?? style,
                    brand:            first.brand ?? null,
                    description:      first.description ?? null,
                    priceCents:       price,
                    sizesJson:        sizes.length  ? JSON.stringify(sizes)  : null,
                    colorsJson:       colors.length ? JSON.stringify(colors) : null,
                    imagesJson:       image ? JSON.stringify([image]) : existing.imagesJson,
                    collectionId,
                },
                include: { collection: true },
            });
            return res.json({ action: 'updated', product: updated });
        }

        const created = await prisma.product.create({
            data: {
                name:             first.title ?? style,
                sku:              style,
                vendor:           'SANMAR',
                vendorIdentifier: first.inventoryKey ?? style,
                brand:            first.brand ?? null,
                description:      first.description ?? null,
                priceCents:       price,
                sizesJson:        sizes.length  ? JSON.stringify(sizes)  : null,
                colorsJson:       colors.length ? JSON.stringify(colors) : null,
                imagesJson:       image ? JSON.stringify([image]) : null,
                collectionId,
            },
            include: { collection: true },
        });
        res.json({ action: 'created', product: created });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
