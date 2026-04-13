import nodemailer from 'nodemailer';
import { config } from '../config.js';

function createTransport() {
    if (!config.smtp.enable || !config.smtp.host) return null;
    return nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
}

type OrderEmailData = {
    orderId: string;
    customerName: string;
    customerEmail: string;
    totalCents: number;
    items: Array<{ name: string; quantity: number; size?: string | null; color?: string | null; priceCents: number }>;
    shopName?: string;
};

function fmt(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function buildOrderHtml(data: OrderEmailData): string {
    const itemRows = data.items.map(i => {
        const variant = [i.size, i.color].filter(Boolean).join(' / ');
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${i.name}${variant ? ` <span style="color:#94a3b8;font-size:12px;">(${variant})</span>` : ''}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${i.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${fmt(i.priceCents * i.quantity)}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#f8fafc;padding:24px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#4f46e5;padding:24px;">
      <h1 style="color:#fff;margin:0;font-size:18px;">Order Confirmation</h1>
      ${data.shopName ? `<p style="color:#c7d2fe;margin:4px 0 0;font-size:13px;">${data.shopName}</p>` : ''}
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#334155;">Hi <strong>${data.customerName}</strong>, your order has been received!</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;padding-top:8px;border-top:2px solid #f1f5f9;">
        <span style="font-size:15px;font-weight:700;color:#0f172a;">Total: ${fmt(data.totalCents)}</span>
      </div>
      <div style="margin-top:20px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b;">
        Order ID: <code style="font-family:monospace;font-weight:600;color:#334155;">#${data.orderId.slice(-8).toUpperCase()}</code>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
      PrintShop Pro &mdash; powered by love
    </div>
  </div>
</body>
</html>`;
}

export async function sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const transport = createTransport();
    if (!transport) {
        console.log(`[email] SMTP disabled — would send order confirmation to ${data.customerEmail}`);
        return;
    }

    const html = buildOrderHtml(data);
    const shortId = data.orderId.slice(-8).toUpperCase();

    await transport.sendMail({
        from: `"PrintShop Pro" <${config.smtp.from}>`,
        to: data.customerEmail,
        subject: `Order received! #${shortId}`,
        html
    });

    // Also notify admin if configured
    if (config.smtp.adminEmail) {
        await transport.sendMail({
            from: `"PrintShop Pro" <${config.smtp.from}>`,
            to: config.smtp.adminEmail,
            subject: `New order #${shortId} from ${data.customerName}`,
            html: `<p>New order received.</p><p>Customer: ${data.customerName} (${data.customerEmail})</p><p>Total: ${fmt(data.totalCents)}</p>` + html
        });
    }
}
