'use client';

import { useEffect, useState, ReactNode } from 'react';
import { api } from '../utils/api';
import { StatDef, NoteDef } from '../screens';

// ============================================================
// Ekran blokları — CMS dizaynındakı tərtibatın eynisi
//
//   ScreenHeader   : h1 + alt başlıq
//   StatCards      : emoji + rəqəm + etiket kartları
//   InsightRow     : ad / təsvir / sağda nişan
//   PrincipleNote   : ekranın altındakı rəngli prinsip qutusu
//   DataTable      : ağ cədvəl, F8FAFC başlıq
// ============================================================

export function ScreenHeader({ h1, sub }: { h1: string; sub?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#1C2434]">{h1}</h1>
      {sub && <p className="text-[#5B6577] mt-1">{sub}</p>}
    </div>
  );
}

// ---------- Statistika kartları ----------

function formatValue(v: unknown, kind: string, suffix?: string): string {
  const n = typeof v === 'number' && isFinite(v) ? v : 0;
  if (kind === 'sum') {
    return n.toLocaleString('az-AZ', { maximumFractionDigits: 0 }) + (suffix || '');
  }
  return n.toLocaleString('az-AZ') + (suffix || '');
}

// statsKey - kart dəstinin şəxsiyyəti. Menyudan başqa ekrana keçəndə
// komponent yenidən mount olunmur, ona görə hesablanmış dəyərlər
// yeni dəstlə uyğunlaşdırılmalıdır — əks halda köhnə massivdən
// undefined oxunur və ekran çökür.
function statsKey(stats: StatDef[]): string {
  return stats.map((s) => s.kind + ':' + s.resource + ':' + s.label).join('|');
}

export function StatCards({ stats, color }: { stats: StatDef[]; color: string }) {
  const key = statsKey(stats);
  const [state, setState] = useState<{ key: string; values: (number | null)[] }>({
    key,
    values: stats.map(() => null),
  });

  // Dəst dəyişibsə, dəyərlər hələ gəlməyib — hamısı "—" göstərilir.
  const values = state.key === key ? state.values : stats.map(() => null);

  useEffect(() => {
    let cancelled = false;

    const compute = async (s: StatDef): Promise<number> => {
      if (s.kind === 'sum') {
        // Cəm üçün backend-də aqreqat endpoint yoxdur — səhifə çəkib toplayırıq
        const res = await api.list(s.resource, { per_page: 500, ...(s.params || {}) });
        const field = s.field || 'amount';
        return (res.data || []).reduce(
          (acc: number, row: any) => acc + (Number(row[field]) || 0),
          0
        );
      }

      const res = await api.list(s.resource, { per_page: 1, ...(s.params || {}) });
      const n = res.total || 0;

      if (s.kind === 'ratio' && s.ofResource) {
        const den = await api.list(s.ofResource, { per_page: 1, ...(s.ofParams || {}) });
        const d = den.total || 0;
        return d === 0 ? 0 : Math.round((n / d) * 100);
      }

      return n;
    };

    Promise.all(
      stats.map((s) => compute(s).catch(() => 0))
    ).then((res) => {
      if (!cancelled) setState({ key, values: res });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((s, i) => (
        <div
          key={s.label + i}
          className="flex-1 min-w-[160px] bg-white rounded-2xl border border-[#E8E5DE] p-5 flex flex-col gap-2"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{ background: color + '14' }}
          >
            {s.emoji}
          </div>
          <span className="text-2xl font-extrabold" style={{ color }}>
            {values[i] === null || values[i] === undefined
              ? '—'
              : formatValue(values[i], s.kind, s.suffix)}
          </span>
          <span className="text-sm text-[#5B6577]">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- İcmal sətri ----------

export function InsightRow({
  title,
  subtitle,
  badge,
  color,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E5DE] p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="block font-semibold text-[#1C2434] truncate">{title}</span>
        {subtitle && (
          <span className="block text-sm text-[#5B6577] mt-0.5 truncate">{subtitle}</span>
        )}
      </div>
      {badge && (
        <span
          className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
          style={{ background: color + '14', color }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

// ---------- Prinsip qutusu ----------

export function PrincipleNote({ note, color }: { note: NoteDef; color: string }) {
  return (
    <div className="rounded-2xl p-5 flex gap-3" style={{ background: color + '14' }}>
      <span className="text-lg leading-none">{note.emoji}</span>
      <div>
        <span className="block font-semibold text-sm mb-1" style={{ color }}>
          {note.title}
        </span>
        <span className="text-sm text-[#4A5365] leading-relaxed">{note.text}</span>
      </div>
    </div>
  );
}

// ---------- Cədvəl qabığı ----------

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[#E8E5DE] bg-white">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export const TH_CLASS = 'text-left px-4 py-3 font-semibold text-[#5B6577] whitespace-nowrap';
export const TD_CLASS = 'px-4 py-3 text-[#1C2434] whitespace-nowrap';
export const TR_CLASS = 'border-t border-[#E8E5DE]';
