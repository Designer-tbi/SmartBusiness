import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Check, X, Download, Printer, Mail, ShieldCheck, CreditCard, Lock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import SignatureCanvas from 'react-signature-canvas';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';

export default function QuotePublicView() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signedBy, setSignedBy] = useState('');
  const [paypalConfig, setPaypalConfig] = useState<{ clientId: string; mode: string } | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const [qRes, cfgRes] = await Promise.all([
          fetch(`/api/public/quotes/${id}`),
          fetch('/api/public/paypal/config')
        ]);
        if (qRes.ok) {
          setQuote(await qRes.json());
        } else {
          setError("Devis introuvable ou expiré.");
        }
        if (cfgRes.ok) setPaypalConfig(await cfgRes.json());
      } catch (err) {
        setError("Une erreur est survenue lors de la récupération du devis.");
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [id]);

  const isPaid = quote?.payment_status === 'PAID';

  const isSubscription = quote?.hasSubscription || quote?.paymentMode === 'subscription';

  const handlePayPalCreateOrder = async () => {
    setProcessingPayment(true);
    try {
      console.log('[PayPal] Creating order for quote', id);
      const r = await fetch(`/api/public/quotes/${id}/paypal/create-order`, { method: 'POST' });
      const data = await r.json();
      console.log('[PayPal] create-order response', r.status, data);
      if (!r.ok) throw new Error(data.error || 'Erreur création commande');
      if (!data.id) throw new Error('Réponse PayPal invalide: pas d\'identifiant de commande');
      return data.id;
    } catch (e: any) {
      console.error('[PayPal] createOrder failed', e);
      alert('Erreur lors de la création de la commande PayPal:\n\n' + e.message + '\n\nOuvrez la console (F12) pour plus de détails.');
      setProcessingPayment(false);
      throw e;
    }
  };

  const handlePayPalApprove = async (data: any) => {
    try {
      console.log('[PayPal] Approving order', data.orderID);
      const r = await fetch(`/api/public/quotes/${id}/paypal/capture/${data.orderID}`, { method: 'POST' });
      const result = await r.json();
      console.log('[PayPal] capture response', r.status, result);
      if (!r.ok) throw new Error(result.error || 'Capture échouée');
      // Update local state to reflect payment
      setQuote((prev: any) => ({ ...prev, payment_status: 'PAID', payment_id: result.transactionId, payment_amount: result.amount, payment_currency: result.currency }));
      alert(`✅ Paiement reçu (${result.amount} ${result.currency}) ! Vous pouvez maintenant signer le devis.`);
    } catch (e: any) {
      alert('Erreur de capture: ' + e.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  // Subscription: fetch plan_id then use createSubscription
  const handleSubscriptionCreate = async (_data: any, actions: any) => {
    setProcessingPayment(true);
    try {
      const r = await fetch(`/api/public/quotes/${id}/paypal/subscription-plan`, { method: 'POST' });
      const planData = await r.json();
      if (!r.ok) throw new Error(planData.error || 'Erreur plan');
      return actions.subscription.create({ plan_id: planData.planId });
    } catch (e: any) {
      alert('Erreur: ' + e.message);
      setProcessingPayment(false);
      throw e;
    }
  };

  const handleSubscriptionApprove = async (data: any) => {
    try {
      const r = await fetch(`/api/public/quotes/${id}/paypal/subscription/${data.subscriptionID}`, { method: 'POST' });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Activation échouée');
      setQuote((prev: any) => ({ ...prev, payment_status: 'PAID', payment_id: data.subscriptionID, payment_method: 'PAYPAL_SUBSCRIPTION' }));
      alert(`✅ Abonnement activé ! Vous pouvez maintenant signer le devis.\n\nRéf. : ${data.subscriptionID}`);
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleClear = () => {
    sigPad.current?.clear();
  };

  const handleSign = async () => {
    if (sigPad.current?.isEmpty()) {
      alert("Veuillez signer avant de valider.");
      return;
    }
    if (!signedBy.trim()) {
      alert("Veuillez saisir votre nom.");
      return;
    }

    try {
      const signatureData = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
      const response = await fetch(`/api/public/quotes/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signatureData,
          signedBy: signedBy
        })
      });

      if (response.ok) {
        setQuote({ ...quote, status: 'Accepté', signature: signatureData, signed_by: signedBy, signature_date: new Date().toISOString() });
        setSigning(false);
      } else {
        alert("Erreur lors de la signature.");
      }
    } catch (err) {
      alert("Une erreur est survenue.");
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50">Chargement du devis...</div>;
  if (error) return <div className="flex h-screen items-center justify-center bg-slate-50 text-red-600 font-medium">{error}</div>;

  const subtotal = quote.items?.reduce((acc: number, item: any) => acc + Number(item.total_price), 0) || 0;
  const tva = subtotal * 0.18; // Example TVA 18%
  const total = subtotal + tva;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-white flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <FileText size={32} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">DEVIS</h1>
            </div>
            <p className="text-indigo-100 font-medium">N° {quote.number}</p>
            <p className="text-indigo-200 text-sm">Date: {format(new Date(quote.date), 'dd MMMM yyyy', { locale: fr })}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold mb-1">SMART DESK PRO</h2>
            <p className="text-indigo-100 text-sm">smart-desk.pro</p>
            <p className="text-indigo-200 text-xs mt-2">Contact: contact@smart-desk.pro</p>
          </div>
        </div>

        {/* Client & Info */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Destinataire</h3>
            <p className="text-lg font-bold text-slate-800">{quote.customerName}</p>
            <p className="text-slate-600">{quote.customerEmail}</p>
            <p className="text-slate-600">{quote.customerPhone}</p>
          </div>
          <div className="md:text-right">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statut du Devis</h3>
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${
              quote.status === 'Accepté' ? 'bg-emerald-100 text-emerald-700' : 
              quote.status === 'Refusé' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {quote.status}
            </span>
            {quote.expiry_date && (
              <p className="text-slate-500 text-xs mt-3">
                Valable jusqu'au: {format(new Date(quote.expiry_date), 'dd/MM/yyyy')}
              </p>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="p-8">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="pb-4">Description</th>
                <th className="pb-4 text-center">Qté</th>
                <th className="pb-4 text-right">Prix Unitaire</th>
                <th className="pb-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {quote.items?.map((item: any, index: number) => (
                <tr key={index} className="text-slate-700">
                  <td className="py-4 font-medium">{item.description}</td>
                  <td className="py-4 text-center">{item.quantity}</td>
                  <td className="py-4 text-right">{Number(item.unit_price).toLocaleString()} FCFA</td>
                  <td className="py-4 text-right font-bold">{Number(item.total_price).toLocaleString()} FCFA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
          <div className="w-full max-w-xs space-y-3">
            <div className="flex justify-between text-slate-600">
              <span>Sous-total</span>
              <span>{subtotal.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>TVA (18%)</span>
              <span>{tva.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-slate-900 pt-3 border-t border-slate-200">
              <span>TOTAL</span>
              <span className="text-indigo-600">{total.toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* Payment Section (BEFORE signature) */}
        {!quote.signature && quote.status !== 'Refusé' && (
          <div className="p-8 border-t border-slate-100">
            {isPaid ? (
              <div className="flex items-center justify-center gap-3 p-5 bg-emerald-50 rounded-xl border border-emerald-200 mb-6">
                <CheckCircle2 className="text-emerald-600" size={28} />
                <div>
                  <p className="font-bold text-emerald-800">Paiement reçu</p>
                  <p className="text-xs text-emerald-700">
                    {quote.payment_amount} {quote.payment_currency} encaissé via PayPal · Réf. {quote.payment_id?.substring(0, 12)}…
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-slate-700">
                  <CreditCard size={20} />
                  <h3 className="font-bold text-lg">
                    Étape 1 : {isSubscription ? 'S\'abonner' : 'Régler ce devis'}
                  </h3>
                </div>
                <p className="text-center text-sm text-slate-500 max-w-md mx-auto">
                  {isSubscription ? (
                    <>Abonnement <strong>mensuel</strong> sécurisé via PayPal. Vous serez prélevé chaque mois à la même date. Vous pouvez annuler à tout moment depuis votre compte PayPal.</>
                  ) : (
                    <>Paiement sécurisé par PayPal. Carte bancaire (Visa, Mastercard, etc.) ou compte PayPal acceptés.</>
                  )}
                  <br />
                  Le montant en FCFA sera converti en EUR au taux fixe (1 EUR = 655,957 XAF).
                </p>
                {!paypalConfig?.clientId ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm text-center">
                    Le module de paiement n'est pas encore configuré. Veuillez contacter votre commercial.
                  </div>
                ) : (
                  <div className="max-w-md mx-auto">
                    {isSubscription ? (
                      <PayPalScriptProvider options={{ clientId: paypalConfig.clientId, currency: 'EUR', intent: 'subscription', vault: true }}>
                        <PayPalButtons
                          style={{ layout: 'vertical', shape: 'rect', color: 'blue', label: 'subscribe' }}
                          createSubscription={handleSubscriptionCreate}
                          onApprove={handleSubscriptionApprove}
                          onError={(err) => { alert('Erreur PayPal: ' + (err as any).message); setProcessingPayment(false); }}
                          onCancel={() => setProcessingPayment(false)}
                          disabled={processingPayment}
                        />
                      </PayPalScriptProvider>
                    ) : (
                      <PayPalScriptProvider options={{ clientId: paypalConfig.clientId, currency: 'EUR', intent: 'capture', enableFunding: 'card', disableFunding: 'paylater,credit', components: 'buttons' }}>
                        <PayPalButtons
                          style={{ layout: 'vertical', shape: 'rect', color: 'gold', label: 'pay' }}
                          createOrder={handlePayPalCreateOrder}
                          onApprove={handlePayPalApprove}
                          onError={(err: any) => {
                            console.error('[PayPal] onError', err);
                            alert('Erreur PayPal:\n\n' + (err?.message || JSON.stringify(err)) + '\n\nOuvrez la console (F12 → onglet Console) pour copier l\'erreur complète.');
                            setProcessingPayment(false);
                          }}
                          onCancel={() => { console.log('[PayPal] onCancel'); setProcessingPayment(false); }}
                          onClick={(_d, actions) => { console.log('[PayPal] Button clicked'); return actions.resolve(); }}
                          disabled={processingPayment}
                        />
                      </PayPalScriptProvider>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Signature Section (LOCKED until payment) */}
        <div className="p-8 border-t border-slate-100">
          {quote.signature ? (
            <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-xl border border-emerald-100">
              <ShieldCheck className="text-emerald-600 mb-2" size={40} />
              <h3 className="text-emerald-800 font-bold text-lg">Devis Signé Électroniquement</h3>
              <p className="text-emerald-600 text-sm mb-4">Par {quote.signed_by} le {format(new Date(quote.signature_date), 'dd/MM/yyyy à HH:mm')}</p>
              <img src={quote.signature} alt="Signature" className="max-h-24 border-b border-emerald-200" referrerPolicy="no-referrer" />
            </div>
          ) : quote.status === 'Refusé' ? (
            <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
              <p className="text-red-700 font-bold">Ce devis a été refusé.</p>
            </div>
          ) : !isPaid ? (
            <div className="text-center p-6 bg-slate-100 rounded-xl border border-slate-200">
              <Lock className="mx-auto text-slate-400 mb-2" size={32} />
              <p className="text-slate-600 font-medium">Étape 2 : Signature électronique</p>
              <p className="text-slate-400 text-xs mt-1">Veuillez d'abord effectuer le paiement pour débloquer la signature.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-2 text-slate-700 mb-2">
                <ShieldCheck size={20} className="text-emerald-600" />
                <h3 className="font-bold text-lg">Étape 2 : Signer le devis</h3>
              </div>
              {!signing ? (
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={() => setSigning(true)}
                    className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    <Check size={20} />
                    Accepter et Signer le Devis
                  </button>
                  <button className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-8 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all">
                    <X size={20} />
                    Refuser le Devis
                  </button>
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="bg-slate-100 rounded-xl p-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Votre Signature</label>
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <SignatureCanvas 
                        ref={sigPad}
                        penColor='black'
                        canvasProps={{className: 'w-full h-40 cursor-crosshair'}}
                      />
                    </div>
                    <button 
                      onClick={handleClear}
                      className="text-xs text-indigo-600 font-bold mt-2 hover:underline"
                    >
                      Effacer la signature
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Signé par (Nom complet)</label>
                    <input 
                      type="text" 
                      value={signedBy}
                      onChange={(e) => setSignedBy(e.target.value)}
                      placeholder="Ex: Jean Dupont"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={handleSign}
                      className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      Valider la Signature
                    </button>
                    <button 
                      onClick={() => setSigning(false)}
                      className="px-6 bg-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-300 transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    En signant ce document, vous acceptez les conditions générales de vente de SMART DESK PRO.
                    Lien sécurisé via smart-desk.pro
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-center gap-4">
          <button className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-all text-sm font-medium">
            <Download size={16} /> Télécharger PDF
          </button>
          <button className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-all text-sm font-medium">
            <Printer size={16} /> Imprimer
          </button>
          <button className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-all text-sm font-medium">
            <Mail size={16} /> Nous contacter
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-center">
        <p className="text-slate-400 text-xs">Propulsé par SMART DESK PRO - Solution de gestion commerciale intelligente</p>
      </div>
    </div>
  );
}
