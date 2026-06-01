import { query } from "./db";
import { emailTransporter, FROM_EMAIL } from "./mailer";

const SMARTDESK_API_URL = process.env.SMARTDESK_API_URL || '';
const SMARTDESK_API_KEY = process.env.EXTERNAL_API_KEY || '';

export function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
    + lower[Math.floor(Math.random() * lower.length)]
    + digits[Math.floor(Math.random() * digits.length)]
    + symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = pwd.length; i < length; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

// Provision a SmartDesk account via external API
export async function provisionSmartDeskAccount(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  address?: string;
  city?: string;
  plan?: string;
  quoteId?: number;
}): Promise<{ ok: boolean; password?: string; error?: string }> {
  if (!SMARTDESK_API_URL || !SMARTDESK_API_KEY) {
    return { ok: false, error: 'SmartDesk API non configurée (SMARTDESK_API_URL ou EXTERNAL_API_KEY manquant)' };
  }
  if (!opts.email) return { ok: false, error: 'Email client requis' };

  const password = generateStrongPassword(14);
  const payload = {
    email: opts.email,
    password,
    first_name: opts.firstName || '',
    last_name: opts.lastName || '',
    company: opts.companyName || '',
    phone: opts.phone || '',
    address: opts.address || '',
    city: opts.city || '',
    plan: opts.plan || 'monthly',
    source: 'CRM_SmartBusiness',
    external_ref: opts.quoteId ? `QUOTE-${opts.quoteId}` : undefined
  };

  try {
    const r = await fetch(SMARTDESK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMARTDESK_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('SmartDesk API error:', r.status, txt);
      return { ok: false, error: `API SmartDesk: HTTP ${r.status} — ${txt.substring(0, 200)}` };
    }
    return { ok: true, password };
  } catch (err: any) {
    console.error('SmartDesk provisioning exception:', err);
    return { ok: false, error: err.message || 'Erreur réseau' };
  }
}

// Send welcome email to the client with credentials
export async function sendSmartDeskWelcomeEmail(opts: {
  to: string;
  firstName?: string;
  password: string;
  loginUrl?: string;
}): Promise<boolean> {
  try {
    const loginUrl = opts.loginUrl || process.env.SMARTDESK_LOGIN_URL || 'https://app.smart-desk.pro/login';
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
      <div style="background:linear-gradient(135deg,#6366f1,#a855f7);color:white;padding:32px;border-radius:16px;text-align:center;margin-bottom:24px">
        <h1 style="margin:0;font-size:24px">Bienvenue sur SmartDesk 🎉</h1>
        <p style="margin:8px 0 0;opacity:.9">Votre compte est prêt</p>
      </div>
      <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e2e8f0">
        <p>Bonjour ${opts.firstName || ''},</p>
        <p>Votre abonnement SmartDesk a bien été activé. Voici vos identifiants de connexion :</p>
        <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;font-family:monospace">
          <p style="margin:4px 0"><strong>Email :</strong> ${opts.to}</p>
          <p style="margin:4px 0"><strong>Mot de passe :</strong> <code style="background:#fef3c7;padding:2px 6px;border-radius:4px">${opts.password}</code></p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Se connecter à SmartDesk</a>
        </div>
        <p style="font-size:13px;color:#64748b">⚠️ Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="font-size:12px;color:#94a3b8">Si vous n'avez pas demandé cet abonnement, ignorez cet email ou contactez notre support.</p>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">SmartBusiness CRM · TBI Center</p>
    </body></html>`;

    await emailTransporter.sendMail({
      from: `"SmartDesk" <${FROM_EMAIL}>`,
      to: opts.to,
      subject: '🎉 Bienvenue sur SmartDesk — Vos identifiants de connexion',
      html
    });
    return true;
  } catch (err: any) {
    console.error('SmartDesk welcome email error:', err);
    return false;
  }
}

// Check if a quote contains a SmartDesk subscription product and provision if so
export async function handleSmartDeskProvisioningForQuote(quoteId: number): Promise<{ provisioned: boolean; emailSent?: boolean; error?: string }> {
  try {
    // Get quote + items + customer
    const itemsRes = await query(
      "SELECT qi.*, p.name as product_name, p.billing_type FROM quote_items qi LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = $1",
      [quoteId]
    );
    const items = itemsRes.rows;
    const hasSmartDesk = items.some((i: any) => (i.product_name || i.description || '').toLowerCase().includes('smartdesk'));
    if (!hasSmartDesk) return { provisioned: false };

    const qRes = await query(
      'SELECT q.subscription_id, q.payment_id, c.email, c.first_name, c.last_name, c.company_name, c.phone, c.address, c.city, c.name FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1',
      [quoteId]
    );
    if (qRes.rows.length === 0) return { provisioned: false, error: 'Quote not found' };
    const q = qRes.rows[0];
    if (!q.email) return { provisioned: false, error: 'Email client manquant — impossible de créer le compte SmartDesk' };

    // Idempotency: only provision once per quote
    const already = await query("SELECT id FROM documents WHERE quote_id = $1 AND tag = 'smartdesk_provisioned' LIMIT 1", [quoteId]).catch(() => ({ rows: [] }));
    if (already.rows.length > 0) return { provisioned: false, error: 'Compte SmartDesk déjà créé pour ce devis' };

    const subItem = items.find((i: any) => (i.product_name || '').toLowerCase().includes('smartdesk'));
    const isSubscription = subItem?.billing_type === 'subscription';

    const result = await provisionSmartDeskAccount({
      email: q.email,
      firstName: q.first_name,
      lastName: q.last_name,
      companyName: q.company_name || q.name,
      phone: q.phone,
      address: q.address,
      city: q.city,
      plan: isSubscription ? 'monthly' : 'one_time',
      quoteId
    });

    if (!result.ok) return { provisioned: false, error: result.error };

    const emailSent = await sendSmartDeskWelcomeEmail({ to: q.email, firstName: q.first_name, password: result.password! });

    // Mark as provisioned (idempotency marker — using documents table as a simple log; safe to skip if it fails)
    try { await query("INSERT INTO documents (name, quote_id, tag, file_data) VALUES ($1,$2,'smartdesk_provisioned',$3)", [`SmartDesk provisioning #${quoteId}`, quoteId, `provisioned_at=${new Date().toISOString()};email=${q.email}`]); } catch {}

    return { provisioned: true, emailSent };
  } catch (err: any) {
    console.error('SmartDesk provisioning chain error:', err);
    return { provisioned: false, error: err.message };
  }
}
