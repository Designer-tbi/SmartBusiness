import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Check, X, Download, Printer, Mail, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import SignatureCanvas from 'react-signature-canvas';

export default function QuotePublicView() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signedBy, setSignedBy] = useState('');
  const sigPad = useRef<any>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const response = await fetch(`/api/public/quotes/${id}`);
        if (response.ok) {
          const data = await response.json();
          setQuote(data);
        } else {
          setError("Devis introuvable ou expiré.");
        }
      } catch (err) {
        setError("Une erreur est survenue lors de la récupération du devis.");
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [id]);

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

        {/* Signature Section */}
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
          ) : (
            <div className="space-y-6">
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
