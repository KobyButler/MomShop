import SftpClient from 'ssh2-sftp-client';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
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

/* ─── Connection helper ──────────────────────────────────────────────────── */

function buildConnectConfig(): any {
    const { host, port, user, password } = config.sanmar.sftp;
    if (!host || !user || !password) {
        throw new Error('SANMAR_SFTP_HOST, SANMAR_SFTP_USER, and SANMAR_SFTP_PASSWORD must be set');
    }
    return {
        host,
        port,
        username: user,
        password,
        // SanMar requires explicit algorithm negotiation on some setups
        algorithms: {
            kex: [
                'ecdh-sha2-nistp256',
                'ecdh-sha2-nistp384',
                'ecdh-sha2-nistp521',
                'diffie-hellman-group-exchange-sha256',
                'diffie-hellman-group14-sha1',
            ],
            cipher: [
                'aes128-gcm@openssh.com',
                'aes256-gcm@openssh.com',
                'aes128-ctr',
                'aes192-ctr',
                'aes256-ctr',
            ],
        },
        readyTimeout: 20000,
        retries: 2,
        retry_factor: 2,
        retry_minTimeout: 2000,
    };
}

/* ─── Discover the actual remote directory ───────────────────────────────── */
// SanMar sometimes places files at root or under a differently-cased folder.
// We try the configured dir first, then root, then any dir that looks like PDD.

async function resolveRemoteDir(sftp: SftpClient): Promise<string> {
    const configured = config.sanmar.sftp.remoteDir;

    // Try configured dir first
    try {
        await sftp.list(configured);
        return configured;
    } catch { /* fall through */ }

    // List root to discover what's actually there
    const rootEntries = await sftp.list('.');
    const dirs = rootEntries.filter((e: any) => e.type === 'd').map((e: any) => e.name as string);

    // Look for a directory matching the configured name (case-insensitive)
    const match = dirs.find(d => d.toLowerCase() === configured.toLowerCase())
        ?? dirs.find(d => d.toLowerCase().includes('pdd'))
        ?? dirs.find(d => d.toLowerCase().includes('sanmar'));

    if (match) return match;

    // Nothing found — files may be at root level
    return '.';
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

/* ─── Download file to buffer ────────────────────────────────────────────── */

async function downloadToBuffer(sftp: SftpClient, filename: string, remoteDir: string): Promise<Buffer> {
    const remotePath = remoteDir === '.' ? filename : `${remoteDir}/${filename}`;
    // ssh2-sftp-client returns a Buffer when no dst argument is given
    const data = await (sftp as any).get(remotePath);
    if (Buffer.isBuffer(data)) return data;
    // Fallback: collect stream
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        (data as NodeJS.ReadableStream)
            .on('data', (c: Buffer) => chunks.push(c))
            .on('end', () => resolve(Buffer.concat(chunks)))
            .on('error', reject);
    });
}

/* ─── CSV parser helper ──────────────────────────────────────────────────── */

function parseCSV(buffer: Buffer, delimiter = ','): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
        const rows: Record<string, string>[] = [];
        const stream = Readable.from(buffer.toString('latin1'));
        stream.pipe(parse({
            delimiter,
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            bom: true,
        }))
            .on('data', (row: Record<string, string>) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

/* ─── Cents conversion ───────────────────────────────────────────────────── */

function toCents(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
}

/* ─── Map SDL_N row → upsert payload ────────────────────────────────────── */
// SanMar_SDL_N columns (order may vary — we access by header name):
// Style, StyleName, Brand, PartNumber, InventoryKey, Description,
// SizeIndex, SizeName, ColorName, ColorCode, Color, Category, SubCategory,
// Price1–Price6, FrontModel, BackModel, ColorSwatch, ProductTitle

function mapSDLRow(row: Record<string, string>) {
    const style      = (row['Style'] ?? row['STYLE'] ?? row['style'] ?? '').trim();
    const colorName  = (row['ColorName'] ?? row['Color'] ?? row['COLOR'] ?? '').trim();
    const sizeName   = (row['SizeName'] ?? row['SIZE'] ?? row['Size'] ?? '').trim();

    // Skip rows with no style
    if (!style) return null;

    return {
        style,
        colorName,
        sizeName,
        title:            (row['ProductTitle'] ?? row['StyleName'] ?? '').trim() || null,
        description:      (row['Description'] ?? '').trim() || null,
        brand:            (row['Brand'] ?? row['BrandName'] ?? '').trim() || null,
        category:         (row['Category'] ?? row['MainCategory'] ?? '').trim() || null,
        subcategory:      (row['SubCategory'] ?? '').trim() || null,
        priceCents:       toCents(row['Price1'] ?? row['Price']),
        inventoryKey:     (row['InventoryKey'] ?? '').trim() || null,
        colorSwatchImage: (row['ColorSwatch'] ?? row['ColorSwatchImage'] ?? '').trim() || null,
        productImage:     (row['FrontModel'] ?? row['ProductImage'] ?? '').trim() || null,
        weightLbs:        row['Weight'] ? parseFloat(row['Weight']) : null,
        rawData:          JSON.stringify(row).slice(0, 2000),
    };
}

/* ─── Map EPDD row → upsert payload ─────────────────────────────────────── */
// EPDD adds: BulkInventory, MainCategory, SubCategory columns

function mapEPDDRow(row: Record<string, string>) {
    const base = mapSDLRow(row);
    if (!base) return null;
    return {
        ...base,
        category:      (row['MainCategory'] ?? row['Category'] ?? base.category ?? '').trim() || null,
        subcategory:   (row['SubCategory'] ?? base.subcategory ?? '').trim() || null,
        inventoryQty:  parseInt(row['BulkInventory'] ?? row['Inventory'] ?? '0', 10) || 0,
    };
}

/* ─── Sync SDL_N catalog file ────────────────────────────────────────────── */

export async function syncCatalogSDL(): Promise<SanmarSyncResult> {
    return runSync('CATALOG_SDL', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const files = await sftp.list(dir);
        const sdlFile = (files as any[]).find(f => /SanMar_SDL_N/i.test(f.name) && /\.csv$/i.test(f.name));
        if (!sdlFile) throw new Error(`SanMar_SDL_N CSV not found in "${dir}". Files: ${(files as any[]).map((f:any)=>f.name).join(', ')}`);

        const buf = await downloadToBuffer(sftp, sdlFile.name, dir);
        await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { fileSizeBytes: buf.length } });

        const rows = await parseCSV(buf);
        let processed = 0;
        const BATCH = 500;

        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            const payloads = batch.map(mapSDLRow).filter(Boolean) as ReturnType<typeof mapSDLRow>[];

            await Promise.all(payloads.map(p =>
                prisma.sanmarCatalogProduct.upsert({
                    where: { style_colorName_sizeName: { style: p!.style, colorName: p!.colorName, sizeName: p!.sizeName } },
                    update: p!,
                    create: { ...p!, inventoryQty: 0 },
                })
            ));
            processed += payloads.length;
        }

        return { rowsTotal: rows.length, rowsProcessed: processed };
    });
}

/* ─── Sync EPDD catalog file ─────────────────────────────────────────────── */

export async function syncCatalogEPDD(): Promise<SanmarSyncResult> {
    return runSync('CATALOG_EPDD', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const files = await sftp.list(dir);
        const epddFile = (files as any[]).find(f => /SanMar_EPDD/i.test(f.name) && /\.csv$/i.test(f.name));
        if (!epddFile) throw new Error(`SanMar_EPDD CSV not found in "${dir}". Files: ${(files as any[]).map((f:any)=>f.name).join(', ')}`);

        const buf = await downloadToBuffer(sftp, epddFile.name, dir);
        await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { fileSizeBytes: buf.length } });

        const rows = await parseCSV(buf);
        let processed = 0;
        const BATCH = 500;

        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            const payloads = batch.map(mapEPDDRow).filter(Boolean) as NonNullable<ReturnType<typeof mapEPDDRow>>[];

            await Promise.all(payloads.map(p =>
                prisma.sanmarCatalogProduct.upsert({
                    where: { style_colorName_sizeName: { style: p.style, colorName: p.colorName, sizeName: p.sizeName } },
                    update: p,
                    create: p,
                })
            ));
            processed += payloads.length;
        }

        return { rowsTotal: rows.length, rowsProcessed: processed };
    });
}

/* ─── Sync inventory DIP file (hourly) ──────────────────────────────────── */
// sanmar_dip.txt format: InventoryKey|Qty  (pipe-delimited, no header)

export async function syncInventoryDip(): Promise<SanmarSyncResult> {
    return runSync('INVENTORY_DIP', async (sftp, logId) => {
        const dir = await resolveRemoteDir(sftp);
        const remotePath = dir === '.' ? 'sanmar_dip.txt' : `${dir}/sanmar_dip.txt`;
        const data = await (sftp as any).get(remotePath);
        const buf: Buffer = Buffer.isBuffer(data) ? data : await new Promise((res, rej) => {
            const chunks: Buffer[] = [];
            (data as NodeJS.ReadableStream)
                .on('data', (c: Buffer) => chunks.push(c))
                .on('end', () => res(Buffer.concat(chunks)))
                .on('error', rej);
        });

        await prisma.sanmarSyncLog.update({ where: { id: logId }, data: { fileSizeBytes: buf.length } });

        const lines = buf.toString('utf8').split(/\r?\n/).filter(l => l.includes('|'));
        let processed = 0;
        const BATCH = 1000;

        for (let i = 0; i < lines.length; i += BATCH) {
            const batch = lines.slice(i, i + BATCH);
            await Promise.all(batch.map(async line => {
                const parts = line.split('|');
                const inventoryKey = parts[0]?.trim();
                const qty = parseInt(parts[1]?.trim() ?? '0', 10);
                if (!inventoryKey || isNaN(qty)) return;

                await prisma.sanmarCatalogProduct.updateMany({
                    where: { inventoryKey },
                    data: { inventoryQty: qty },
                });
            }));
            processed += batch.length;
        }

        return { rowsTotal: lines.length, rowsProcessed: processed };
    });
}

/* ─── Generic sync runner with logging ──────────────────────────────────── */

async function runSync(
    type: string,
    fn: (sftp: SftpClient, logId: string) => Promise<{ rowsTotal: number; rowsProcessed: number }>
): Promise<SanmarSyncResult> {
    const startedAt = Date.now();
    const log = await prisma.sanmarSyncLog.create({ data: { type, status: 'RUNNING' } });

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
