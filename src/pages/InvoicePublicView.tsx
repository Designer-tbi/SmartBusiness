import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Receipt, Printer, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function InvoicePublicView() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/invoices/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject('not_found'))
      .then(setInvoice)
      .catch(() => setError("Facture introuvable"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Chargement...</div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={48} />
        <h2 className="text-xl font-bold text-slate-800">{error}</h2>
      </div>
    </div>
  );

  const subtotal = (invoice.items || []).reduce((a: number, it: any) => a + Number(it.total_price || 0), 0) || Number(invoice.amount);
  const isPaid = invoice.status === 'Payée';

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto">
        {/* Toolbar (hidden on print) */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <div className="text-sm text-slate-500">Aperçu de la facture {invoice.number}</div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 text-sm font-medium">
              <Printer size={16} /> Imprimer / PDF
            </button>
          </div>
        </div>

        {/* Document */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 print:shadow-none print:border-0 print:rounded-none">
          {/* Header */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">SB</div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">SmartBusiness</h1>
                  <p className="text-xs text-slate-500">TBI Center</p>
                </div>
              </div>
              {invoice.agentName && (
                <p className="text-sm text-slate-600 mt-2">Émetteur : <strong>{invoice.agentName}</strong></p>
              )}
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-indigo-600 mb-1">FACTURE</h2>
              <p className="text-sm text-slate-500">N° <strong className="text-slate-900">{invoice.number}</strong></p>
              <p className="text-sm text-slate-500">Date : <strong className="text-slate-900">{format(new Date(invoice.date), 'dd MMM yyyy', { locale: fr })}</strong></p>
              {invoice.dueDate && <p className="text-sm text-slate-500">Échéance : <strong className="text-slate-900">{format(new Date(invoice.dueDate), 'dd MMM yyyy', { locale: fr })}</strong></p>}
              <div className="mt-3">
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">
                    <CheckCircle2 size={14} /> PAYÉE
                  </span>
                ) : invoice.status === 'En retard' ? (
                  <span className="inline-flex px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">EN RETARD</span>
                ) : (
                  <span className="inline-flex px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">EN ATTENTE</span>
                )}
              </div>
            </div>
          </div>

          {/* Bill to */}
          <div className="grid grid-cols-2 gap-8 my-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-2">Facturé à</p>
              <p className="font-bold text-slate-900">{invoice.customerName}</p>
              {invoice.customerAddress && <p className="text-sm text-slate-600">{invoice.customerAddress}</p>}
              {invoice.customerCity && <p className="text-sm text-slate-600">{invoice.customerCity}</p>}
              {invoice.customerEmail && <p className="text-sm text-slate-600 mt-1">{invoice.customerEmail}</p>}
              {invoice.customerPhone && <p className="text-sm text-slate-600">{invoice.customerPhone}</p>}
            </div>
            <div className="text-right">
              {invoice.quoteNumber && (
                <>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Référence devis</p>
                  <p className="font-bold text-slate-900">{invoice.quoteNumber}</p>
                </>
              )}
            </div>
          </div>

          {/* Items table */}
          <table className="w-full mb-6 border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-bold text-slate-500 uppercase">
                <th className="px-4 py-3">Désignation</th>
                <th className="px-4 py-3 text-center w-20">Qté</th>
                <th className="px-4 py-3 text-right w-32">P.U. HT</th>
                <th className="px-4 py-3 text-right w-32">Total HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items && invoice.items.length > 0 ? invoice.items.map((it: any, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-sm text-slate-800">{it.description}</td>
                  <td className="px-4 py-3 text-center text-sm text-slate-600">{Number(it.quantity)}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">{Number(it.unit_price).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{Number(it.total_price).toLocaleString('fr-FR')}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-slate-600 italic">Voir le devis lié N° {invoice.quoteNumber || '-'}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-6">
            <div className="w-72 bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
              {invoice.items && invoice.items.length > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Sous-total HT</span>
                  <span>{subtotal.toLocaleString('fr-FR')} FCFA</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t-2 border-slate-300">
                <span>TOTAL TTC</span>
                <span className="text-indigo-600">{Number(invoice.amount).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </div>

          {isPaid && invoice.paidAt && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl text-center mb-6">
              <CheckCircle2 className="inline-block mr-2" size={18} />
              Facture acquittée le {format(new Date(invoice.paidAt), 'dd MMMM yyyy', { locale: fr })}
            </div>
          )}

          <div className="text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
            <p>SmartBusiness CRM — TBI Center · Merci de votre confiance</p>
          </div>
        </div>
      </div>
    </div>
  );
}
