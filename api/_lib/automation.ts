import { query } from "./db";

export const COMMISSION_RATE = 20; // Taux par défaut: 20%

export async function createActivity(opts: {
  type: string;
  subject: string;
  agentId: string | null;
  customerId?: number | null;
  leadId?: number | null;
  opportunityId?: number | null;
  daysFromNow?: number;
  notes?: string;
  status?: string;
}) {
  if (!opts.agentId) return;
  // Build a date at noon UTC to avoid timezone-related day shifts
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (opts.daysFromNow ?? 0), 12, 0, 0));
  try {
    await query("INSERT INTO activities (type, subject, customer_id, lead_id, opportunity_id, agent_id, status, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [opts.type, opts.subject, opts.customerId || null, opts.leadId || null, opts.opportunityId || null, opts.agentId, opts.status || 'À faire', target.toISOString(), opts.notes || null]);
  } catch (e) { console.error("Auto activity create failed:", e); }
}

// Helper: mark all 'À faire' / 'En retard' activities as Terminé for a given entity
export async function autoCompleteActivities(opts: { leadId?: number; customerId?: number; opportunityId?: number }) {
  try {
    if (opts.leadId) await query("UPDATE activities SET status='Terminé', updated_at=CURRENT_TIMESTAMP WHERE lead_id=$1 AND status IN ('À faire','En retard')", [opts.leadId]);
    if (opts.customerId) await query("UPDATE activities SET status='Terminé', updated_at=CURRENT_TIMESTAMP WHERE customer_id=$1 AND status IN ('À faire','En retard')", [opts.customerId]);
    if (opts.opportunityId) await query("UPDATE activities SET status='Terminé', updated_at=CURRENT_TIMESTAMP WHERE opportunity_id=$1 AND status IN ('À faire','En retard')", [opts.opportunityId]);
  } catch (e) { console.error("autoCompleteActivities error:", e); }
}

// Auto-create invoice from a signed quote (idempotent: skip if quote already has an invoice)
export async function autoCreateInvoiceFromQuote(quoteId: number) {
  const existing = await query("SELECT id FROM invoices WHERE quote_id = $1", [quoteId]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const qr = await query("SELECT * FROM quotes WHERE id = $1", [quoteId]);
  if (qr.rows.length === 0) return null;
  const quote = qr.rows[0];
  let customerId = quote.customer_id;
  // If quote was issued to a Lead, auto-convert lead to customer first
  if (!customerId && quote.lead_id) {
    customerId = await autoConvertLeadToCustomer(quote.lead_id);
    if (customerId) await query("UPDATE quotes SET customer_id = $1, lead_id = NULL WHERE id = $2", [customerId, quoteId]);
  }
  if (!customerId) return null;
  const invoiceNumber = `F-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
  const r = await query(
    "INSERT INTO invoices (number, customer_id, quote_id, agent_id, amount, status, date, due_date) VALUES ($1,$2,$3,$4,$5,'En attente',$6,$7) RETURNING id",
    [invoiceNumber, customerId, quoteId, quote.agent_id, quote.amount, new Date().toISOString().split('T')[0], dueDate.toISOString().split('T')[0]]
  );
  await query("UPDATE quotes SET status = 'Facturé', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [quoteId]);
  return r.rows[0].id;
}

// Auto-create commission when an invoice is paid (idempotent)
export async function autoCreateCommissionFromInvoice(invoiceId: number) {
  const existing = await query("SELECT id FROM commissions WHERE invoice_id = $1", [invoiceId]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const ir = await query("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
  if (ir.rows.length === 0) return null;
  const inv = ir.rows[0];
  if (!inv.agent_id) return null;
  const amount = Math.round(Number(inv.amount) * COMMISSION_RATE / 100);
  const r = await query(
    "INSERT INTO commissions (agent_id, invoice_id, amount, rate, status, date) VALUES ($1,$2,$3,$4,'En attente',$5) RETURNING id",
    [inv.agent_id, invoiceId, amount, COMMISSION_RATE, new Date().toISOString().split('T')[0]]
  );
  return r.rows[0].id;
}

// Auto-convert lead to customer (returns customerId)
export async function autoConvertLeadToCustomer(leadId: number): Promise<number | null> {
  const lr = await query("SELECT * FROM leads WHERE id = $1", [leadId]);
  if (lr.rows.length === 0) return null;
  const lead = lr.rows[0];
  // Skip if lead already converted and linked to a customer (via phone/email match)
  const name = lead.type === 'company' ? (lead.company_name || 'Client sans nom') : `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Client sans nom';
  const phone = lead.phone || 'N/A'; // customers.phone is NOT NULL, fallback required
  try {
    const cr = await query(
      "INSERT INTO customers (type, first_name, last_name, company_name, name, email, phone, address, city, industry, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Non spécifié',$10) RETURNING id",
      [lead.type || 'individual', lead.first_name, lead.last_name, lead.company_name, name, lead.email, phone, lead.address, lead.city, lead.agent_id]
    );
    const customerId = cr.rows[0].id;
    await query("UPDATE leads SET status='Converti', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [leadId]);
    await query("UPDATE opportunities SET customer_id=$1, lead_id=NULL WHERE lead_id=$2", [customerId, leadId]);
    // AUTO: mark all pending activities for this lead as Terminé
    await autoCompleteActivities({ leadId });
    // Welcome activity for the agent
    await createActivity({ type: 'RDV', subject: `Onboarding nouveau client: ${name}`, agentId: lead.agent_id, customerId, daysFromNow: 2, notes: `Client converti depuis le prospect #${leadId}` });
    return customerId;
  } catch (err: any) {
    console.error("autoConvertLeadToCustomer error:", err);
    throw err;
  }
}

// Auto-create opportunity from qualified lead (idempotent: skip if opportunity already linked)
export async function autoCreateOpportunityFromLead(leadId: number, agentId: string | null): Promise<number | null> {
  const existing = await query("SELECT id FROM opportunities WHERE lead_id = $1", [leadId]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const lr = await query("SELECT * FROM leads WHERE id = $1", [leadId]);
  if (lr.rows.length === 0) return null;
  const lead = lr.rows[0];
  const name = lead.type === 'company' ? lead.company_name : `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  const closeDate = new Date(); closeDate.setMonth(closeDate.getMonth() + 2);
  const r = await query(
    "INSERT INTO opportunities (lead_id, title, amount, stage, probability, expected_close_date) VALUES ($1,$2,$3,'Découverte',20,$4) RETURNING id",
    [leadId, `Opportunité - ${name}`, 0, closeDate.toISOString().split('T')[0]]
  );
  const oppId = r.rows[0].id;
  await createActivity({ type: 'Appel', subject: `Qualifier l'opportunité: ${name}`, agentId, leadId, opportunityId: oppId, daysFromNow: 1 });
  return oppId;
}

// Auto-update opportunity when quote signed/refused
export async function autoSyncOpportunityFromQuote(quoteId: number, quoteStatus: string) {
  const qr = await query("SELECT customer_id, lead_id, agent_id FROM quotes WHERE id = $1", [quoteId]);
  if (qr.rows.length === 0) return;
  const q = qr.rows[0];
  // Find linked opportunity by customer_id or lead_id
  let oppRes;
  if (q.customer_id) oppRes = await query("SELECT id FROM opportunities WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1", [q.customer_id]);
  else if (q.lead_id) oppRes = await query("SELECT id FROM opportunities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1", [q.lead_id]);
  if (!oppRes || oppRes.rows.length === 0) return;
  const oppId = oppRes.rows[0].id;
  if (quoteStatus === 'Signé' || quoteStatus === 'Accepté') {
    await query("UPDATE opportunities SET stage='Gagné', probability=100, updated_at=CURRENT_TIMESTAMP WHERE id=$1", [oppId]);
    // AUTO: complete pending activities for this opportunity
    await autoCompleteActivities({ opportunityId: oppId });
    await createActivity({ type: 'Tâche', subject: `Devis signé — préparer la mise en œuvre`, agentId: q.agent_id, customerId: q.customer_id, opportunityId: oppId, daysFromNow: 1, status: 'À faire' });
  } else if (quoteStatus === 'Refusé') {
    await query("UPDATE opportunities SET stage='Perdu', probability=0, updated_at=CURRENT_TIMESTAMP WHERE id=$1", [oppId]);
    // AUTO: complete pending activities for this opportunity
    await autoCompleteActivities({ opportunityId: oppId });
    await createActivity({ type: 'Appel', subject: `Relance commerciale après refus de devis`, agentId: q.agent_id, customerId: q.customer_id, opportunityId: oppId, daysFromNow: 7, status: 'À faire', notes: 'Comprendre le refus et proposer une alternative.' });
  }
}
