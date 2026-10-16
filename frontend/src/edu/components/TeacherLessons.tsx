'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, List, CalendarDays, Search, BookPlus, Pencil, Trash2, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { ScreenMeta } from '../screens';
import { api, MediaItem, mediaUrl } from '../utils/api';
import { T } from '../theme';
import { ScreenHeader } from './screen';
import { Modal, Spinner, EmptyState } from './ui';
import MediaPicker from './MediaPicker';
import LessonJournal from './LessonJournal';

// ============================================================
// Müəllim "Dərslər" paneli
//  • Birləşdirilmiş görünüş (default): bütün dərslər siyahıda
//  • Təqvim görünüşü: gün / həftə / ay
//  • Filtrlər hər iki rejimdə qorunur
//  • Dərsə klik -> detal: davamiyyət kateqoriyaları + ev tapşırığı
// ============================================================

interface Props { meta: ScreenMeta; color: string }
interface L {
  id: number; date: string; start_time: string; end_time: string; group_id: number; group_name: string;
  subject_name: string; topic: string; status: string; total: number; attended: number; absent: number; pending: number;
  hw_status: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const dk = (s: string) => (s || '').slice(0, 10);
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
const DAYS = ['B.e', 'Ç.a', 'Çər', 'C.a', 'Cümə', 'Şən', 'Baz'];
const fmt = (s: string) => { const d = new Date(dk(s) + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`; };

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  planned: { label: 'Planlaşdırılıb', bg: T.accentSoft, fg: T.accent },
  ongoing: { label: 'Davam edir', bg: T.warnSoft, fg: T.warn },
  completed: { label: 'Tamamlanıb', bg: T.okSoft, fg: T.ok },
  cancelled: { label: 'Ləğv edilib', bg: T.badSoft, fg: T.bad },
};
const HW: Record<string, { label: string; bg: string; fg: string }> = {
  none: { label: 'Tapşırıq verilməyib', bg: T.lineSoft, fg: T.inkSoft },
  draft: { label: 'Qaralama', bg: T.warnSoft, fg: T.warn },
  published: { label: 'Dərc edilib', bg: T.okSoft, fg: T.ok },
};
const card = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius } as const;
const inp = 'px-3 py-2 rounded-xl border text-sm bg-white';

function Pill({ m, text }: { m: { label: string; bg: string; fg: string }; text?: string }) {
  return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: m.bg, color: m.fg }}>{text || m.label}</span>;
}

export default function TeacherLessons({ meta }: Props) {
  const color = '#0F766E';
  const today = new Date();
  const [view, setView] = useState<'combined' | 'calendar'>('combined');
  const [cal, setCal] = useState<'day' | 'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);
  const [f, setF] = useState({ q: '', group_id: '', status: '', attendance: '', homework: '' });
  const [range, setRange] = useState({ from: ymd(addDays(today, -7)), to: ymd(addDays(today, 30)) });
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<L[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  // yüklənəcək aralıq
  const win = useMemo(() => {
    if (view === 'combined') return range;
    if (cal === 'day') return { from: ymd(anchor), to: ymd(anchor) };
    if (cal === 'week') { const m = mondayOf(anchor); return { from: ymd(m), to: ymd(addDays(m, 6)) }; }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gs = mondayOf(first);
    return { from: ymd(gs), to: ymd(addDays(gs, 41)) };
  }, [view, cal, anchor, range]);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    const p = new URLSearchParams({ from: win.from, to: win.to });
    (Object.keys(f) as (keyof typeof f)[]).forEach((k) => f[k] && p.set(k, f[k]));
    return api.raw('/lessons-overview?' + p.toString())
      .then((r) => setRows((r.data || []) as L[]))
      .catch((e) => { setError(e?.message || 'Yüklənmədi'); setRows([]); })
      .finally(() => setLoading(false));
  }, [win, f]);

  useEffect(() => { const t = setTimeout(() => load(), f.q ? 250 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line
  useEffect(() => { api.list('groups', { per_page: 200 }).then((r) => setGroups((r.data || []).map((g: any) => ({ id: g.id, name: g.name })))).catch(() => {}); }, []);

  const byDay = useMemo(() => {
    const m: Record<string, L[]> = {};
    rows.forEach((r) => (m[dk(r.date)] ||= []).push(r));
    return m;
  }, [rows]);

  const step = (n: number) => {
    if (cal === 'day') setAnchor(addDays(anchor, n));
    else if (cal === 'week') setAnchor(addDays(anchor, 7 * n));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));
  };
  const label = cal === 'month' ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    : cal === 'week' ? `${fmt(win.from)} – ${fmt(win.to)}` : `${anchor.getDate()} ${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const hasFilter = Object.values(f).some(Boolean);

  const seg = (on: boolean) => ({ className: 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors', style: on ? { background: color, color: '#fff' } : { color: T.inkSoft } } as const);

  const chip = (l: L) => (
    <button key={l.id} onClick={() => setOpen(l.id)} className="w-full text-left rounded-lg px-1.5 py-1 text-[11px] leading-tight hover:opacity-80"
      style={{ background: STATUS[l.status]?.bg || T.lineSoft, color: T.ink }} title={`${l.start_time}–${l.end_time} ${l.subject_name} ${l.group_name}`}>
      <b>{l.start_time}</b> {l.subject_name || l.group_name}<span style={{ color: T.inkSoft }}> · {l.group_name}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader h1="Dərslər" sub="Bütün dərsləriniz, davamiyyət və ev tapşırıqları bir yerdə" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 p-1 rounded-2xl border" style={card} role="tablist">
          <button role="tab" aria-selected={view === 'combined'} onClick={() => setView('combined')} {...seg(view === 'combined')}><List className="w-4 h-4" /> Birləşdirilmiş</button>
          <button role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')} {...seg(view === 'calendar')}><CalendarDays className="w-4 h-4" /> Təqvim</button>
        </div>
        {view === 'calendar' && (
          <>
            <div className="inline-flex gap-1 p-1 rounded-2xl border" style={card}>
              {(['day', 'week', 'month'] as const).map((k) => (
                <button key={k} onClick={() => setCal(k)} {...seg(cal === k)}>{k === 'day' ? 'Gün' : k === 'week' ? 'Həftə' : 'Ay'}</button>
              ))}
            </div>
            <div className="inline-flex items-center rounded-xl border" style={card}>
              <button aria-label="Əvvəlki" onClick={() => step(-1)} className="p-2"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-3 text-sm font-semibold min-w-[150px] text-center" style={{ color: T.ink }}>{label}</span>
              <button aria-label="Sonrakı" onClick={() => step(1)} className="p-2"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setAnchor(new Date())} className="px-3 py-2 rounded-xl border text-sm font-medium" style={{ ...card, color: T.ink }}>Bu gün</button>
          </>
        )}
      </div>

      {/* Filtrlər */}
      <div className="flex flex-wrap items-center gap-2" data-testid="filters">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.inkFaint }} />
          <input className={inp + ' pl-9 w-52'} style={{ borderColor: T.line }} placeholder="Dərs və ya qrup axtar…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <select className={inp} style={{ borderColor: T.line }} value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}>
          <option value="">Bütün qruplar</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className={inp} style={{ borderColor: T.line }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Bütün statuslar</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inp} style={{ borderColor: T.line }} value={f.attendance} onChange={(e) => setF({ ...f, attendance: e.target.value })}>
          <option value="">İştirak (hamısı)</option>
          <option value="has_absent">İştirak etməyən var</option>
          <option value="unmarked">Davamiyyət qeyd olunmayıb</option>
          <option value="all_present">Hamı iştirak edib</option>
        </select>
        <select className={inp} style={{ borderColor: T.line }} value={f.homework} onChange={(e) => setF({ ...f, homework: e.target.value })}>
          <option value="">Ev tapşırığı (hamısı)</option>
          {Object.entries(HW).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {view === 'combined' && (
          <>
            <input type="date" className={inp} style={{ borderColor: T.line }} value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="Başlanğıc tarix" />
            <span style={{ color: T.inkFaint }}>–</span>
            <input type="date" className={inp} style={{ borderColor: T.line }} value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="Son tarix" />
          </>
        )}
        {hasFilter && <button onClick={() => setF({ q: '', group_id: '', status: '', attendance: '', homework: '' })} className="text-sm font-semibold" style={{ color }}>Filtrləri təmizlə</button>}
      </div>

      {loading ? <Spinner color={color} /> : error ? (
        <div className="rounded-xl p-5 text-sm flex items-center justify-between gap-3" style={{ background: T.badSoft, color: T.bad }}>
          {error}<button onClick={() => load()} className="font-semibold underline">Yenidən cəhd et</button>
        </div>
      ) : view === 'combined' ? (
        rows.length === 0 ? <div style={card}><EmptyState text={hasFilter ? 'Filtrə uyğun dərs tapılmadı' : 'Bu aralıqda dərs yoxdur'} /></div> : (
          <div className="flex flex-col gap-2" data-testid="lesson-list">
            {rows.map((l) => (
              <button key={l.id} onClick={() => setOpen(l.id)} className="text-left p-3.5 grid gap-2 md:grid-cols-[110px_1fr_auto_auto] md:items-center hover:shadow-sm transition-shadow" style={card}>
                <div>
                  <div className="text-sm font-bold" style={{ color: T.ink }}>{fmt(l.date)} · {DAYS[(new Date(dk(l.date) + 'T00:00:00').getDay() + 6) % 7]}</div>
                  <div className="text-xs" style={{ color: T.inkSoft }}>{l.start_time}{l.end_time ? '–' + l.end_time : ''}</div>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: T.ink }}>{l.subject_name || 'Dərs'} <span style={{ color: T.inkSoft }} className="font-normal">· {l.group_name}</span></div>
                  {l.topic && <div className="text-xs truncate" style={{ color: T.inkSoft }}>{l.topic}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: T.okSoft, color: T.ok }} title="İştirak edən">✓ {l.attended}</span>
                  <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: T.badSoft, color: T.bad }} title="İştirak etməyən">✕ {l.absent}</span>
                  <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: T.lineSoft, color: T.inkSoft }} title="Gözlənilən">… {l.pending}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill m={STATUS[l.status] || STATUS.planned} />
                  <Pill m={HW[l.hw_status] || HW.none} />
                </div>
              </button>
            ))}
          </div>
        )
      ) : cal === 'day' ? (
        (byDay[ymd(anchor)] || []).length === 0 ? <div style={card}><EmptyState text="Bu gün dərs yoxdur" /></div> : (
          <div className="flex flex-col gap-2">{(byDay[ymd(anchor)] || []).map((l) => (
            <button key={l.id} onClick={() => setOpen(l.id)} className="text-left p-3.5 flex items-center gap-3" style={card}>
              <b style={{ color: T.ink }}>{l.start_time}</b><span style={{ color: T.ink }}>{l.subject_name || 'Dərs'} · {l.group_name}</span>
              <span className="ml-auto"><Pill m={STATUS[l.status] || STATUS.planned} /></span>
            </button>))}</div>
        )
      ) : cal === 'week' ? (
        <div className="grid gap-2 grid-cols-1 md:grid-cols-7 items-start" data-testid="cal-week">
          {Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)).map((d, i) => (
            <div key={i} className="p-2 flex flex-col gap-1 min-h-[110px]" style={{ ...card, borderColor: ymd(d) === ymd(today) ? color : T.line }}>
              <div className="text-xs font-bold" style={{ color: T.inkSoft }}>{DAYS[i]} · {d.getDate()}</div>
              {(byDay[ymd(d)] || []).map(chip)}
            </div>
          ))}
        </div>
      ) : (
        <div data-testid="cal-month">
          <div className="grid grid-cols-7 gap-1 mb-1">{DAYS.map((d) => <div key={d} className="text-xs font-semibold text-center" style={{ color: T.inkSoft }}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 42 }, (_, i) => addDays(mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), i)).map((d) => (
              <div key={ymd(d)} className="p-1 min-h-[64px] md:min-h-[96px] flex flex-col gap-0.5"
                style={{ ...card, borderRadius: 10, opacity: d.getMonth() === anchor.getMonth() ? 1 : 0.4, borderColor: ymd(d) === ymd(today) ? color : T.line }}>
                <div className="text-[11px] font-bold" style={{ color: T.inkSoft }}>{d.getDate()}</div>
                {(byDay[ymd(d)] || []).slice(0, 3).map(chip)}
                {(byDay[ymd(d)] || []).length > 3 && <div className="text-[10px]" style={{ color: T.inkFaint }}>+{(byDay[ymd(d)] || []).length - 3} dərs</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {open !== null && <LessonDetail id={open} color={color} onClose={() => { setOpen(null); load(true); }} />}
    </div>
  );
}

// ------------------------------------------------------------
// Dərs detalı
// ------------------------------------------------------------
function LessonDetail({ id, color, onClose }: { id: number; color: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [showAtt, setShowAtt] = useState(false);
  const [hwForm, setHwForm] = useState<any | null>(null);

  const load = useCallback(() => api.raw('/lessons-overview/' + id).then(setD).catch((e) => setErr(e?.message || 'Yüklənmədi')), [id]);
  useEffect(() => { load(); }, [load]);

  const title = d ? `${d.lesson.subject_name || 'Dərs'} · ${d.lesson.group_name}` : 'Dərs';
  const cats: { k: string; label: string; bg: string; fg: string }[] = [
    { k: 'attended', label: 'İştirak edənlər', bg: T.okSoft, fg: T.ok },
    { k: 'absent', label: 'İştirak etməyənlər', bg: T.badSoft, fg: T.bad },
    { k: 'expected', label: 'Gözlənilən iştirakçılar', bg: T.lineSoft, fg: T.inkSoft },
  ];

  const del = async (hid: number) => {
    if (!confirm('Bu tapşırıq silinsin? Təhvil qeydləri də silinəcək.')) return;
    try { await api.raw('/homework/' + hid, { method: 'DELETE' }); toast.success('Tapşırıq silindi'); load(); } catch (e: any) { toast.error(e?.message || 'Silinmədi'); }
  };

  return (
    <Modal open title={title} onClose={onClose} wide>
      {err ? <p className="text-sm" style={{ color: T.bad }}>{err}</p> : !d ? <Spinner color={color} /> : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: T.inkSoft }}>
            <span>{fmt(d.lesson.date)} · {d.lesson.start_time}–{d.lesson.end_time}</span>
            <Pill m={STATUS[d.lesson.status] || STATUS.planned} />
            {d.lesson.topic && <span>· Mövzu: {d.lesson.topic}</span>}
          </div>

          {/* Davamiyyət */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold" style={{ color: T.ink }}>İştirak</h3>
              <span className="text-sm font-semibold" style={{ color: T.inkSoft }} data-testid="att-stat">
                {d.stats.attended}/{d.stats.total} iştirak · {d.stats.percent}%
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {cats.map((c) => {
                const list = d.students.filter((s: any) => s.category === c.k);
                return (
                  <div key={c.k} className="rounded-xl p-3" style={{ background: c.bg }} data-testid={'cat-' + c.k}>
                    <div className="text-xs font-bold mb-2" style={{ color: c.fg }}>{c.label} ({list.length})</div>
                    {list.length === 0 ? <div className="text-xs" style={{ color: c.fg, opacity: 0.7 }}>—</div> : (
                      <ul className="text-sm flex flex-col gap-1" style={{ color: T.ink }}>
                        {list.map((s: any) => <li key={s.student_id}>{s.name}{s.status === 'late' ? ' (gecikib)' : s.status === 'excused' ? ' (üzrlü)' : ''}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={() => { if (showAtt) load(); setShowAtt(!showAtt); }} className="self-start inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
              <UserCheck className="w-4 h-4" /> Davamiyyəti qeyd et / dəyiş {showAtt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAtt && <div className="rounded-xl border p-3" style={{ borderColor: T.line }}><LessonJournal lessonId={id} color={color} editable onSaved={load} /></div>}
          </section>

          {/* Ev tapşırığı */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold" style={{ color: T.ink }}>Ev tapşırığı</h3>
              <button onClick={() => setHwForm({})} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: color }} data-testid="hw-new">
                <BookPlus className="w-4 h-4" /> Ev tapşırığı ver
              </button>
            </div>
            {d.homework.length === 0 && <p className="text-sm" style={{ color: T.inkFaint }}>Bu dərs üçün tapşırıq verilməyib.</p>}
            {d.homework.map((h: any) => (
              <div key={h.id} className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: T.line }} data-testid="hw-item">
                <div className="flex flex-wrap items-center gap-2">
                  <b style={{ color: T.ink }}>{h.title}</b>
                  <Pill m={HW[h.status]} />
                  {h.due_date && <span className="text-xs" style={{ color: T.inkSoft }}>Son tarix: {fmt(h.due_date)} {new Date(h.due_date).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}</span>}
                  <span className="ml-auto flex gap-1">
                    <button aria-label="Redaktə" onClick={() => setHwForm(h)} className="p-1.5 rounded-lg hover:bg-[#FAF9F6]" style={{ color: T.inkSoft }}><Pencil className="w-4 h-4" /></button>
                    <button aria-label="Sil" onClick={() => del(h.id)} className="p-1.5 rounded-lg hover:bg-[#FAF9F6]" style={{ color: T.bad }}><Trash2 className="w-4 h-4" /></button>
                  </span>
                </div>
                {h.description && <p className="text-sm whitespace-pre-wrap" style={{ color: T.inkSoft }}>{h.description}</p>}
                {h.status === 'published' ? (
                  <div className="text-sm" style={{ color: T.ink }}>
                    <b>{h.submitted}</b> təhvil verib · <b>{h.total - h.submitted}</b> hələ verməyib
                    <div className="flex flex-wrap gap-1 mt-2">
                      {h.students.map((s: any) => (
                        <span key={s.student_id} className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={s.status === 'pending' ? { background: T.lineSoft, color: T.inkSoft } : { background: T.okSoft, color: T.ok }}>
                          {s.name}{s.status === 'late' ? ' (gec)' : s.status === 'graded' ? ' (qiymətli)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-xs" style={{ color: T.inkFaint }}>Qaralamadır — tələbələr görmür.</p>}
              </div>
            ))}
          </section>
        </div>
      )}
      {hwForm && d && <HomeworkForm lessonId={id} init={hwForm} students={d.students} color={color} onClose={() => setHwForm(null)} onSaved={() => { setHwForm(null); load(); }} />}
    </Modal>
  );
}

function HomeworkForm({ lessonId, init, students, color, onClose, onSaved }: { lessonId: number; init: any; students: any[]; color: string; onClose: () => void; onSaved: () => void }) {
  const toLocal = (s?: string) => { if (!s) return ''; const x = new Date(s); return `${ymd(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
  const [title, setTitle] = useState(init.title || '');
  const [desc, setDesc] = useState(init.description || '');
  const [due, setDue] = useState(toLocal(init.due_date));
  const [files, setFiles] = useState<MediaItem[]>(Array.isArray(init.attachments) ? init.attachments : []);
  const [all, setAll] = useState(!(init.student_ids && init.student_ids.length));
  const [picked, setPicked] = useState<number[]>(init.student_ids || []);
  const [busy, setBusy] = useState(false);

  const save = async (publish: boolean) => {
    if (!title.trim()) return toast.error('Tapşırığın adını yazın');
    if (!all && picked.length === 0) return toast.error('Ən azı bir şagird seçin');
    setBusy(true);
    try {
      await api.raw(`/lessons-overview/${lessonId}/homework`, {
        method: 'POST',
        body: JSON.stringify({ id: init.id || 0, title, description: desc, due_date: due, student_ids: all ? [] : picked, attachments: files, publish }),
      });
      toast.success(publish ? 'Tapşırıq dərc edildi' : 'Qaralama saxlandı');
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Saxlanmadı'); } finally { setBusy(false); }
  };

  return (
    <Modal open title={init.id ? 'Tapşırığı redaktə et' : 'Ev tapşırığı ver'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Tapşırığın adı <span style={{ color: T.bad }}>*</span></label>
          <input className={inp + ' w-full'} style={{ borderColor: T.line }} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="hw-title" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Təsvir və təlimat</label>
          <textarea className={inp + ' w-full'} style={{ borderColor: T.line }} rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Şəkil / audio əlavə et</label>
          <MediaPicker value={files} onChange={setFiles} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Son təhvil tarixi və saatı</label>
          <input type="datetime-local" className={inp} style={{ borderColor: T.line }} value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Kimə</label>
          <div className="flex gap-4 text-sm mb-2" style={{ color: T.ink }}>
            <label className="flex items-center gap-1.5"><input type="radio" checked={all} onChange={() => setAll(true)} /> Bütün qrup</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={!all} onChange={() => setAll(false)} /> Seçilmiş şagirdlər</label>
          </div>
          {!all && (
            <div className="max-h-40 overflow-auto rounded-xl border p-1 grid sm:grid-cols-2 gap-0.5" style={{ borderColor: T.line }}>
              {students.map((s) => (
                <label key={s.student_id} className="flex items-center gap-2 px-2 py-1.5 text-sm" style={{ color: T.ink }}>
                  <input type="checkbox" checked={picked.includes(s.student_id)} onChange={() => setPicked(picked.includes(s.student_id) ? picked.filter((x) => x !== s.student_id) : [...picked, s.student_id])} /> {s.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: T.line, color: T.ink }}>Ləğv et</button>
          <button onClick={() => save(false)} disabled={busy} className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-60" style={{ borderColor: color, color }} data-testid="hw-draft">Qaralama saxla</button>
          <button onClick={() => save(true)} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: color }} data-testid="hw-publish">Dərc et</button>
        </div>
      </div>
    </Modal>
  );
}
