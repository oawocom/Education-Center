'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Mail, Pencil, RotateCcw, Send, RefreshCw, Search } from 'lucide-react';
import { mail, MailTemplate, MailLogRow, getUser } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, TableShell, TH_CLASS, TD_CLASS, TR_CLASS } from './screen';
import { Modal, Button, Spinner, EmptyState } from './ui';
import { T } from '../theme';

// ============================================================
// E-poçt — mərkəzin göndərdiyi məktublar.
//   Şablonlar: mövzu və mətni dəyişmək, söndürmək, test göndərmək.
//   Jurnal: hər məktubun taleyi (göndərildi / alınmadı / göndərilmədi).
// SMTP-nin özü super admin panelində qurulur.
// ============================================================

const VAR_LABEL: Record<string, string> = {
  name: 'alıcının adı', email: 'alıcının e-poçtu', centre: 'mərkəzin adı', link: 'düymənin linki',
  minutes: 'linkin müddəti (dəq)', title: 'bildirişin başlığı', body: 'bildirişin mətni',
};

const SAMPLE: Record<string, string> = {
  name: 'Aynur Məmmədova', email: 'aynur@example.com', centre: 'Mərkəz', link: 'https://…', minutes: '60',
  title: 'Yeni ismarıc', body: 'Sabahkı dərs saat 15:00-a keçirildi.',
};

const STATUS: Record<string, { label: string; color: string; soft: string }> = {
  sent: { label: 'Göndərildi', color: T.ok, soft: T.okSoft },
  failed: { label: 'Alınmadı', color: T.bad, soft: T.badSoft },
  skipped: { label: 'Göndərilmədi', color: T.warn, soft: T.warnSoft },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// preview - serverdəki renderTemplate-in sadə surəti (yalnız göstərmək üçün).
function preview(body: string, centre: string, color: string): string {
  const vars = { ...SAMPLE, centre: centre || SAMPLE.centre };
  let h = esc(body);
  h = h.replace(/\{\{\s*button:([^}]*)\}\}/g, (_m, label) =>
    `<span style="display:inline-block;margin:10px 0;background:${color};color:#fff;padding:9px 16px;border-radius:10px;font-weight:600">${label.trim()}</span>`);
  h = h.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => esc((vars as any)[k] ?? ''));
  return h.replace(/\n/g, '<br>');
}

function fill(text: string, centre: string): string {
  const vars = { ...SAMPLE, centre: centre || SAMPLE.centre };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => (vars as any)[k] ?? '');
}

export default function EmailScreen({ meta, color }: { meta: ScreenMeta; color: string }) {
  const [tab, setTab] = useState<'templates' | 'log'>('templates');
  const [data, setData] = useState<{ list: MailTemplate[]; ready: boolean; from: string; fromName: string } | null>(null);
  const [edit, setEdit] = useState<MailTemplate | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    mail
      .templates()
      .then((r) => setData({ list: r.data, ready: r.mail_ready, from: r.from, fromName: r.from_name }))
      .catch((e) => setErr(e?.message || 'Yüklənmədi'));
  }, []);
  useEffect(load, [load]);

  const toggle = async (t: MailTemplate) => {
    try {
      await mail.save(t.key, { subject: t.subject, body: t.body, enabled: !t.enabled });
      toast.success(t.enabled ? 'Məktub söndürüldü' : 'Məktub yandırıldı');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Alınmadı');
    }
  };

  const tabBtn = (id: 'templates' | 'log', label: string) => (
    <button
      onClick={() => setTab(id)}
      className="px-3.5 py-2 rounded-xl text-sm"
      style={tab === id ? { background: T.surface, color: T.ink, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,.06)' } : { color: T.inkSoft }}
    >
      {label}
    </button>
  );

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      {data && (
        data.ready ? (
          <div className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: T.line, background: T.okSoft }}>
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: T.ok }} />
            <p className="text-sm" style={{ color: T.ink }}>
              Göndərmə işləyir. Göndərən: <b>{data.fromName}</b> &lt;{data.from}&gt;
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: '#F5D9B0', background: T.warnSoft }}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: T.warn }} />
            <p className="text-sm" style={{ color: T.ink }}>
              Bu mərkəz üçün e-poçt göndərmə (SMTP) hələ qurulmayıb — super admin panelində təyin olunur. O vaxta qədər məktublar getmir
              (jurnalda &quot;Göndərilmədi&quot; görünür); dəvət linklərini əl ilə ötürün.
            </p>
          </div>
        )
      )}

      <div className="flex gap-1 p-1 rounded-2xl self-start" style={{ background: T.lineSoft }}>
        {tabBtn('templates', 'Şablonlar')}
        {tabBtn('log', 'Göndəriş jurnalı')}
      </div>

      {err && <p className="text-sm" style={{ color: T.bad }}>{err}</p>}

      {tab === 'templates' && (!data ? <Spinner color={color} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.list.map((t) => (
            <div key={t.key} className="bg-white rounded-2xl border p-4 flex flex-col gap-2" style={{ borderColor: T.line, opacity: t.enabled ? 1 : 0.7 }}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: T.accentSoft }}>
                  <Mail className="w-4 h-4" style={{ color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                    {t.label}
                    {t.customized && <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: T.accentSoft, color }}>dəyişdirilib</span>}
                    {!t.enabled && <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: T.badSoft, color: T.bad }}>söndürülüb</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{t.description}</p>
                </div>
              </div>
              <p className="text-xs truncate px-3 py-2 rounded-lg" style={{ background: T.bg, color: T.inkSoft }} title={t.subject}>
                <b>Mövzu:</b> {fill(t.subject, typeof document !== 'undefined' ? document.title : '')}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Button variant="ghost" onClick={() => setEdit(t)}><Pencil className="w-3.5 h-3.5" /> Redaktə</Button>
                <label className="ml-auto flex items-center gap-2 text-xs cursor-pointer" style={{ color: T.inkSoft }}>
                  <input type="checkbox" checked={t.enabled} onChange={() => toggle(t)} /> Göndərilsin
                </label>
              </div>
            </div>
          ))}
        </div>
      ))}

      {tab === 'log' && <MailLog color={color} />}

      {edit && <TemplateEditor t={edit} color={color} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function TemplateEditor({ t, color, onClose, onSaved }: { t: MailTemplate; color: string; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [enabled, setEnabled] = useState(t.enabled);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const centre = typeof document !== 'undefined' ? document.title : '';

  const insert = (token: string) => {
    const el = ref.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const a = el.selectionStart, z = el.selectionEnd;
    const next = body.slice(0, a) + token + body.slice(z);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + token.length;
    });
  };

  const save = async () => {
    setBusy('save');
    setErr('');
    try {
      await mail.save(t.key, { subject, body, enabled });
      toast.success('Şablon saxlandı');
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Saxlanmadı');
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      await mail.reset(t.key);
      toast.success('Standart mətnə qaytarıldı');
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Alınmadı');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setErr('');
    try {
      const r = await mail.test(t.key, { subject, body });
      toast.success('Test məktubu göndərildi', { description: r.to });
    } catch (e: any) {
      setErr(e?.message || 'Göndərilmədi');
    } finally {
      setBusy('');
    }
  };

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2F5BEA]/25';
  return (
    <Modal
      open
      wide
      title={t.label}
      onClose={onClose}
      footer={
        <>
          {t.customized && (
            <Button variant="ghost" onClick={reset} disabled={!!busy}><RotateCcw className="w-3.5 h-3.5" /> Standarta qaytar</Button>
          )}
          <Button variant="ghost" onClick={test} disabled={!!busy}>
            <Send className="w-3.5 h-3.5" /> {busy === 'test' ? 'Göndərilir…' : `Test: ${getUser()?.email || 'mənə'}`}
          </Button>
          <Button color={color} onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saxlanılır…' : 'Saxla'}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs" style={{ color: T.inkSoft }}>{t.description}</p>
          {err && <p className="text-sm px-3 py-2 rounded-lg" style={{ background: T.badSoft, color: T.bad }}>{err}</p>}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Mövzu</label>
            <input className={inp} style={{ borderColor: T.line }} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Mətn</label>
            <textarea ref={ref} rows={11} className={inp + ' font-[inherit] leading-relaxed'} style={{ borderColor: T.line }} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: T.inkSoft }}>Əlavə et (kliklə):</p>
            <div className="flex flex-wrap gap-1.5">
              {t.vars.map((v) => (
                <button key={v} type="button" onClick={() => insert('{{' + v + '}}')} className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: T.line }} title={VAR_LABEL[v]}>
                  {'{{' + v + '}}'} <span style={{ color: T.inkFaint }}>· {VAR_LABEL[v] || v}</span>
                </button>
              ))}
              {t.vars.indexOf('link') !== -1 && (
                <button type="button" onClick={() => insert('{{button:Daxil ol}}')} className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: T.line }}>
                  {'{{button:…}}'} <span style={{ color: T.inkFaint }}>· linkli düymə</span>
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Bu məktub göndərilsin
          </label>
          {(t.key === 'password_reset' || t.key === 'password_changed' || t.key === 'invitation') && !enabled && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: T.warnSoft, color: T.warn }}>
              Diqqət: bu məktub söndürülsə, istifadəçilər parolu özləri bərpa edə / dəvəti ala bilməyəcək.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: T.inkSoft }}>Önizləmə (nümunə dəyərlərlə)</p>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: T.line, background: '#f4f6fb' }}>
            <div className="px-4 py-2.5 text-xs border-b bg-white" style={{ borderColor: T.lineSoft, color: T.inkSoft }}>
              <b style={{ color: T.ink }}>{fill(subject, centre)}</b>
            </div>
            <div className="m-3 rounded-xl bg-white border" style={{ borderColor: '#e3e7ef' }}>
              <div className="px-4 py-3 border-b text-sm font-bold" style={{ borderColor: '#eef1f6', color: '#2F5BEA' }}>{centre || 'Mərkəz'}</div>
              <div className="px-4 py-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: preview(body, centre, '#2F5BEA') }} />
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: T.inkFaint }}>
            Mətn olduğu kimi göndərilir: sətirlər qorunur, HTML yazmaq lazım deyil. {'{{button:Mətn}}'} yerinə linkli düymə qoyulur.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function MailLog({ color }: { color: string }) {
  const [rows, setRows] = useState<MailLogRow[] | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setRows(null);
    mail
      .log({ status, q })
      .then((r) => setRows(r.data || []))
      .catch((e) => { setErr(e?.message || 'Yüklənmədi'); setRows([]); });
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.inkFaint }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ünvan və ya mövzu…"
            className="pl-9 pr-3 py-2 rounded-xl border text-sm bg-white outline-none"
            style={{ borderColor: T.line }}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: T.line }}>
          <option value="">Hamısı</option>
          <option value="sent">Göndərildi</option>
          <option value="failed">Alınmadı</option>
          <option value="skipped">Göndərilmədi</option>
        </select>
        <Button variant="ghost" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Yenilə</Button>
      </div>
      {err && <p className="text-sm" style={{ color: T.bad }}>{err}</p>}
      {!rows ? <Spinner color={color} /> : rows.length === 0 ? <EmptyState text="Hələ məktub yoxdur" /> : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="bg-[#FAF9F6]">
              <tr>
                <th className={TH_CLASS}>Vaxt</th>
                <th className={TH_CLASS}>Alıcı</th>
                <th className={TH_CLASS}>Mövzu</th>
                <th className={TH_CLASS}>Vəziyyət</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status] || STATUS.skipped;
                return (
                  <tr key={r.id} className={TR_CLASS}>
                    <td className={TD_CLASS + ' tabular-nums'} style={{ color: T.inkSoft }}>{new Date(r.created_at).toLocaleString('az-AZ')}</td>
                    <td className={TD_CLASS}>{r.to}</td>
                    <td className="px-4 py-3 max-w-[340px] truncate" title={r.subject}>{r.subject}</td>
                    <td className={TD_CLASS}>
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: s.soft, color: s.color }} title={r.error || ''}>{s.label}</span>
                      {r.error && <span className="block text-[11px] mt-1 max-w-[260px] truncate" style={{ color: T.inkFaint }} title={r.error}>{r.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
