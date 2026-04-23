import SftpClient from 'ssh2-sftp-client';
import { parse } from 'csv-parse';
import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { createInterface } from 'readline';
import { prisma } from '../prisma.js';
import { config } from '../config.js';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface SftpFileInfo {
    name: string;
    size: number;
    modifyTime: number;
}

export interface SanmarSyncResult {
    logId: string;
    status: 'SUCCESS' | 'ERROR';
    rowsProcessed: number;
    rowsTotal: number;
    error?: string;
    durationMs: number;
}

/* ─── Connection config ──────────────────────────────────────────────────── */

function buildConnectConfig(): any {
    const { host, port, user, password } = config.sanmar.sftp;
    if (!host || !user || !password) {
        throw new Error('SANMAR_SFTP_HOST, SANMAR_SFTP_USER, and SANMAR_SFTP_PASSWORD must be set');
    }
    return { host, port, username: user, password, readyTimeout: 30000 };
}

/* ─── Discover the actual remote directory ───────────────────────────────── */

async function resolveRemoteDir(sftp: SftpClient): Promise<string> {
    const configured = config.sanmar.sftp.remoteDir;
    try {
        await sftp.list(configured);
        return configured;
    } catch { /* fall through */ }

    const rootEntries = await sftp.list('.');
    const dirs = rootEntries.filter((e: any) => e.type === 'd').map((e: any) => e.name as string);

    const match = dirs.find(d => d.toLowerCase() === configured.toLowerCase())
        ?? dirs.find(d => d.toLowerCase().includes('pdd'))
        ?? dirs.find(d => d.toLowerCase().includes('sanmar'));

    return match ?? '.';
}

/* ─── Download remote file → local temp path (streams, no RAM buffer) ───── */

function downloadToTemp(sftp: SftpClient, remotePath: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        sftp.get(remotePath, localPath)
            .then(() => resolve())
            .catch(reject);
    });
}

/* ─── Peek: download first N lines of a remote file ─────────────────────── */

export async function peekFile(filename: string, maxLines = 5): Promise<string> {
    const sftp = new SftpClient();
    try {
        await sftp.connect(buildConnectConfig());
        const dir  = await resolveRemoteDir(sftp);
        const remotePath = dir === '.' ? filename : `${dir}/${filename}`;
        const localPath  = `/tmp/sanmar_peek_${Date.now()}.tmp`;
        await downloadToTemp(sftp, remotePath, localPath);

        const collected: string[] = [];
        const rl = createInterface({ input: createReadStream(localPath, { encoding: 'latin1' }), crlfDelay: Infinity });
        for await (const line of rl) {
            collected.push(line);
            if (collected.length >= maxLines) break;
        }
        await unlink(localPath).catch(() => {});
        return collected.join('\n');
    } finally {
        await sftp.end().catch(() => {});
    }
}

/* ─── Test connection ────────────────────────────────────────────────────── */

export async function testSftpConnection(): Promise<{ ok: boolean; files?: SftpFileInfo[]; resolvedDir?: string; error?: string }> {
    const sftp = new SftpClient();
    try {
        await sftp.connect(buildConnectConfig());
        const dir = await resolveRemoteDir(sftp);
        const list = await sftp.list(dir);
        const files = list.map((f: any) => ({
            name: f.name,
            size: f.size,
            modifyTime: typeof f.modifyTime === 'number' ? f.modifyTime : Date.now(),
        }));
        return { ok: true, files, resolvedDir: dir };
    } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
    } finally {
        await sftp.end().catch(() => {});
    }
}

/* ─── List remote files ──────────────────────────────────────────────────── */

export async function listSftpFiles(): Promise<SftpFileInfo[]> {
    const sftp = new SftpClient();
    try {
        await sftp.connect(buildConnectConfig());
        const dir = await resolveRemoteDir(sftp);
        const list = await sftp.list(dir);
        return list.map((f: any) => ({
            name: f.name,
            size: f.size,
            modifyTime: typeof f.modifyTime === 'number' ? f.modifyTime : Date.now(),
        }));
    } finally {
        await sftp.end().catch(() => {});
    }
}

/* ─── Cents conversion ───────────────────────────────────────────────────── */

function toCents(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
}

/* ─── Row mappers ────────────────────────────────────────────────────────── */
// Actual SanMar SDL_N / EPDD column names confirmed from live file headers.
// The BOM character (ï»¿) may prefix UNIQUE_KEY — handled by stripping keys.

function col(row: Record<string, string>, ...keys: string[]): string {
    for (const k of keys) {
        // Strip BOM from key name in case csv-parse doesn't fully clean it
        const val = row[k] ?? row[k.replace(/^\ufeff/, '')] ?? row['\ufeff' + k];
        if (val !== undefined) return val.trim();
    }
    return '';
}

function mapSDLRow(row: Record<string, string>) {
    const style     = col(row, 'STYLE#', 'Style#', 'STYLE', 'Style', 'style');
    const colorName = col(row, 'COLOR_NAME', 'ColorName', 'COLOR');
    const sizeName  = col(row, 'SIZE', 'SizeName', 'Size');
    if (!style) return null;
    return {
        style,
        colorName,
        sizeName,
        title:            col(row, 'PRODUCT_TITLE', 'ProductTitle', 'StyleName')       || null,
        description:      col(row, 'PRODUCT_DESCRIPTION', 'Description')               || null,
        brand:            col(row, 'MILL', 'Brand', 'BrandName')                       || null,
        category:         col(row, 'CATEGORY_NAME', 'Category', 'MainCategory')        || null,
        subcategory:      col(row, 'SUBCATEGORY_NAME', 'SubCategory')                  || null,
        priceCents:       toCents(col(row, 'PIECE_PRICE', 'Price1', 'Price')),
        inventoryKey:     col(row, 'INVENTORY_KEY', 'InventoryKey')                    || null,
        colorSwatchImage: col(row, 'COLOR_SWATCH_IMAGE', 'ColorSwatch')                || null,
        productImage:     col(row, 'PRODUCT_IMAGE', 'FRONT_MODEL_IMAGE_URL', 'FrontModel') || null,
        weightLbs:        col(row, 'PIECE_WEIGHT', 'Weight')
                            ? parseFloat(col(row, 'PIECE_WEIGHT', 'Weight')) : null,
        rawData:          JSON.stringify(row).slice(0, 2000),
    };
}

function mapEPDDRow(row: Record<string, string>) {
    const base = mapSDLRow(row);
    if (!base) return null;
    return {
        ...base,
        category:     col(row, 'CATEGORY_NAME', 'MainCategory', 'Category') || base.category,
        subcategory:  col(row, 'SUBCATEGORY_NAME', 'SubCategory')            || base.subcategory,
        inventoryQty: parseInt(col(row, 'INVENTORY_QUANTITY', 'BulkInventory', 'Inventory') || '0', 10) || 0,
    };
}

/* ─── Stream-parse a local CSV file, upsert in batches ──────────────────── */
// Uses `for await` on the parser's async iterator — correct backpressure,
// no event-emitter race conditions, never holds more than batchSize rows in RAM.

async function streamCSVUpsert(
    localPath: string,
    mapper: (row: Record<string, string>) => any,
    upsertFn: (payload: any) => Promise<void>,
    batchSize = 100
): Promise<{ rowsTotal: number; rowsProcessed: number; headers?: string[] }> {
    let rowsTotal = 0;
    let rowsProcessed = 0;
    let batch: any[] = [];
    let headers: string[] | undefined;

    const parser = createReadStream(localPath, { encoding: 'latin1' }).pipe(
        parse({ delimiter: ',', columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true })
    );

    for await (const record of parser as AsyncIterable<Record<string, string>>) {
        // Capture headers from the first row for diagnostics
        if (!headers) {
            headers = Object.keys(record);
            console.log('[SanMar] CSV headers:', headers.join(' | '));
        }

        rowsTotal++;
        const payload = mapper(record);
        if (payload) batch.push(payload);

        if (batch.length >= batchSize) {
            const toFlush = batch.splice(0);
            for (const p of toFlush) await upsertFn(p);
            rowsProcessed += toFlush.length;
        }
    }

    for (const p of batch) await upsertFn(p);
    rowsProcessed += batch.length;

    return { rowsTotal, rowsProcessed, headers };
}

/* ─── Sync SDL_N catalog ─────────────────────────────────────────────────── */

export async function syncCatalogSDL(existingLogId?: string): Promise<SanmarSyncResult> {
    return runSync('CATALOG_SDL', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const files = await sftp.list(dir);
        const sdlFile = (files as any[]).find(f => /SanMar_SDL_N/i.test(f.name) && /\.csv$/i.test(f.name));
        if (!sdlFile) throw new Error(`SanMar_SDL_N CSV not found in "${dir}". Files: ${(files as any[]).map((f: any) => f.name).join(', ')}`);

        const localPath = `/tmp/sanmar_sdl_${Date.now()}.csv`;
        const remotePath = dir === '.' ? sdlFile.name : `${dir}/${sdlFile.name}`;
        await downloadToTemp(sftp, remotePath, localPath);
        await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { fileSizeBytes: sdlFile.size } });

        try {
            const result = await streamCSVUpsert(localPath, mapSDLRow, payload =>
                prisma.sanmarCatalogProduct.upsert({
                    where: { style_colorName_sizeName: { style: payload.style, colorName: payload.colorName, sizeName: payload.sizeName } },
                    update: payload,
                    create: { ...payload, inventoryQty: 0 },
                }).then(() => {})
            );
            return result;
        } finally {
            await unlink(localPath).catch(() => {});
        }
    }, existingLogId);
}

/* ─── Sync EPDD catalog ──────────────────────────────────────────────────── */

export async function syncCatalogEPDD(existingLogId?: string): Promise<SanmarSyncResult> {
    return runSync('CATALOG_EPDD', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const files = await sftp.list(dir);
        const epddFile = (files as any[]).find(f => /SanMar_EPDD/i.test(f.name) && /\.csv$/i.test(f.name));
        if (!epddFile) throw new Error(`SanMar_EPDD CSV not found in "${dir}". Files: ${(files as any[]).map((f: any) => f.name).join(', ')}`);

        const localPath = `/tmp/sanmar_epdd_${Date.now()}.csv`;
        const remotePath = dir === '.' ? epddFile.name : `${dir}/${epddFile.name}`;
        await downloadToTemp(sftp, remotePath, localPath);
        await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { fileSizeBytes: epddFile.size } });

        try {
            const result = await streamCSVUpsert(localPath, mapEPDDRow, payload =>
                prisma.sanmarCatalogProduct.upsert({
                    where: { style_colorName_sizeName: { style: payload.style, colorName: payload.colorName, sizeName: payload.sizeName } },
                    update: payload,
                    create: payload,
                }).then(() => {})
            );
            return result;
        } finally {
            await unlink(localPath).catch(() => {});
        }
    }, existingLogId);
}

/* ─── Sync inventory DIP (sanmar_dip.txt) ───────────────────────────────── */
// Streams line-by-line — never holds more than one batch in RAM.

export async function syncInventoryDip(existingLogId?: string): Promise<SanmarSyncResult> {
    return runSync('INVENTORY_DIP', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const remotePath = dir === '.' ? 'sanmar_dip.txt' : `${dir}/sanmar_dip.txt`;
        const localPath = `/tmp/sanmar_dip_${Date.now()}.txt`;

        await downloadToTemp(sftp, remotePath, localPath);

        try {
            let rowsTotal = 0;
            let rowsProcessed = 0;
            const BATCH = 200;
            let batch: Array<{ key: string; qty: number }> = [];

            const rl = createInterface({ input: createReadStream(localPath, { encoding: 'utf8' }), crlfDelay: Infinity });

            for await (const line of rl) {
                if (!line.includes('|')) continue;
                const pipe = line.indexOf('|');
                const key = line.slice(0, pipe).trim();
                const qty = parseInt(line.slice(pipe + 1).trim(), 10);
                if (!key || isNaN(qty)) continue;

                rowsTotal++;
                batch.push({ key, qty });

                if (batch.length >= BATCH) {
                    const toFlush = batch.splice(0);
                    for (const { key: inventoryKey, qty: inventoryQty } of toFlush) {
                        await prisma.sanmarCatalogProduct.updateMany({ where: { inventoryKey }, data: { inventoryQty } });
                    }
                    rowsProcessed += toFlush.length;
                    await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { rowsProcessed } }).catch(() => {});
                }
            }

            for (const { key: inventoryKey, qty: inventoryQty } of batch) {
                await prisma.sanmarCatalogProduct.updateMany({ where: { inventoryKey }, data: { inventoryQty } });
            }
            rowsProcessed += batch.length;

            return { rowsTotal, rowsProcessed };
        } finally {
            await unlink(localPath).catch(() => {});
        }
    }, existingLogId);
}

/* ─── Generic sync runner ────────────────────────────────────────────────── */

async function runSync(
    type: string,
    fn: (sftp: SftpClient, logId: string) => Promise<{ rowsTotal: number; rowsProcessed: number }>,
    existingLogId?: string
): Promise<SanmarSyncResult> {
    const startedAt = Date.now();
    const log = existingLogId
        ? { id: existingLogId }
        : await prisma.sanmarSyncLog.create({ data: { type, status: 'RUNNING' } });

    const sftp = new SftpClient();
    try {
        await sftp.connect(buildConnectConfig());
        const { rowsTotal, rowsProcessed } = await fn(sftp, log.id);
        await prisma.sanmarSyncLog.update({
            where: { id: log.id },
            data: { status: 'SUCCESS', rowsTotal, rowsProcessed, completedAt: new Date() },
        });
        return { logId: log.id, status: 'SUCCESS', rowsProcessed, rowsTotal, durationMs: Date.now() - startedAt };
    } catch (err: any) {
        const error = err?.message ?? String(err);
        await prisma.sanmarSyncLog.update({
            where: { id: log.id },
            data: { status: 'ERROR', error: error.slice(0, 2000), completedAt: new Date() },
        }).catch(() => {});
        return { logId: log.id, status: 'ERROR', rowsProcessed: 0, rowsTotal: 0, error, durationMs: Date.now() - startedAt };
    } finally {
        await sftp.end().catch(() => {});
    }
}
