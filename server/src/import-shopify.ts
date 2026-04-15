/**
 * Shopify → Crossroads Custom Apparel data importer
 *
 * Usage:
 *   npm run import:shopify -- --products products_export.csv
 *   npm run import:shopify -- --customers customers_export.csv
 *   npm run import:shopify -- --orders orders_export.csv
 *   npm run import:shopify -- --products p.csv --customers c.csv --orders o.csv
 *
 * How to export from Shopify:
 *   Products:  Admin → Products → Export → All products → CSV for Excel
 *   Customers: Admin → Customers → Export → All customers → CSV for Excel
 *   Orders:    Admin → Orders → Export → All time → CSV for Excel
 */

import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { prisma } from './prisma.js';
import slugify from './utils/slugify.js';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function readCsv(filePath: string): Record<string, string>[] {
    const content = fs.readFileSync(path.resolve(filePath), 'utf8');
    return parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true  // Shopify CSVs sometimes have a BOM
    }) as Record<string, string>[];
}

function cents(dollarStr: string): number {
    const n = parseFloat(dollarStr.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
}

function col(row: Record<string, string>, ...keys: string[]): string {
    for (const k of keys) {
        const v = row[k] ?? row[k.toLowerCase()] ?? '';
        if (v) return v.trim();
    }
    return '';
}

// ---------------------------------------------------------------------------
// Products import
// ---------------------------------------------------------------------------
// Shopify products CSVs have one row per variant.  Multiple rows with the
// same Handle belong to one product.  We collapse them into a single product
// and collect all unique size / color option values.

async function importProducts(filePath: string) {
    console.log(`\nImporting products from ${filePath}…`);
    const rows = readCsv(filePath);

    // Group rows by Handle (= one product)
    const byHandle: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
        const handle = col(row, 'Handle');
        if (!handle) continue;
        (byHandle[handle] ??= []).push(row);
    }

    let created = 0, updated = 0, skipped = 0;

    for (const [handle, variants] of Object.entries(byHandle)) {
        const first = variants[0];
        const title = col(first, 'Title');
        const vendor = col(first, 'Vendor');
        const productType = col(first, 'Type', 'Product Category');
        const bodyHtml = col(first, 'Body (HTML)', 'Body');

        // Strip HTML tags for plain-text description
        const description = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

        // Collect variant option names and values
        const sizeValues = new Set<string>();
        const colorValues = new Set<string>();
        let priceCents = 0;
        let sku = '';

        for (const v of variants) {
            // Figure out which option is size vs color
            for (let i = 1; i <= 3; i++) {
                const optName = col(v, `Option${i} Name`).toLowerCase();
                const optVal = col(v, `Option${i} Value`);
                if (!optVal || optVal === 'Default Title') continue;
                if (/size|sz/.test(optName)) sizeValues.add(optVal);
                else if (/colou?r/.test(optName)) colorValues.add(optVal);
                // other options (style, material, etc.) are ignored for now
            }

            // Use the first SKU that isn't empty
            if (!sku) sku = col(v, 'Variant SKU');

            // Use the first price
            if (priceCents === 0) priceCents = cents(col(v, 'Variant Price'));
        }

        if (!title) { skipped++; continue; }

        // Ensure a collection exists for this product type
        const collectionName = productType || 'Imported from Shopify';
        const collectionSlug = slugify(collectionName);
        const collection = await prisma.collection.upsert({
            where: { slug: collectionSlug },
            update: {},
            create: { name: collectionName, slug: collectionSlug, description: `Imported from Shopify` }
        });

        // Build a stable SKU: prefer the Shopify SKU, fall back to handle
        const finalSku = sku || handle;

        // Product images (collect all unique image URLs)
        const images = variants
            .map(v => col(v, 'Image Src'))
            .filter((url, i, arr) => url && arr.indexOf(url) === i);

        const data = {
            name: title,
            sku: finalSku,
            vendor: vendor ? vendor.toUpperCase().replace(/\s+/g, '_').slice(0, 20) : 'OTHER',
            brand: vendor || undefined,
            description: description || undefined,
            priceCents,
            imagesJson: JSON.stringify(images),
            sizesJson: sizeValues.size > 0 ? JSON.stringify([...sizeValues]) : null,
            colorsJson: colorValues.size > 0 ? JSON.stringify([...colorValues]) : null,
            collectionId: collection.id
        };

        try {
            const existing = await prisma.product.findUnique({ where: { sku: finalSku } });
            if (existing) {
                await prisma.product.update({ where: { sku: finalSku }, data });
                updated++;
            } else {
                await prisma.product.create({ data });
                created++;
            }
        } catch (err: any) {
            console.warn(`  Skipping "${title}" (${finalSku}): ${err.message}`);
            skipped++;
        }
    }

    console.log(`  Products: ${created} created, ${updated} updated, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Customers import
// ---------------------------------------------------------------------------

async function importCustomers(filePath: string) {
    console.log(`\nImporting customers from ${filePath}…`);
    const rows = readCsv(filePath);
    let created = 0, updated = 0, skipped = 0;

    for (const row of rows) {
        const email = col(row, 'Email').toLowerCase();
        if (!email) { skipped++; continue; }

        const firstName = col(row, 'First Name');
        const lastName = col(row, 'Last Name');
        const name = [firstName, lastName].filter(Boolean).join(' ') || email;

        try {
            const existing = await prisma.customer.findUnique({ where: { email } });
            if (existing) {
                await prisma.customer.update({ where: { email }, data: { name } });
                updated++;
            } else {
                await prisma.customer.create({ data: { email, name } });
                created++;
            }
        } catch (err: any) {
            console.warn(`  Skipping ${email}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`  Customers: ${created} created, ${updated} updated, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Orders import
// ---------------------------------------------------------------------------
// Shopify orders CSVs have one row per line item.  Rows with the same "Name"
// (e.g. "#1001") belong to the same order.  We group them and create one
// Order + N OrderItems.

async function importOrders(filePath: string) {
    console.log(`\nImporting orders from ${filePath}…`);
    const rows = readCsv(filePath);

    // Group by order name (e.g. "#1001")
    const byName: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
        const name = col(row, 'Name');
        if (!name) continue;
        (byName[name] ??= []).push(row);
    }

    let created = 0, skipped = 0;

    for (const [orderName, lineRows] of Object.entries(byName)) {
        const first = lineRows[0];

        const email = col(first, 'Email').toLowerCase();
        const customerName = col(first, 'Shipping Name', 'Billing Name') || email;
        const shipAddress1 = col(first, 'Shipping Address1', 'Billing Address1') || '—';
        const shipAddress2 = col(first, 'Shipping Address2', 'Billing Address2') || undefined;
        const shipCity = col(first, 'Shipping City', 'Billing City') || '—';
        const shipState = col(first, 'Shipping Province Code', 'Shipping Province', 'Billing Province Code', 'Billing Province') || '—';
        const shipZip = col(first, 'Shipping Zip', 'Billing Zip') || '—';
        const totalStr = col(first, 'Total');
        const totalCents = cents(totalStr);
        const createdAtStr = col(first, 'Created at');
        const createdAt = createdAtStr ? new Date(createdAtStr) : new Date();
        const fulfillmentStatus = col(first, 'Fulfillment Status').toUpperCase();
        const financialStatus = col(first, 'Financial Status').toLowerCase();
        const cancelledAt = col(first, 'Cancelled at');

        let status = 'UNFULFILLED';
        if (cancelledAt) status = 'CANCELLED';
        else if (fulfillmentStatus === 'FULFILLED' || fulfillmentStatus === 'SHIPPED') status = 'FULFILLED';

        // Skip unpaid / voided orders
        if (financialStatus === 'voided' || financialStatus === 'refunded') {
            skipped++;
            continue;
        }

        if (!email) { skipped++; continue; }

        // Upsert customer
        const customer = await prisma.customer.upsert({
            where: { email },
            update: {},
            create: { email, name: customerName }
        });

        // Build order items — try to match products by SKU
        const orderItems: { productId: string; quantity: number; priceCents: number; size?: string; color?: string }[] = [];

        for (const lineRow of lineRows) {
            const lineSku = col(lineRow, 'Lineitem sku');
            const lineName = col(lineRow, 'Lineitem name');
            const lineQty = parseInt(col(lineRow, 'Lineitem quantity') || '1', 10);
            const linePrice = cents(col(lineRow, 'Lineitem price'));

            let product = lineSku ? await prisma.product.findUnique({ where: { sku: lineSku } }) : null;

            // Fall back: find by name if SKU didn't match
            if (!product && lineName) {
                product = await prisma.product.findFirst({ where: { name: { contains: lineName.split(' - ')[0].trim() } } });
            }

            if (!product) {
                // Create a placeholder product in an "Archived" collection so the order still imports
                const archiveColl = await prisma.collection.upsert({
                    where: { slug: 'shopify-archived' },
                    update: {},
                    create: { name: 'Shopify Archived', slug: 'shopify-archived', description: 'Products from Shopify that no longer exist' }
                });
                const safeSku = lineSku || `shopify-${slugify(lineName || 'item').slice(0, 40)}-${Date.now()}`;
                try {
                    product = await prisma.product.create({
                        data: {
                            name: lineName || 'Unknown Product',
                            sku: safeSku,
                            vendor: 'OTHER',
                            priceCents: linePrice,
                            imagesJson: '[]',
                            collectionId: archiveColl.id
                        }
                    });
                } catch {
                    // If duplicate SKU from a previous loop iteration, look it up
                    product = await prisma.product.findUnique({ where: { sku: safeSku } }) ?? null;
                    if (!product) continue;
                }
            }

            orderItems.push({
                productId: product.id,
                quantity: isNaN(lineQty) || lineQty < 1 ? 1 : lineQty,
                priceCents: linePrice
            });
        }

        if (orderItems.length === 0) { skipped++; continue; }

        try {
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    customerName,
                    customerEmail: email,
                    status,
                    shipAddress1,
                    shipAddress2: shipAddress2 ?? null,
                    shipCity,
                    shipState: shipState.slice(0, 2),
                    shipZip,
                    totalCents,
                    createdAt,
                    items: { createMany: { data: orderItems } }
                }
            });
            created++;
        } catch (err: any) {
            console.warn(`  Skipping order ${orderName}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`  Orders: ${created} created, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
    const args = process.argv.slice(2);

    function getArg(flag: string): string | undefined {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    }

    const productsFile = getArg('--products');
    const customersFile = getArg('--customers');
    const ordersFile = getArg('--orders');

    if (!productsFile && !customersFile && !ordersFile) {
        console.error(`
Usage:
  npm run import:shopify -- --products products_export.csv
  npm run import:shopify -- --customers customers_export.csv
  npm run import:shopify -- --orders orders_export.csv
  npm run import:shopify -- --products p.csv --customers c.csv --orders o.csv

How to get the CSVs from Shopify:
  Products:  Admin → Products → Export → All products → CSV for Excel
  Customers: Admin → Customers → Export → All customers → CSV for Excel
  Orders:    Admin → Orders → Export → All time → CSV for Excel
`);
        process.exit(1);
    }

    // Run in dependency order: products first (orders reference products), customers second
    if (productsFile) await importProducts(productsFile);
    if (customersFile) await importCustomers(customersFile);
    if (ordersFile) await importOrders(ordersFile);

    console.log('\nImport complete.');
}

main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
