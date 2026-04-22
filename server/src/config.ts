import 'dotenv/config';

function bool(v: string | undefined, def = false) {
    if (v === undefined) return def;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret: process.env.JWT_SECRET ?? 'devsecret',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
        .split(',').map(s => s.trim()),

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY ?? '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
        enable: bool(process.env.STRIPE_ENABLE, true),
    },

    ss: {
        user: process.env.SS_USER ?? '',
        apiKey: process.env.SS_API_KEY ?? '',
        enable: bool(process.env.SS_ENABLE)
    },

    smtp: {
        host: process.env.SMTP_HOST ?? '',
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        from: process.env.SMTP_FROM ?? 'hello@crossroadscustomapparel.com',
        adminEmail: process.env.ADMIN_NOTIFY_EMAIL ?? '',
        enable: bool(process.env.SMTP_ENABLE)
    },

    sanmar: {
        customerNumber: process.env.SANMAR_CUSTOMER_NUMBER ?? '',
        username: process.env.SANMAR_USERNAME ?? '',
        password: process.env.SANMAR_PASSWORD ?? '',
        wsdlUrl: process.env.SANMAR_WSDL_URL ?? '',
        inventoryWsdlUrl: process.env.SANMAR_INVENTORY_WSDL_URL ?? '',
        inventoryStageWsdlUrl: process.env.SANMAR_INVENTORY_STAGE_WSDL_URL ?? '',
        productInfoWsdlUrl: process.env.SANMAR_PRODUCTINFO_WSDL_URL ?? '',
        enable: bool(process.env.SANMAR_ENABLE),
        sftp: {
            host: process.env.SANMAR_SFTP_HOST ?? '',
            port: Number(process.env.SANMAR_SFTP_PORT ?? 2200),
            user: process.env.SANMAR_SFTP_USER ?? '',
            password: process.env.SANMAR_SFTP_PASSWORD ?? '',
            enable: bool(process.env.SANMAR_SFTP_ENABLE),
            remoteDir: process.env.SANMAR_SFTP_DIR ?? 'SanmarPDD'
        }
    }
};
