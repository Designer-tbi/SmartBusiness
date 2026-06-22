import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Files, Upload, Trash2, Download, Eye, Search, FileText, Image, FileSpreadsheet, File, X } from 'lucide-react';
import { uploadFileChunked } from '../lib/chunkedUpload';

interface Document {
  id: number;
  name: string;
  file_name: string;
  file_type: string;
  file_size: number;
  customer_id: number | null;
  quote_id: number | null;
  invoice_id: number | null;
  uploaded_by: string;
  notes: string;
  createdAt: string;
}

const fileIcon = (type: string) => {
  if (type?.startsWith('image/')) return <Image className="w-5 h-5 text-purple-500" />;
  if (type?.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  if (type?.includes('sheet') || type?.includes('excel') || type?.includes('csv')) return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
  return <File className="w-5 h-5 text-slate-500" />;
};

const formatSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / 1048576).toFixed(1) + ' Mo';
};

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ pct: number; label: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewData, setPreviewData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: '', notes: '' });

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) setDocuments(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDocuments(); }, []);

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    let successCount = 0;
    let failedFiles: { name: string; reason: string }[] = [];
    const list = Array.from(files);
    for (let idx = 0; idx < list.length; idx++) {
      const file = list[idx];
      try {
        const docName = form.name || file.name.replace(/\.[^/.]+$/, '');
        await uploadFileChunked(file, { name: docName, notes: form.notes }, (pct, label) => {
          setUploadProgress({ pct, label: `${file.name} — ${label} (${idx + 1}/${list.length})` });
        });
        successCount++;
      } catch (err: any) {
        console.error('[Documents] Upload exception:', err);
        failedFiles.push({ name: file.name, reason: err.message || 'Erreur réseau' });
      }
    }
    setUploadProgress(null);
    setUploading(false);

    if (failedFiles.length > 0) {
      const lines = failedFiles.map(f => `• ${f.name} → ${f.reason}`).join('\n');
      alert(`⚠️ Upload partiel : ${successCount}/${list.length} fichiers réussis.\n\nÉchecs :\n${lines}`);
    }
    setShowUpload(false);
    setForm({ name: '', notes: '' });
    fetchDocuments();
  }, [form]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce document ?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    fetchDocuments();
  };

  const handleDownload = async (doc: Document) => {
    try {
      // Use binary streaming endpoint (no huge JSON payload)
      const res = await fetch(`/api/documents/${doc.id}/file`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      link.click();
      // Cleanup blob URL after a moment
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      console.error('[Documents] Download error:', err);
      alert('Erreur téléchargement: ' + err.message);
    }
  };

  const handlePreview = async (doc: Document) => {
    try {
      // Use binary streaming endpoint to avoid loading huge JSON
      const res = await fetch(`/api/documents/${doc.id}/file`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewData(url);
      setPreviewDoc(doc);
    } catch (err: any) {
      console.error('[Documents] Preview error:', err);
      alert('Erreur prévisualisation: ' + err.message);
    }
  };

  const filtered = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.file_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Files className="w-7 h-7 text-indigo-600" />
            Documents
          </h1>
          <p className="text-sm text-slate-500 mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          data-testid="upload-document-btn"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm"
        >
          <Upload className="w-4 h-4" /> Ajouter un document
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          data-testid="search-documents"
          type="text"
          placeholder="Rechercher un document..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Files className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Aucun document</p>
          <p className="text-sm text-slate-400 mt-1">Glissez-déposez des fichiers ici ou cliquez sur "Ajouter un document"</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left px-6 py-4">Document</th>
                <th className="text-left px-4 py-4 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-4 hidden md:table-cell">Taille</th>
                <th className="text-left px-4 py-4 hidden lg:table-cell">Date</th>
                <th className="text-left px-4 py-4 hidden lg:table-cell">Notes</th>
                <th className="text-right px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`document-row-${doc.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-50 rounded-lg">{fileIcon(doc.file_type)}</div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{doc.name}</p>
                        <p className="text-xs text-slate-400">{doc.file_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">{doc.file_type?.split('/')[1] || 'fichier'}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500 hidden md:table-cell">{formatSize(doc.file_size)}</td>
                  <td className="px-4 py-4 text-sm text-slate-500 hidden lg:table-cell">{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-4 text-sm text-slate-500 hidden lg:table-cell max-w-[200px] truncate">{doc.notes || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handlePreview(doc)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors" title="Visualiser" data-testid={`preview-doc-${doc.id}`}>
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDownload(doc)} className="p-2 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors" title="Télécharger" data-testid={`download-doc-${doc.id}`}>
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(doc.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors" title="Supprimer" data-testid={`delete-doc-${doc.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()} data-testid="upload-modal">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Ajouter un document</h3>
              <button onClick={() => setShowUpload(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom du document</label>
                <input
                  data-testid="doc-name-input"
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Nom du document (optionnel)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  data-testid="doc-notes-input"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notes (optionnel)"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div
                data-testid="drop-zone"
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
              >
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Glissez-déposez vos fichiers ici</p>
                <p className="text-xs text-slate-400 mt-1">ou cliquez pour sélectionner</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && handleFileUpload(e.target.files)}
                />
              </div>
              {uploading && (
                <div className="space-y-1 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <p className="text-center text-sm text-indigo-700 font-medium">{uploadProgress?.label || 'Upload en cours…'}</p>
                  <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress?.pct || 0}%` }} />
                  </div>
                  <p className="text-center text-xs text-indigo-500">{uploadProgress?.pct || 0}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && previewData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (previewData?.startsWith('blob:')) URL.revokeObjectURL(previewData); setPreviewDoc(null); setPreviewData(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()} data-testid="preview-modal">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-slate-800">{previewDoc.name}</h3>
              <div className="flex items-center gap-2">
                <a href={previewData} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Ouvrir
                </a>
                <button onClick={() => handleDownload(previewDoc)} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Télécharger
                </button>
                <button onClick={() => { if (previewData?.startsWith('blob:')) URL.revokeObjectURL(previewData); setPreviewDoc(null); setPreviewData(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50 min-h-[500px]">
              {previewDoc.file_type?.startsWith('image/') ? (
                <img src={previewData} alt={previewDoc.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md" />
              ) : previewDoc.file_type?.includes('pdf') ? (
                <iframe src={previewData} title={previewDoc.name} className="w-full h-[70vh] rounded-lg border-0" />
              ) : previewDoc.file_type?.startsWith('text/') ? (
                <iframe src={previewData} title={previewDoc.name} className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />
              ) : previewDoc.file_type?.startsWith('video/') ? (
                <video src={previewData} controls className="max-w-full max-h-[70vh] rounded-lg shadow-md" />
              ) : previewDoc.file_type?.startsWith('audio/') ? (
                <audio src={previewData} controls className="w-full" />
              ) : (
                <div className="text-center py-16">
                  <File className="w-16 h-16 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium mb-2">Aperçu intégré non disponible</p>
                  <p className="text-sm text-slate-400 mb-4">Type: {previewDoc.file_type || 'inconnu'}</p>
                  <div className="flex items-center justify-center gap-3">
                    <a href={previewData} target="_blank" rel="noreferrer" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                      Ouvrir dans un nouvel onglet
                    </a>
                    <button onClick={() => handleDownload(previewDoc)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300">
                      Télécharger
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
