'use client';

import { CSSProperties, ReactNode } from 'react';
import { T } from '../theme';

// Paylaşılan kiçik parçalar — imtahan qurucusu və oyunçusu üçün.

export const QTYPES: { value: string; label: string; hint: string }[] = [
  { value: 'mcq', label: 'Bir cavablı', hint: 'Variantlardan biri düzgündür' },
  { value: 'multi', label: 'Çoxseçimli', hint: 'Bir neçə düzgün variant' },
  { value: 'truefalse', label: 'Doğru / Yanlış', hint: 'İki seçimli' },
  { value: 'numeric', label: 'Ədədi', hint: 'Dəqiq ədəd, tolerantlıqla' },
  { value: 'gap', label: 'Boşluq', hint: 'Qısa mətn cavabı' },
  { value: 'match', label: 'Uyğunlaşdırma', hint: 'Cütləri uyğunlaşdır' },
  { value: 'open', label: 'Açıq sual', hint: 'Müəllim yoxlayır' },
];

export const typeLabel = (t: string) => QTYPES.find((x) => x.value === t)?.label || t;

export const cardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: T.radius,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 12,
  border: `1px solid ${T.line}`,
  background: T.surface,
  color: T.ink,
  fontSize: 14,
  outline: 'none',
};

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[13px] font-semibold" style={{ color: T.ink }}>{children}</span>
      {hint && <span className="text-xs" style={{ color: T.inkFaint }}>{hint}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-sm"
      style={{ color: T.ink }}
    >
      <span
        className="relative inline-block rounded-full transition-colors"
        style={{ width: 36, height: 20, background: checked ? T.accent : T.line }}
      >
        <span
          className="absolute rounded-full transition-all"
          style={{ top: 2, left: checked ? 18 : 2, width: 16, height: 16, background: T.surface }}
        />
      </span>
      {label}
    </button>
  );
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
