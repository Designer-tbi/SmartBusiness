import React from 'react';
import { getZoneConfig } from '../lib/countryConfig';

interface Props {
  value: string;
  onChange: (v: string) => void;
  zone?: string | null;
  className?: string;
  required?: boolean;
}

/**
 * Currency selector — displays only the currencies allowed in the user's zone.
 * For RDC (CD): CDF + USD + EUR
 * For CG/CM/etc: XAF only (returns single readonly display)
 * For FR: EUR only
 */
export default function CurrencySelector({ value, onChange, zone, className, required }: Props) {
  const cfg = getZoneConfig(zone);
  const options = [cfg.currency, ...(cfg.altCurrencies || [])];
  const labels: Record<string, string> = { XAF: 'FCFA (XAF)', XOF: 'FCFA (XOF)', CDF: 'Franc Congolais (CDF)', USD: 'Dollar US ($)', EUR: 'Euro (€)' };

  // If only one option, show as a non-interactive badge
  if (options.length === 1) {
    return (
      <div className={`px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium ${className || ''}`}>
        {cfg.flag} {labels[options[0]] || options[0]}
      </div>
    );
  }

  return (
    <select
      value={value || cfg.currency}
      onChange={e => onChange(e.target.value)}
      required={required}
      className={`w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all ${className || ''}`}
    >
      {options.map(c => <option key={c} value={c}>{labels[c] || c}</option>)}
    </select>
  );
}
