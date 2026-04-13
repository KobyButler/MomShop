# PrintShop Pro

Custom order management platform for a screen printing & embroidery business. Replaces Shopify/Etsy with zero platform fees and features built specifically for bulk group orders.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Express + Prisma ORM |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT (bcrypt passwords, localStorage + cookie) |
| Email | Nodemailer (SMTP) |
| Vendors | SanMar (SOAP) + S&S Activewear (REST) |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+

### 1. Clone and install

```bash
git clone <repo-url>
cd MomShop

# Install server deps
cd server && npm install

# Install web deps
cd ../web && npm install
```

### 2. Configure environment

```bash
# Server
cd server
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to something random

# Web (optional; defaults to localhost:4000)
cd ../web
cp .env.example .env.local
```

### 3. Database setup and seed

```bash
cd server

# Create / migrate the database
npx prisma migrate dev

# Seed with an admin user + sample data
npm run seed
```

The seed script creates:
- Admin user: `admin@printshoppro.com` / `changeme123` (override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars)
- Sample collection, two products, one shop, and a discount code

### 4. Start both servers

Open two terminals:

```bash
# Terminal 1 — API server (port 4000)
cd server && npm run dev

# Terminal 2 — Next.js dev server (port 3000)
cd web && npm run dev
```

Visit:
- Admin dashboard: http://localhost:3000 (login required)
- Sample storefront: http://localhost:3000/shop/panthers-boosters-1234

---

## Key Concepts

### Group Shops
Admin creates a **Shop** linked to a **Collection**. The shop gets a unique slug URL (`/shop/[slug]`) that can be shared with a team or event group. Everyone orders individually; orders are batched in the admin.

### Order Flow
1. Customer visits `/shop/[slug]`
2. Browses products, selects sizes/colors, adds to cart
3. Fills in contact + shipping info, optionally applies a discount code
4. Submits → order created → vendor fulfillment triggered → confirmation email sent

### Vendor Fulfillment
- **SanMar**: SOAP API. Set `SANMAR_ENABLE=true` and fill in credentials to auto-submit POs.
- **S&S Activewear**: REST API. Set `SS_ENABLE=true` and fill in credentials.
- Both are fire-and-forget after order creation. Results are stored in `VendorOrder` records visible in the order detail modal.

### Pricing
All prices stored in **cents** (integers) in the database. The UI converts to/from dollars automatically.

---

## Production Deployment

### Option A — Railway / Render / Fly.io (recommended for quick start)

1. **Database**: Provision a PostgreSQL instance and set `DATABASE_URL` to the connection string.
2. **Server**: Deploy the `server/` directory. Set all env vars from `server/.env.example`. Run `npm run build` then `node dist/index.js`.
3. **Web**: Deploy the `web/` directory as a Next.js app. Set `NEXT_PUBLIC_API_BASE` to your API URL (e.g. `https://api.yourdomain.com/api`).

### Option B — VPS (DigitalOcean, Linode, etc.)

1. Install Node 18+ and PostgreSQL on the server.
2. Clone the repo, install deps, run migrations: `npx prisma migrate deploy`.
3. Use **PM2** to keep the Express server running: `pm2 start dist/index.js --name printshop-api`.
4. Use **Nginx** as a reverse proxy — route `/api` to port 4000 and everything else to the Next.js server on port 3000.
5. Add an SSL certificate with **Certbot** (Let's Encrypt).

### Environment checklist for production

- [ ] `JWT_SECRET` — long random string (e.g. `openssl rand -hex 32`)
- [ ] `DATABASE_URL` — PostgreSQL connection string
- [ ] `CORS_ORIGINS` — your frontend domain (e.g. `https://printshoppro.com`)
- [ ] `SMTP_*` — your email provider credentials (SendGrid, Mailgun, Gmail SMTP, etc.)
- [ ] `ADMIN_EMAIL` / `ADMIN_PASSWORD` — run `npm run seed` once after deploy to create the admin account
- [ ] `SANMAR_*` / `SS_*` — vendor credentials when ready to go live

### After first deploy

```bash
# On the server, run seed once to create your admin account
cd server && npm run seed
```

Then log in and immediately change your password (currently there is no in-app password reset — update it directly in the DB or re-seed with new `ADMIN_PASSWORD`).

---

## Project Structure

```
MomShop/
├── server/                  Express API
│   ├── src/
│   │   ├── routes/          REST route handlers
│   │   ├── middleware/      auth.ts (JWT requireAuth)
│   │   ├── utils/           email.ts, slugify.ts
│   │   ├── vendors/         sanmar.ts, ssactivewear.ts, fulfill.ts
│   │   ├── config.ts        centralised env config
│   │   ├── prisma.ts        Prisma client singleton
│   │   └── seed.ts          seed script
│   ├── prisma/
│   │   └── schema.prisma
│   └── public/uploads/      product images (served at /uploads/*)
└── web/                     Next.js frontend
    ├── app/
    │   ├── admin/           admin pages (orders, products, shops, …)
    │   ├── shop/[slug]/     public storefront
    │   ├── login/           login page
    │   └── lib/api.ts       fetch helper (attaches JWT)
    ├── components/
    │   ├── admin/AdminShell.tsx   sidebar layout + logout
    │   └── ui/              Button, Card, Badge, Modal, Toast, Input, Select
    └── middleware.ts         Next.js edge middleware (auth guard)
```
