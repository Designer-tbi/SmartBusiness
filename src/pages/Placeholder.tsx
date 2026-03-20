import React from 'react';
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function Placeholder() {
  const location = useLocation();
  const pageName = location.pathname.split('/').pop() || 'Module';
  const formattedName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <Construction size={64} className="mb-4 text-indigo-500" />
      <h2 className="text-2xl font-bold text-slate-800 mb-2">{formattedName}</h2>
      <p>Ce module est en cours de développement.</p>
    </div>
  );
}
