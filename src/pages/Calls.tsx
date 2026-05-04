import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { PhoneCall, Plus, Search } from 'lucide-react';

export default function Calls() {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState('');

  const fetchCalls = async () => {
    try {
      const response = await fetch('/api/calls');
      if (response.ok) {
        const data = await response.json();
        setCalls(data);
      }
    } catch (error) {
      console.error("Error fetching calls:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setAgents(data.filter((u: any) => u.role === 'agent'));
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  useEffect(() => {
    if (profile) {
      fetchCalls();
    }
  }, [profile]);

  useEffect(() => {
    if (showModal) {
      fetchCustomers();
      if (profile?.role === 'admin' || profile?.role === 'superadmin') {
        fetchAgents();
      }
    }
  }, [showModal, profile]);

  const handleCreateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;

    const customer = customers.find(c => String(c.id) === String(customerId));
    if (!customer) return;

    let assignedAgentId = agentId;
    let assignedAgentName = '';

    if (profile?.role === 'agent') {
      assignedAgentId = profile.uid;
      assignedAgentName = profile.name;
    } else {
      const agent = agents.find(a => String(a.uid) === String(assignedAgentId));
      if (agent) assignedAgentName = agent.name;
    }

    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          agentId: assignedAgentId,
          agentName: assignedAgentName,
          status: status,
          notes: notes,
        }),
      });

      if (response.ok) {
        fetchCalls();
        setShowModal(false);
        setCustomerId('');
        setAgentId('');
        setStatus('pending');
        setNotes('');
      }
    } catch (error) {
      console.error("Error creating call:", error);
    }
  };

  const handleStatusChange = async (callId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/calls/${callId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchCalls();
      }
    } catch (error) {
      console.error("Error updating call status:", error);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Appels</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={20} />
          Nouvel Appel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Téléphone</th>
                <th className="px-6 py-4">Agent</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Notes</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{call.customerName}</td>
                  <td className="px-6 py-4">{call.customerPhone}</td>
                  <td className="px-6 py-4">{call.agentName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      call.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      call.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      call.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(call.createdAt), 'dd/MM/yyyy HH:mm')}</td>
                  <td className="px-6 py-4 max-w-xs truncate">{call.notes}</td>
                  <td className="px-6 py-4">
                    <select
                      value={call.status}
                      onChange={(e) => handleStatusChange(call.id, e.target.value)}
                      className="text-sm border-slate-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="pending">En attente</option>
                      <option value="in-progress">En cours</option>
                      <option value="completed">Terminé</option>
                      <option value="failed">Échoué</option>
                    </select>
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Aucun appel trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Nouvel Appel</h3>
            <form onSubmit={handleCreateCall} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Client</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Sélectionner un client</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                  ))}
                </select>
              </div>

              {(profile?.role === 'admin' || profile?.role === 'superadmin') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent Assigné</label>
                  <select
                    required
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="w-full border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="">Sélectionner un agent</option>
                    {agents.map(a => (
                      <option key={a.uid} value={a.uid}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="pending">En attente</option>
                  <option value="in-progress">En cours</option>
                  <option value="completed">Terminé</option>
                  <option value="failed">Échoué</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Notes de l'appel..."
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
