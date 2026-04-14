import { config } from '../config.js';
import soap from 'soap';

type LineGroup = Array<{
    item: any;
    product: { vendorIdentifier: string | null; sku: string };
}>;

/* ─── PO Submission ───────────────────────────────────────────────────────── */

export async function submitOrderToSanMar(order: any, lines: LineGroup) {
    if (!config.sanmar.enable) return { dryRun: true, note: 'SANMAR_ENABLE=false' };
    if (!config.sanmar.wsdlUrl) throw new Error('SANMAR_WSDL_URL is required');
    if (!config.sanmar.customerNumber) throw new Error('SANMAR_CUSTOMER_NUMBER is required');

    const client = await soap.createClientAsync(config.sanmar.wsdlUrl);

    const poEnvelope = buildPOEnvelope(order, lines);
    const auth = poAuthArgs();

    // Optional pre-submit availability check (non-fatal if it fails)
    try {
        await client.getPreSubmitInfoAsync({ arg0: poEnvelope, arg1: auth });
    } catch {
        // presubmit failures are non-fatal; submitPO often returns clearer messages
    }

    const [resp] = await client.submitPOAsync({ arg0: poEnvelope, arg1: auth });
    return { message: resp?.return?.message ?? 'Submitted', poNumber: order.id, raw: resp };
}

function buildPOEnvelope(order: any, lines: LineGroup) {
    return {
        attention: order.customerName,
        notes: '',
        poNum: order.id,
        shipTo: order.customerName,
        shipAddress1: order.shipAddress1,
        shipAddress2: order.shipAddress2 ?? '',
        shipCity: order.shipCity,
        shipState: order.shipState,
        shipZip: order.shipZip,
        shipMethod: 'UPS',
        shipEmail: order.customerEmail ?? 'hello@crossroadscustomapparel.com',
        residence: order.residential ? 'Y' : 'N',
        department: '',
        webServicePoDetailList: lines.map(({ item, product }) => ({
            inventoryKey: product.vendorIdentifier ?? '',
            sizeIndex: null,
            style: product.sku,
            color: item.color ?? '',
            size: item.size ?? '',
            quantity: item.quantity,
            whseNo: null
        }))
    };
}

// Auth object used for PO services (nested in arg1)
function poAuthArgs() {
    return {
        senderId: '',
        senderPassword: '',
        sanMarCustomerNumber: Number(config.sanmar.customerNumber || 0),
        sanMarUserName: config.sanmar.username,
        sanMarUserPassword: config.sanmar.password
    };
}

/* ─── Inventory Check ─────────────────────────────────────────────────────── */

export interface InventoryResult {
    style: string;
    color: string;
    size: string;
    qty: number;
    /** true if the SOAP call was skipped (not enabled / missing config) */
    dryRun?: boolean;
}

/**
 * Check inventory for a single style/color/size combination.
 * The SanMar inventory service uses individual positional args (arg0–arg5),
 * not a nested auth object like the PO service.
 */
export async function checkSanMarInventory(
    style: string,
    color: string,
    size: string
): Promise<InventoryResult> {
    if (!config.sanmar.enable) {
        return { style, color, size, qty: 0, dryRun: true };
    }

    const wsdlUrl = config.sanmar.inventoryWsdlUrl || config.sanmar.inventoryStageWsdlUrl;
    if (!wsdlUrl) throw new Error('SANMAR_INVENTORY_WSDL_URL is required');
    if (!config.sanmar.customerNumber) throw new Error('SANMAR_CUSTOMER_NUMBER is required');

    const client = await soap.createClientAsync(wsdlUrl);

    // Inventory service auth uses individual positional args (not a nested object)
    const [resp] = await client.getInventoryQtyForStyleColorSizeAsync({
        arg0: style,
        arg1: color,
        arg2: size,
        arg3: Number(config.sanmar.customerNumber),
        arg4: config.sanmar.username,
        arg5: config.sanmar.password,
    });

    const qty = Number(resp?.return ?? resp?.qty ?? 0);
    return { style, color, size, qty };
}

/* ─── Product Info ────────────────────────────────────────────────────────── */

export interface SanMarProduct {
    style: string;
    title?: string;
    description?: string;
    colors?: string[];
    sizes?: string[];
    basePrice?: number;
    raw?: any;
}

/**
 * Fetch product information from SanMar's Product Info service.
 * Auth pattern: nested object inside arg1 (same pattern as PO service).
 */
export async function getSanMarProductInfo(style: string): Promise<SanMarProduct> {
    if (!config.sanmar.enable) {
        return { style, dryRun: true } as any;
    }

    const wsdlUrl = config.sanmar.productInfoWsdlUrl;
    if (!wsdlUrl) throw new Error('SANMAR_PRODUCTINFO_WSDL_URL is required');
    if (!config.sanmar.customerNumber) throw new Error('SANMAR_CUSTOMER_NUMBER is required');

    const client = await soap.createClientAsync(wsdlUrl);

    const [resp] = await client.getProductInfoByStyleAsync({
        arg0: style,
        arg1: {
            sanMarCustomerNumber: Number(config.sanmar.customerNumber),
            sanMarUserName: config.sanmar.username,
            sanMarUserPassword: config.sanmar.password,
        },
    });

    const product = resp?.return ?? resp;
    return {
        style,
        title: product?.productTitle,
        description: product?.description,
        colors: product?.listOfAvailableColors?.string,
        sizes: product?.listOfAvailableSizes?.string,
        basePrice: product?.basePrice,
        raw: product,
    };
}
