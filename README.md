# Crossroads Custom Apparel

Order management platform for Crossroads Custom Apparel — a screen printing & embroidery business. Replaces Shopify/Etsy with zero platform fees and features built specifically for bulk group orders.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Express + Prisma ORM |
| Database | SQLite (persistent volume) |
| Auth | JWT (bcrypt passwords, localStorage + cookie) |
| Email | Nodemailer (Google Workspace SMTP) |
| Payments | Stripe (card, Apple Pay, Google Pay) + pay-at-pickup |
| Vendors | SanMar (SOAP) + S&S Activewear (REST) |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+

### 1. Clone and install

```bash
git clone <repo-url>
cd crossroads-custom-apparel

# Install server deps
cd server && npm install

# Install web deps
cd ../web && npm install
```

### 2. Configure environment

```bash
# Server — already configured in server/.env
# Web — already configured in web/.env.local
```

### 3. Database setup and seed

```bash
cd server

# Create / migrate the database
npx prisma migrate dev

# Seed with the admin user + sample data
npm run seed
```

Admin credentials are set by `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`.

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

### 5. Test Stripe payments locally

```bash
# Terminal 3 — forward webhooks to local server
stripe listen --forward-to http://localhost:4000/api/payments/webhook
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET` in `server/.env`.

Test card: `4242 4242 4242 4242` — any future expiry, any CVC.

---

## Key Concepts

### Group Shops
Admin creates a **Shop** linked to a **Collection**. The shop gets a unique slug URL (`/shop/[slug]`) shared with a team or event group. Everyone orders individually; orders are batched in the admin.

### Order Flow
1. Customer visits `/shop/[slug]`
2. Browses products, selects sizes/colors, adds to cart
3. Fills in contact + shipping info, selects payment method
4. **Online**: Stripe payment → order marked PAID → confirmation email sent
5. **Pay at pickup**: Order created as OFFLINE_PENDING → admin and customer notified by email

### Vendor Fulfillment
- **SanMar**: SOAP API. Set `SANMAR_ENABLE=true` and fill in credentials. Requires static IP whitelisting by SanMar.
- **S&S Activewear**: REST API. Set `SS_ENABLE=true` and fill in credentials.
- Both are fire-and-forget after order creation. Results are stored in `VendorOrder` records visible in the order detail modal.

### Pricing
All prices stored in **cents** (integers) in the database. The UI converts to/from dollars automatically.

---

## Production Deployment

Deployed on **Render** (server) + **Vercel** (frontend).

- Server URL: set as `NEXT_PUBLIC_API_BASE` in Vercel environment variables
- Persistent disk mounted at `/data` for SQLite + uploaded images
- After first deploy, run `npx prisma migrate deploy && npm run seed` via Render shell

### Environment checklist for production

- [ ] `JWT_SECRET` — long random string
- [ ] `DATABASE_URL=file:/data/dev.db`
- [ ] `UPLOADS_DIR=/data/uploads`
- [ ] `CORS_ORIGINS` — production frontend domain
- [ ] `SMTP_*` — Google Workspace SMTP credentials
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard
- [ ] `ADMIN_EMAIL` / `ADMIN_PASSWORD` — run `npm run seed` once after deploy
- [ ] `SANMAR_*` / `SS_*` — vendor credentials

---

## Project Structure

```
crossroads-custom-apparel/
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
    ├── public/
    │   └── logo.png         Crossroads Custom Apparel logo
    └── middleware.ts         Next.js edge middleware (auth guard)
```
