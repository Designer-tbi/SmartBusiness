import React from 'react';
import { getZoneConfig } from '../lib/countryConfig';

interface PhoneInputProps {
  value: string;
  onChange: (v: string) => void;
  zone?: string | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Phone input that shows the country prefix as a fixed prefix (visual only).
 * The user types the local number; the value stored includes the prefix only if entered.
 * Best practice: store full international format (+242 06 ...). We auto-prepend on blur if missing.
 */
export default function PhoneInput({ value, onChange, zone, required, placeholder, className, ...rest }: PhoneInputProps) {
  const cfg = getZoneConfig(zone);
  const prefix = cfg.phonePrefix;
  // Strip prefix from value for editing
  const local = value && value.startsWith(prefix) ? value.substring(prefix.length).trim() : value || '';

  const handleBlur = () => {
    if (!local) return;
    if (!value || !value.startsWith('+')) {
      onChange(`${prefix} ${local.trim()}`.trim());
    }
  };

  return (
    <div className={`flex items-stretch rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ${className || ''}`}>
      <div className="px-3 bg-slate-50 border-r border-slate-200 flex items-center text-sm font-medium text-slate-600 select-none">
        <span className="mr-1">{cfg.flag}</span>
        <span className="font-mono">{prefix}</span>
      </div>
      <input
        type="tel"
        value={local}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        required={required}
        placeholder={placeholder || '06 12 34 56'}
        className="flex-1 px-4 py-2.5 outline-none bg-white text-slate-900"
        {...rest}
      />
    </div>
  );
}
