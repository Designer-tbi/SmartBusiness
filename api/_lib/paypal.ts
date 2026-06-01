import { query } from "./db";

export const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

export async function getPayPalAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
  if (!id || !secret) throw new Error('PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET manquants)');
  const auth = Buffer.from(`${id.trim()}:${secret.trim()}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) {
    const body = await r.text();
    console.error('[PayPal] OAuth failed', r.status, body, 'mode=', mode, 'clientIdPrefix=', id.substring(0, 8));
    throw new Error(`PayPal auth ${r.status} en mode ${mode}. Vérifiez que PAYPAL_CLIENT_ID/SECRET correspondent bien à des clés ${mode === 'live' ? 'Live (developer.paypal.com → Live)' : 'Sandbox'}.`);
  }
  const data: any = await r.json();
  return data.access_token;
}

// Convert XAF/XOF/CDF to EUR (PayPal supported currency)
export function convertToPayPalCurrency(amount: number, currency: string): { value: string, currency: string } {
  const rates: Record<string, number> = {
    XAF: 655.957, // CEMAC zone — fixed peg to EUR
    XOF: 655.957, // UEMOA zone — fixed peg to EUR
    CDF: 2900,    // approx CDF/EUR
    EUR: 1,
    USD: 1.08,    // approx EUR/USD inverse
  };
  if (currency === 'EUR' || currency === 'USD') {
    return { value: amount.toFixed(2), currency };
  }
  const rate = rates[currency] || 655.957;
  const eurAmount = amount / rate;
  return { value: eurAmount.toFixed(2), currency: 'EUR' };
}

// Ensure PayPal Product exists (cached via a placeholder strategy — create-on-demand)
export async function ensurePayPalProductForCrmProduct(productRow: any, token: string): Promise<string> {
  // Strategy: product name is unique enough to dedupe via a local cache column (paypal_product_id would be ideal)
  // For simplicity we create a product each time and rely on Plan IDs.
  const r = await fetch(`${PAYPAL_BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: productRow.name?.substring(0, 100) || 'Produit CRM',
      description: (productRow.description || productRow.name || '').substring(0, 200),
      type: 'SERVICE',
      category: 'SOFTWARE'
    })
  });
  const data: any = await r.json();
  if (!r.ok) { console.error('PayPal product create error:', data); throw new Error(data.message || 'create product failed'); }
  return data.id;
}

// Ensure a monthly Plan exists on PayPal for a given CRM product
export async function ensurePayPalPlanForProduct(productId: number): Promise<{ planId: string, amount: number, currency: string }> {
  const pr = await query("SELECT * FROM products WHERE id = $1", [productId]);
  if (pr.rows.length === 0) throw new Error('Product not found');
  const product = pr.rows[0];
  if (product.billing_type !== 'subscription') throw new Error('Not a subscription product');

  // Return cached if present
  if (product.paypal_plan_id) {
    const converted = convertToPayPalCurrency(Number(product.price), product.currency || 'XAF');
    return { planId: product.paypal_plan_id, amount: Number(converted.value), currency: converted.currency };
  }

  const token = await getPayPalAccessToken();
  const paypalProductId = await ensurePayPalProductForCrmProduct(product, token);
  const converted = convertToPayPalCurrency(Number(product.price), product.currency || 'XAF');

  const planRes = await fetch(`${PAYPAL_BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: paypalProductId,
      name: `Plan mensuel - ${product.name}`.substring(0, 127),
      description: `Abonnement mensuel ${product.name}`.substring(0, 127),
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // 0 = infinite
        pricing_scheme: { fixed_price: { value: converted.value, currency_code: converted.currency } }
      }],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0', currency_code: converted.currency },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3
      }
    })
  });
  const plan: any = await planRes.json();
  if (!planRes.ok) { console.error('PayPal plan create error:', plan); throw new Error(plan.message || 'create plan failed'); }

  await query("UPDATE products SET paypal_plan_id = $1 WHERE id = $2", [plan.id, productId]);
  return { planId: plan.id, amount: Number(converted.value), currency: converted.currency };
}
