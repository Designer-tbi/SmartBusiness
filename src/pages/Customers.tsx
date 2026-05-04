import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Users, Plus, Building2, User, Search, Trash2, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getZoneConfig } from '../lib/countryConfig';
import PhoneInput from '../components/PhoneInput';

export default function Customers() {
  const { profile } = useAuth();
  const zoneCfg = getZoneConfig((profile as any)?.zone);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [type, setType] = useState<'individual' | 'company'>('individual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [industry, setIndustry] = useState('');
  const [niu, setNiu] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const resetForm = () => {
    setType('individual');
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setIndustry('');
    setNiu('');
    setEditingCustomer(null);
    setError(null);
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setType(customer.type);
    setFirstName(customer.firstName || '');
    setLastName(customer.lastName || '');
    setCompanyName(customer.companyName || '');
    setPhone(customer.phone);
    setEmail(customer.email || '');
    setAddress(customer.address || '');
    setCity(customer.city || '');
    setIndustry(customer.industry || '');
    setNiu(customer.niu || '');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      type,
      firstName: type === 'individual' ? firstName : null,
      lastName: type === 'individual' ? lastName : null,
      companyName: type === 'company' ? companyName : null,
      phone,
      email: email || null,
      address: address || null,
      city: city || null,
      industry: type === 'company' ? industry : null,
    };

    try {
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchCustomers();
        setShowModal(false);
        resetForm();
      } else {
        const data = await response.json();
        setError(data.error || "Une erreur est survenue lors de l'enregistrement.");
      }
    } catch (error) {
      console.error("Error saving customer:", error);
      setError("Erreur de connexion au serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchCustomers();
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Clients</h2>
          <p className="text-slate-500 text-sm">Gérez votre base de données clients (Particuliers et Entreprises)</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus size={20} />
          Nouveau Client
        </button>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un client par nom, email ou téléphone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Nom / Entreprise</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Localisation</th>
                <th className="px-6 py-4">Secteur</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    {customer.type === 'company' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Building2 size={12} />
                        Entreprise
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        <User size={12} />
                        Particulier
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{customer.name}</div>
                    <div className="text-xs text-slate-400">ID: #{customer.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-700">{customer.phone}</div>
                    <div className="text-xs text-slate-500">{customer.email || 'Pas d\'email'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-700">{customer.city || '-'}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[150px]">{customer.address || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-600">{customer.industry || '-'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEdit(customer)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(customer.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={40} className="text-slate-200" />
                      <p>Aucun client trouvé.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCustomer ? 'Modifier le Client' : 'Nouveau Client'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type de client</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setType('individual')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all ${
                        type === 'individual' 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <User size={18} />
                      Particulier
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('company')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all ${
                        type === 'company' 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <Building2 size={18} />
                      Entreprise
                    </button>
                  </div>
                </div>

                {type === 'individual' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Civilité</label>
                      <select value={firstName.startsWith('M.') || firstName.startsWith('Mme') || firstName.startsWith('Mlle') ? '' : ''} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                        <option value="">-</option>
                        <option value="M.">M.</option>
                        <option value="Mme">Mme</option>
                        <option value="Mlle">Mlle</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Prénom *</label>
                      <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Jean" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom *</label>
                      <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Dupont" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Raison sociale *</label>
                      <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: TBI Center SARL" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">NIU / RCCM</label>
                      <input type="text" value={niu} onChange={(e) => setNiu(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: M012345678901A" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Forme juridique</label>
                      <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                        <option value="">Sélectionner...</option>
                        <option value="SARL">SARL</option>
                        <option value="SA">SA</option>
                        <option value="SAS">SAS</option>
                        <option value="EI">Entreprise Individuelle</option>
                        <option value="SNC">SNC</option>
                        <option value="GIE">GIE</option>
                        <option value="Association">Association</option>
                        <option value="ONG">ONG</option>
                        <option value="Établissement public">Établissement public</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Secteur d'activité</label>
                      <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                        <option value="">Sélectionner...</option>
                        <option>BTP / Construction</option>
                        <option>Commerce / Distribution</option>
                        <option>Télécommunications</option>
                        <option>Banque / Finance</option>
                        <option>Assurances</option>
                        <option>Transport / Logistique</option>
                        <option>Hôtellerie / Restauration</option>
                        <option>Santé / Pharmacie</option>
                        <option>Éducation / Formation</option>
                        <option>Informatique / Tech</option>
                        <option>Agriculture / Agroalimentaire</option>
                        <option>Mines / Énergie</option>
                        <option>Immobilier</option>
                        <option>Services / Conseil</option>
                        <option>Autre</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Contact</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone *</label>
                  <PhoneInput value={phone} onChange={setPhone} required zone={(profile as any)?.zone} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="contact@exemple.com" />
                </div>

                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Localisation</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Adresse / Quartier</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Quartier, avenue, numéro..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ville {zoneCfg.flag}</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                    <option value="">Sélectionner une ville</option>
                    {zoneCfg.cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Pays</label>
                  <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                    <option value="CG">Congo (Brazzaville)</option>
                    <option value="CM">Cameroun</option>
                    <option value="GA">Gabon</option>
                    <option value="TD">Tchad</option>
                    <option value="CF">République Centrafricaine</option>
                    <option value="GQ">Guinée Équatoriale</option>
                    <option value="CD">RD Congo</option>
                    <option value="CI">Côte d'Ivoire</option>
                    <option value="SN">Sénégal</option>
                    <option value="FR">France</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Enregistrement...' : (editingCustomer ? 'Mettre à jour' : 'Créer le client')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
