import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

interface Comment {
  id: number;
  entity_type: string;
  entity_id: number;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface Props {
  entityType: 'portfolio' | 'lead' | 'opportunity' | 'customer';
  entityId: number;
  compact?: boolean;
}

export default function CommentsSection({ entityType, entityId, compact = false }: Props) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

  const fetchComments = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/comments/${entityType}/${entityId}`);
      if (r.ok) setComments(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (entityId) fetchComments();
  }, [entityType, entityId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/comments/${entityType}/${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (r.ok) {
        setContent('');
        fetchComments();
      } else {
        const d = await r.json();
        alert('Erreur: ' + (d.error || 'inconnue'));
      }
    } catch (e: any) { alert('Erreur réseau'); }
    setSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce commentaire ?')) return;
    const r = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
    if (r.ok) fetchComments();
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-3' : 'p-4'}`} data-testid={`comments-${entityType}-${entityId}`}>
      <div className="flex items-center gap-2 mb-3 text-slate-700">
        <MessageSquare size={16} className="text-indigo-600" />
        <h4 className="font-semibold text-sm">Commentaires de suivi {comments.length > 0 && <span className="text-xs text-slate-400 font-normal">({comments.length})</span>}</h4>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Ajouter un commentaire..."
          maxLength={500}
          className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          data-testid={`comment-input-${entityType}-${entityId}`}
        />
        <button
          type="submit"
          disabled={!content.trim() || submitting}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-1 text-sm"
          data-testid={`comment-submit-${entityType}-${entityId}`}
        >
          <Send size={14} />
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-slate-400 italic">Chargement...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Aucun commentaire pour l'instant.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg group">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(c.author_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 truncate">{c.author_name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{format(new Date(c.created_at), 'dd MMM HH:mm', { locale: fr })}</span>
                </div>
                <p className="text-sm text-slate-600 break-words">{c.content}</p>
              </div>
              {(c.author_id === profile?.uid || isAdmin) && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-all"
                  title="Supprimer"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
