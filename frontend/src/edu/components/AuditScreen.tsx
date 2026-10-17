'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { mail, AuditRow, api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, TableShell, TH_CLASS, TD_CLASS, TR_CLASS } from './screen';
import { Button, Spinner, EmptyState } from './ui';
import { getResource } from '../resources';
import { T } from '../theme';

// ============================================================
// Audit jurnalı — girişlər, hesab dəyişiklikləri və bütün yazılar.
// ============================================================

export const ACTION_LABEL: Record<string, { label: string; tone?: 'bad' | 'warn' | 'ok' }> = {
  login: { label: 'Giriş', tone: 'ok' },
  login_failed: { label: 'Uğursuz giriş', tone: 'bad' },
  registered: { label: 'Qeydiyyat' },
  password_reset_requested: { label: 'Parol bərpası istəndi', tone: 'warn' },
  password_reset: { label: 'Parol bərpa edildi', tone: 'warn' },
  password_changed: { label: 'Parol dəyişdirildi', tone: 'warn' },
  password_set: { label: 'Parol təyin edildi', tone: 'warn' },
  password_set_by_admin: { label: 'Admin parol verdi', tone: 'warn' },
  password_reset_sent: { label: 'Bərpa linki göndərildi', tone: 'warn' },
  logout_all: { label: 'Bütün cihazlardan çıxış', tone: 'warn' },
  user_created: { label: 'Hesab yaradıldı' },
  user_updated: { label: 'Hesab dəyişdirildi' },
  user_deleted: { label: 'Hesab silindi', tone: 'bad' },
  create: { label: 'Yaradıldı' },
  update: { label: 'Dəyişdirildi' },
  delete: { label: 'Silindi', tone: 'bad' },
  archive: { label: 'Arxivə göndərildi' },
  restore: { label: 'Arxivdən qaytarıldı' },
  payment: { label: 'Ödəniş qəbul edildi', tone: 'ok' },
};

const TONE: Record<string, { color: string; soft: string }> = {
  bad: { color: T.bad, soft: T.badSoft },
  warn: { color: T.warn, soft: T.warnSoft },
  ok: { color: T.ok, soft: T.okSoft },
  none: { color: T.inkSoft, soft: T.lineSoft },
};

function resourceLabel(r: string): string {
  if (r === 'auth') return 'Giriş';
  if (r === 'users') return 'İstifadəçilər';
  const d = getResource(r);
  return d ? d.title : r;
}

export default function AuditScreen({ meta, color }: { meta: ScreenMeta; color: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setRows(null);
    mail
      .audit({ action, q })
      .then((r) => { setRows(r.data || []); setMore((r.data || []).length >= 200); })
      .catch((e) => { setErr(e?.message || 'Yüklənmədi'); setRows([]); });
  }, [action, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const loadMore = () => {
    if (!rows || !rows.length) return;
    const last = rows[rows.length - 1].id;
    api
      .raw('/audit?before_id=' + last + (action ? '&action=' + action : '') + (q ? '&q=' + encodeURIComponent(q) : ''))
      .then((r: any) => { setRows([...(rows || []), ...(r.data || [])]); setMore((r.data || []).length >= 200); })
      .catch(() => {});
  };

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.inkFaint }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="E-poçt və ya qeyd…"
            className="pl-9 pr-3 py-2 rounded-xl border text-sm bg-white outline-none"
            style={{ borderColor: T.line }}
          />
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: T.line }}>
          <option value="">Bütün hadisələr</option>
          {Object.keys(ACTION_LABEL).map((k) => <option key={k} value={k}>{ACTION_LABEL[k].label}</option>)}
        </select>
        <Button variant="ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Yenilə</Button>
      </div>
      {err && <p className="text-sm" style={{ color: T.bad }}>{err}</p>}
      {!rows ? <Spinner color={color} /> : rows.length === 0 ? <EmptyState text="Hələ qeyd yoxdur" /> : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="bg-[#FAF9F6]">
              <tr>
                <th className={TH_CLASS}>Vaxt</th>
                <th className={TH_CLASS}>Kim</th>
                <th className={TH_CLASS}>Hadisə</th>
                <th className={TH_CLASS}>Bölmə</th>
                <th className={TH_CLASS}>Qeyd</th>
                <th className={TH_CLASS}>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = ACTION_LABEL[r.action] || { label: r.action };
                const tone = TONE[a.tone || 'none'];
                return (
                  <tr key={r.id} className={TR_CLASS}>
                    <td className={TD_CLASS + ' tabular-nums'} style={{ color: T.inkSoft }}>{new Date(r.created_at).toLocaleString('az-AZ')}</td>
                    <td className={TD_CLASS}>{r.user_email || '—'}</td>
                    <td className={TD_CLASS}>
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: tone.soft, color: tone.color }}>{a.label}</span>
                    </td>
                    <td className={TD_CLASS} style={{ color: T.inkSoft }}>{resourceLabel(r.resource)}{r.ref_id ? ' #' + r.ref_id : ''}</td>
                    <td className="px-4 py-3 max-w-[280px] truncate" title={r.detail}>{r.detail}</td>
                    <td className={TD_CLASS + ' tabular-nums'} style={{ color: T.inkFaint }}>{r.ip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
      {more && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={loadMore}>Daha köhnələr</Button>
        </div>
      )}
    </>
  );
}
