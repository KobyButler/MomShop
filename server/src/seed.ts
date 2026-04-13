import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

async function main() {
    // --- Admin user ---
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@printshoppro.com';
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'changeme123';
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: { email: adminEmail, passwordHash, role: 'admin' }
    });
    console.log(`Admin user: ${adminEmail} / ${adminPassword}`);

    // --- Sample collection ---
    const col = await prisma.collection.upsert({
        where: { slug: 'booster-club' },
        update: {},
        create: { name: 'Booster Club', slug: 'booster-club', description: 'Team merch' }
    });

    // --- Sample products ---
    await prisma.product.upsert({
        where: { sku: 'K420' },
        update: {},
        create: {
            name: 'Polo K420',
            sku: 'K420',
            vendor: 'SANMAR',
            vendorIdentifier: '9203',
            brand: 'Port Authority',
            description: 'Pique Knit Polo',
            priceCents: 1999,
            imagesJson: JSON.stringify([]),
            collectionId: col.id
        }
    });

    await prisma.product.upsert({
        where: { sku: 'B22060655' },
        update: {},
        create: {
            name: 'Gildan 18500 Hoodie (Navy L)',
            sku: 'B22060655',
            vendor: 'SSACTIVEWEAR',
            vendorIdentifier: 'B00760003',
            brand: 'Gildan',
            description: 'Heavy Blend Hoodie',
            priceCents: 2899,
            imagesJson: JSON.stringify([]),
            collectionId: col.id
        }
    });

    // --- Sample shop ---
    await prisma.shop.upsert({
        where: { slug: 'panthers-boosters-1234' },
        update: {},
        create: { name: 'Panthers Boosters', slug: 'panthers-boosters-1234', collectionId: col.id }
    });

    // --- Sample discount ---
    await prisma.discountCode.upsert({
        where: { code: 'TEAM10' },
        update: {},
        create: { code: 'TEAM10', type: 'PERCENT', value: 10 }
    });

    console.log('Seed complete.');
}

main().finally(() => prisma.$disconnect());
