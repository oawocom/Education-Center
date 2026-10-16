'use client';

import { ReactNode, useEffect } from 'react';
import { X, Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { FieldDef, SelectOption } from '../types';

// ============================================================
// Modal
// ============================================================

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={
          'relative bg-white rounded-2xl border border-[#E8E5DE] shadow-xl w-full max-h-[90vh] flex flex-col ' +
          (wide ? 'max-w-3xl' : 'max-w-xl')
        }
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E5DE]">
          <h2 className="text-base font-bold text-[#1C2434]">{title}</h2>
          <button onClick={onClose} className="text-[#9AA3B2] hover:text-[#5B6577]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-[#E8E5DE] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Düymələr
// ============================================================

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  color,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  color?: string;
  className?: string;
}) {
  const base =
    'px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-1.5';

  const styles: Record<string, string> = {
    primary: 'text-white',
    ghost: 'text-[#5B6577] hover:bg-[#F0EEE8] border border-[#E8E5DE]',
    danger: 'text-[#DC2626] hover:bg-[#FEF2F2] border border-[#FECACA]',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={base + ' ' + styles[variant] + ' ' + className}
      style={variant === 'primary' ? { background: color || '#2F5BEA' } : undefined}
    >
      {children}
    </button>
  );
}

// ============================================================
// Vəziyyət blokları
// ============================================================

export function Spinner({ color = '#2F5BEA' }: { color?: string }) {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color }} />
    </div>
  );
}

export function EmptyState({ text = 'Məlumat yoxdur' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <Inbox className="w-9 h-9 text-[#CBD5E1] mb-3" />
      <p className="text-sm text-[#9AA3B2]">{text}</p>
    </div>
  );
}

export function ErrorState({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
      <p className="text-sm text-[#B91C1C]">{text}</p>
    </div>
  );
}

export function Badge({ text, color }: { text: string; color?: string }) {
  const c = color || '#5B6577';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold"
      style={{ background: c + '1A', color: c }}
    >
      {text}
    </span>
  );
}

// ============================================================
// Form sahəsi
// ============================================================

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-[#E8E5DE] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2F5BEA]/25 focus:border-[#2F5BEA] disabled:bg-[#FAF9F6] disabled:text-[#9AA3B2]';

export function Field({
  def,
  value,
  onChange,
  options,
  loading,
}: {
  def: FieldDef;
  value: any;
  onChange: (v: any) => void;
  options?: SelectOption[];
  loading?: boolean;
}) {
  const v = value === null || value === undefined ? '' : value;

  const label = (
    <label className="block text-sm font-semibold text-[#1C2434] mb-1.5">
      {def.label}
      {def.required && <span className="text-[#DC2626] ml-0.5">*</span>}
    </label>
  );

  let input: ReactNode;

  switch (def.type) {
    case 'textarea':
      input = (
        <textarea
          value={v}
          onChange={(e) => onChange(e.target.value)}
          disabled={def.readOnly}
          rows={4}
          placeholder={def.placeholder}
          className={inputCls}
        />
      );
      break;

    case 'checkbox':
      input = (
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={def.readOnly}
            className="w-4 h-4 rounded border-[#CBD5E1] text-[#2F5BEA] focus:ring-[#2F5BEA]/25"
          />
          <span className="text-sm text-[#5B6577]">{def.placeholder || 'Aktiv'}</span>
        </label>
      );
      break;

    case 'select':
    case 'relation': {
      const opts = def.type === 'relation' ? options || [] : def.options || [];
      input = (
        <select
          value={v}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            onChange(def.type === 'relation' ? Number(raw) : raw);
          }}
          disabled={def.readOnly || loading}
          className={inputCls}
        >
          <option value="">{loading ? 'Yüklənir...' : '— Seçin —'}</option>
          {opts.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    }

    case 'number':
      input = (
        <input
          type="number"
          value={v}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={def.readOnly}
          min={def.min}
          max={def.max}
          step={def.step}
          placeholder={def.placeholder}
          className={inputCls}
        />
      );
      break;

    case 'date':
      input = (
        <input
          type="date"
          value={typeof v === 'string' ? v.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value ? e.target.value + 'T00:00:00Z' : null)}
          disabled={def.readOnly}
          className={inputCls}
        />
      );
      break;

    case 'time':
      input = (
        <input
          type="time"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          disabled={def.readOnly}
          className={inputCls}
        />
      );
      break;

    case 'color':
      input = (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={v || '#2F5BEA'}
            onChange={(e) => onChange(e.target.value)}
            disabled={def.readOnly}
            className="w-10 h-9 rounded-lg border border-[#E8E5DE] cursor-pointer"
          />
          <input
            type="text"
            value={v}
            onChange={(e) => onChange(e.target.value)}
            disabled={def.readOnly}
            placeholder="#2F5BEA"
            className={inputCls}
          />
        </div>
      );
      break;

    default:
      input = (
        <input
          type={def.type === 'email' ? 'email' : def.type === 'phone' ? 'tel' : 'text'}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          disabled={def.readOnly}
          placeholder={def.placeholder}
          className={inputCls}
        />
      );
  }

  return (
    <div className={def.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'}>
      {def.type !== 'checkbox' && label}
      {def.type === 'checkbox' && label}
      {input}
      {def.help && <p className="text-xs text-[#9AA3B2] mt-1">{def.help}</p>}
    </div>
  );
}
