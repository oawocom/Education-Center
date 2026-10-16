'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Plus, CalendarPlus, NotebookPen, DoorOpen, User, BookOpen,
  Check, Minus, CalendarDays, Table2, Wand2, TrendingUp, UserCheck,
} from 'lucide-react';
import { ScreenMeta } from '../screens';
import { api, can, getUser } from '../utils/api';
import { T } from '../theme';
import { ScreenHeader, PrincipleNote } from './screen';
import { Modal, Button, Spinner } from './ui';
import TeacherLessons from './TeacherLessons';
import LessonJournal, { ATT_STATUSES, attMeta } from './LessonJournal';

// ============================================================
// ScheduleGrid — məktəb gündəliyi
//
//  Tab 1 "Gündəlik": həftəlik görünüş (masaüstü: B.e–B sütunları,
//        mobil: gün-gün siyahı). Hər dərs: saat, fənn/qrup, otaq,
//        MÖVZU və EV TAPŞIRIĞI.
//        Şagird/valideyn: davamiyyət + qiymət + xülasə.
//        Müəllim/admin: dərsə klik -> "Dərs jurnalı".
//  Tab 2 "Davamiyyət cədvəli": qrup + ay üzrə şagird x tarix.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface JRow {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  group_id: number;
  group_name: string;
  subject_name: string;
  teacher_name: string;
  room_name: string;
  topic: string;
  homework: string;
  status: string;
  student_id?: number;
  student_name?: string;
  attendance?: string;
  grade?: number | null;
}

const DAY_FULL = ['Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə', 'Bazar'];
const DAY_SHORT = ['B.e', 'Ç.a', 'Çər', 'C.a', 'Cümə', 'Şən', 'Baz'];
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const dayKey = (s: string) => (s || '').slice(0, 10);
const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`;
const fmtLong = (s: string) => {
  const [y, m, d] = dayKey(s).split('-').map(Number);
  return `${d} ${MONTHS[m - 1].toLowerCase()} ${y}`;
};

const card = { background: T.surface, borderColor: T.line } as const;

function ScheduleGridBase({ meta, color }: Props) {
  const user = getUser();
  const role = user?.role || '';
  const isStaff = role === 'admin' || role === 'teacher';
  const isViewer = role === 'student' || role === 'guardian';
  const canMark = can('attendance', 'create');
  const canCreate = can('lessons', 'create');

  const [tab, setTab] = useState<'week' | 'cal' | 'list' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<JRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kid, setKid] = useState<number | null>(null);
  const [open, setOpen] = useState<{ id: number; info: string } | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [generating, setGenerating] = useState(false);

  const today = new Date();
  const start = useMemo(() => addDays(mondayOf(new Date()), offset * 7), [offset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const monthFirst = useMemo(() => new Date(today.getFullYear(), today.getMonth() + offset, 1), [offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const gridStart = useMemo(() => mondayOf(monthFirst), [monthFirst]);
  const monthLast = useMemo(() => new Date(monthFirst.getFullYear(), monthFirst.getMonth() + 1, 0), [monthFirst]);
  const monthMode = tab === 'cal' || tab === 'list';
  const from = monthMode ? ymd(tab === 'cal' ? gridStart : monthFirst) : ymd(days[0]);
  const to = monthMode ? ymd(tab === 'cal' ? addDays(gridStart, 41) : monthLast) : ymd(days[6]);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return api
      .raw(`/journal?from=${from}&to=${to}`)
      .then((res) => setRows((res.data || []) as JRow[]))
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yüklənmədi'); setRows([]); })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Valideyn: uşaqlar
  const kids = useMemo(() => {
    const m = new Map<number, string>();
    rows.forEach((r) => { if (r.student_id) m.set(r.student_id, r.student_name || `Şagird #${r.student_id}`); });
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [rows]);
  useEffect(() => {
    if (kids.length && (kid === null || !kids.some((k) => k.id === kid))) setKid(kids[0].id);
  }, [kids, kid]);

  const visible = useMemo(
    () => (isViewer && kids.length > 1 && kid ? rows.filter((r) => r.student_id === kid) : rows),
    [rows, isViewer, kids, kid]
  );

  const byDay = useMemo(() => {
    const m: Record<string, JRow[]> = {};
    visible.forEach((r) => { (m[dayKey(r.date)] ||= []).push(r); });
    return m;
  }, [visible]);

  const summary = useMemo(() => {
    const grades = visible.filter((r) => typeof r.grade === 'number').map((r) => r.grade as number);
    const marked = visible.filter((r) => r.attendance);
    const attended = marked.filter((r) => r.attendance === 'present' || r.attendance === 'late').length;
    return {
      avg: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null,
      pct: marked.length ? Math.round((attended / marked.length) * 100) : null,
      gradeN: grades.length,
      markedN: marked.length,
    };
  }, [visible]);

  const generate = () => {
    setGenerating(true);
    api
      .raw('/ops/generate-lessons', { method: 'POST', body: JSON.stringify({ date_from: from, date_to: to }) })
      .then((res) => {
        const n = res?.created ?? 0;
        toast.success(n > 0 ? `${n} dərs yaradıldı` : res?.message || 'Yeni dərs yaradılmadı (artıq mövcuddur)');
        load(true);
        setVersion((v) => v + 1);
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yaradılmadı'); })
      .finally(() => setGenerating(false));
  };

  const closeJournal = () => { setOpen(null); load(true); setVersion((v) => v + 1); };

  const weekLabel = `${fmtDay(days[0])} – ${fmtDay(days[6])} ${days[6].getFullYear()}`;

  const tabBtn = (k: 'week' | 'cal' | 'list' | 'month', label: string, Icon: any) => (
    <button
      onClick={() => { if (k !== tab && (k === 'week') !== (tab === 'week')) setOffset(0); setTab(k); }}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors"
      style={tab === k ? { background: color, color: '#fff' } : { color: T.inkSoft }}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      <div className="inline-flex self-start flex-wrap gap-1 p-1 rounded-2xl border" style={card}>
        {tabBtn('week', 'Həftə', CalendarDays)}
        {tabBtn('cal', 'Təqvim', CalendarDays)}
        {tabBtn('list', 'Cədvəl', Table2)}
        {isStaff && tabBtn('month', 'Davamiyyət', UserCheck)}
      </div>

      {tab === 'month' && isStaff ? (
        <MonthTable color={color} version={version} onOpen={(id, info) => setOpen({ id, info })} />
      ) : (
        <>
          {/* Həftə naviqasiyası */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border" style={card}>
              <button aria-label="Əvvəlki həftə" onClick={() => setOffset((o) => o - 1)} className="p-2 hover:bg-[#FAF9F6] rounded-l-xl">
                <ChevronLeft className="w-4 h-4" style={{ color: T.inkSoft }} />
              </button>
              <span className="px-3 text-sm font-semibold min-w-[170px] text-center" style={{ color: T.ink }}>{monthMode ? `${MONTHS[monthFirst.getMonth()]} ${monthFirst.getFullYear()}` : weekLabel}</span>
              <button aria-label="Növbəti həftə" onClick={() => setOffset((o) => o + 1)} className="p-2 hover:bg-[#FAF9F6] rounded-r-xl">
                <ChevronRight className="w-4 h-4" style={{ color: T.inkSoft }} />
              </button>
            </div>
            <button
              onClick={() => setOffset(0)}
              disabled={offset === 0}
              className="px-3 py-2 rounded-xl border text-sm font-medium disabled:opacity-40"
              style={{ ...card, color: T.ink }}
            >
              {monthMode ? 'Bu ay' : 'Bu həftə'}
            </button>
            <div className="flex-1" />
            {canCreate && isStaff && tab === 'week' && (
              <button
                onClick={generate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium disabled:opacity-60"
                style={{ ...card, color: T.ink }}
                title="Seçilmiş həftə üçün həftəlik şablondan dərsləri yaradır; mövcud dərslər təkrarlanmır"
              >
                <Wand2 className="w-4 h-4" style={{ color }} />
                {generating ? 'Yaradılır…' : 'Həftəlik şablondan dərsləri yarat'}
              </button>
            )}
          </div>

          {/* Şagird / valideyn: uşaq seçimi + xülasə */}
          {isViewer && (
            <div className="flex flex-col gap-3">
              {kids.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {kids.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKid(k.id)}
                      className="px-3 py-1.5 rounded-xl text-sm font-semibold border"
                      style={kid === k.id ? { background: color, color: '#fff', borderColor: color } : { ...card, color: T.inkSoft }}
                    >
                      {k.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="rounded-xl border p-4" style={card}>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: T.inkSoft }}>
                    <TrendingUp className="w-3.5 h-3.5" /> Orta qiymət
                  </div>
                  <div className="text-2xl font-bold mt-1" style={{ color: T.ink }} data-testid="avg">
                    {summary.avg === null ? '—' : summary.avg.toFixed(1)}
                  </div>
                  <div className="text-xs" style={{ color: T.inkFaint }}>{summary.gradeN} qiymət</div>
                </div>
                <div className="rounded-xl border p-4" style={card}>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: T.inkSoft }}>
                    <UserCheck className="w-3.5 h-3.5" /> Davamiyyət
                  </div>
                  <div className="text-2xl font-bold mt-1" style={{ color: T.ink }} data-testid="pct">
                    {summary.pct === null ? '—' : summary.pct + '%'}
                  </div>
                  <div className="text-xs" style={{ color: T.inkFaint }}>{summary.markedN} dərs qeydə alınıb</div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <Spinner color={color} />
          ) : tab === 'cal' ? (
            <div data-testid="cal">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_SHORT.map((d) => <div key={d} className="text-xs font-semibold text-center" style={{ color: T.inkSoft }}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 42 }, (_, i) => {
                  const d = addDays(gridStart, i);
                  const key = ymd(d);
                  const list = byDay[key] || [];
                  const inMonth = d.getMonth() === monthFirst.getMonth();
                  const isToday = key === ymd(today);
                  return (
                    <div key={key} className="rounded-lg border p-1 min-h-[64px] md:min-h-[92px] flex flex-col gap-0.5"
                      style={{ ...card, opacity: inMonth ? 1 : 0.4, borderColor: isToday ? color : T.line }}>
                      <div className="text-[11px] font-bold" style={{ color: isToday ? color : T.inkSoft }}>{d.getDate()}</div>
                      {list.slice(0, 3).map((l) => (
                        <button key={l.id + '-' + (l.student_id || 0)} disabled={!isStaff}
                          onClick={() => setOpen({ id: l.id, info: `${l.group_name} · ${fmtLong(l.date)} · ${l.start_time || ''}` })}
                          className="text-left text-[10px] md:text-[11px] leading-tight rounded px-1 py-0.5 truncate"
                          style={{ background: T.lineSoft, color: T.ink }}
                          title={`${l.start_time}–${l.end_time} ${l.subject_name || l.group_name} ${l.teacher_name || ''}`}>
                          <b>{l.start_time}</b> {l.subject_name || l.group_name}{l.subject_name ? " · " + l.group_name : ""}
                        </button>
                      ))}
                      {list.length > 3 && <div className="text-[10px]" style={{ color: T.inkFaint }}>+{list.length - 3} dərs</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : tab === 'list' ? (
            <div className="rounded-xl border overflow-x-auto" style={card} data-testid="list">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: T.inkSoft, borderBottom: `1px solid ${T.line}` }}>
                    {['Tarix', 'Gün', 'Saat', 'Fənn', 'Qrup', 'Müəllim', ...(isViewer ? ['Davamiyyət', 'Qiymət'] : [])].map((h) => (
                      <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: T.inkFaint }}>Bu ay dərs yoxdur</td></tr>
                  )}
                  {visible.map((l) => {
                    const d = new Date(dayKey(l.date) + 'T00:00:00');
                    return (
                      <tr key={l.id + '-' + (l.student_id || 0)} className={isStaff ? 'cursor-pointer hover:bg-[#FAF9F6]' : ''}
                        style={{ borderBottom: `1px solid ${T.lineSoft}`, color: T.ink }}
                        onClick={() => isStaff && setOpen({ id: l.id, info: `${l.group_name} · ${fmtLong(l.date)} · ${l.start_time || ''}` })}>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDay(d)}</td>
                        <td className="px-3 py-2">{DAY_SHORT[(d.getDay() + 6) % 7]}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-semibold">{l.start_time}–{l.end_time}</td>
                        <td className="px-3 py-2">{l.subject_name || '—'}</td>
                        <td className="px-3 py-2">{l.group_name}</td>
                        <td className="px-3 py-2">{l.teacher_name || '—'}</td>
                        {isViewer && <td className="px-3 py-2">{l.attendance ? (attMeta(l.attendance)?.label || l.attendance) : '—'}</td>}
                        {isViewer && <td className="px-3 py-2">{typeof l.grade === 'number' ? l.grade : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-7 items-start" data-testid="week">
              {days.map((d, i) => {
                const key = ymd(d);
                const list = byDay[key] || [];
                const isToday = key === ymd(today);
                return (
                  <section
                    key={key}
                    className={'rounded-xl border flex flex-col ' + (list.length === 0 ? 'max-md:order-none' : '')}
                    style={{ ...card, borderColor: isToday ? color : T.line }}
                  >
                    <header className="flex items-center justify-between px-3 pt-2.5 pb-2" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                      <div>
                        <div className="text-xs font-semibold" style={{ color: isToday ? color : T.inkSoft }}>
                          <span className="md:hidden">{DAY_FULL[i]}</span>
                          <span className="hidden md:inline">{DAY_SHORT[i]}</span>
                        </div>
                        <div className="text-sm font-bold" style={{ color: T.ink }}>{fmtDay(d)}</div>
                      </div>
                      {canCreate && isStaff && (
                        <button aria-label="Dərs əlavə et" title="Dərs əlavə et" onClick={() => setAddDate(key)}
                          className="p-1 rounded-lg hover:bg-[#FAF9F6]" style={{ color: T.inkFaint }}>
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </header>
                    <div className="p-2 flex flex-col gap-2 md:min-h-[120px]">
                      {list.length === 0 && (
                        canCreate && isStaff ? (
                          <button onClick={() => setAddDate(key)}
                            className="text-xs py-3 rounded-lg border border-dashed hover:bg-[#FAF9F6]"
                            style={{ borderColor: T.line, color: T.inkFaint }}>
                            Dərs əlavə et
                          </button>
                        ) : (
                          <p className="text-xs py-2 text-center" style={{ color: T.inkFaint }}>Dərs yoxdur</p>
                        )
                      )}
                      {list.map((l) => (
                        <LessonCard
                          key={l.id + '-' + (l.student_id || 0)}
                          l={l}
                          color={color}
                          viewer={isViewer}
                          clickable={isStaff}
                          onClick={() => setOpen({ id: l.id, info: `${l.group_name} · ${fmtLong(l.date)} · ${l.start_time || ''}` })}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!open} title="Dərs jurnalı" onClose={closeJournal} wide>
        {open && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium" style={{ color: T.inkSoft }}>{open.info}</p>
            <LessonJournal lessonId={open.id} color={color} editable={canMark} />
          </div>
        )}
      </Modal>

      {addDate && (
        <QuickAdd
          date={addDate}
          color={color}
          onClose={() => setAddDate(null)}
          onCreated={(id, info) => { setAddDate(null); load(true); setVersion((v) => v + 1); if (canMark) setOpen({ id, info }); }}
        />
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </div>
  );
}

// ------------------------------------------------------------
// Dərs kartı
// ------------------------------------------------------------
function LessonCard({
  l, color, viewer, clickable, onClick,
}: { l: JRow; color: string; viewer: boolean; clickable: boolean; onClick: () => void }) {
  const att = attMeta(l.attendance);
  const cancelled = l.status === 'cancelled';
  const Tag: any = clickable ? 'button' : 'div';
  return (
    <Tag
      onClick={clickable ? onClick : undefined}
      data-testid="lesson"
      className={'text-left rounded-xl border p-2.5 flex flex-col gap-1.5 w-full ' + (clickable ? 'hover:shadow-sm transition-shadow' : '')}
      style={{ borderColor: T.line, background: T.surface, opacity: cancelled ? 0.55 : 1 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {l.start_time}{l.end_time ? '–' + l.end_time : ''}
        </span>
        {cancelled && <span className="text-[10px] font-semibold" style={{ color: T.bad }}>Ləğv</span>}
      </div>
      <div className="text-sm font-semibold leading-tight" style={{ color: T.ink }}>{l.subject_name || l.group_name}</div>
      {l.subject_name && <div className="text-xs" style={{ color: T.inkSoft }}>{l.group_name}</div>}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs" style={{ color: T.inkFaint }}>
        {l.room_name && <span className="inline-flex items-center gap-1"><DoorOpen className="w-3 h-3" />{l.room_name}</span>}
        {viewer && l.teacher_name && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{l.teacher_name}</span>}
      </div>
      {l.topic && (
        <div className="text-xs flex gap-1.5" style={{ color: T.ink }}>
          <BookOpen className="w-3 h-3 mt-0.5 shrink-0" style={{ color: T.inkFaint }} />
          <span>{l.topic}</span>
        </div>
      )}
      {l.homework && (
        <div className="text-xs flex gap-1.5 rounded-lg px-2 py-1.5" style={{ background: T.warnSoft, color: T.warn }}>
          <NotebookPen className="w-3 h-3 mt-0.5 shrink-0" />
          <span><b className="font-semibold">Ev tapşırığı:</b> {l.homework}</span>
        </div>
      )}
      {viewer && (
        <div className="flex items-center gap-1.5 pt-0.5">
          {att ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: att.bg, color: att.fg }}>
              <att.Icon className="w-3 h-3" /> {att.label}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: T.inkFaint }}>Qeyd yoxdur</span>
          )}
          {typeof l.grade === 'number' && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-lg text-xs font-bold text-white" style={{ background: color }} data-testid="grade">
              {l.grade}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
}

// ------------------------------------------------------------
// Sürətli dərs əlavəsi
// ------------------------------------------------------------
function QuickAdd({
  date, color, onClose, onCreated,
}: { date: string; color: string; onClose: () => void; onCreated: (id: number, info: string) => void }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState('');
  const [st, setSt] = useState('09:00');
  const [en, setEn] = useState('09:45');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.list('groups', { per_page: 200 }).then((r) => {
      setGroups(r.data || []);
      if (r.data?.[0]) setGroupId(String(r.data[0].id));
    }).catch(() => {});
  }, []);

  const submit = () => {
    if (!groupId) { toast.error('Qrup seçin'); return; }
    setBusy(true);
    api
      .create('lessons', { group_id: Number(groupId), date: date + 'T00:00:00Z', start_time: st, end_time: en, topic, status: 'scheduled' })
      .then((res) => {
        const g = groups.find((x) => String(x.id) === groupId);
        toast.success('Dərs əlavə olundu');
        onCreated(res?.id ?? res?.data?.id, `${g?.name || ''} · ${fmtLong(date)} · ${st}`);
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əlavə olunmadı'); })
      .finally(() => setBusy(false));
  };

  const cls = 'w-full px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none';
  const st_ = { borderColor: T.line, color: T.ink };
  return (
    <Modal
      open
      title={'Dərs əlavə et · ' + fmtLong(date)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Ləğv et</Button>
          <Button color={color} onClick={submit} disabled={busy}>{busy ? 'Yaradılır…' : 'Əlavə et'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: T.inkSoft }}>
          Qrup
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={cls} style={st_}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: T.inkSoft }}>
            Başlama
            <input type="time" value={st} onChange={(e) => setSt(e.target.value)} className={cls} style={st_} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: T.inkSoft }}>
            Bitmə
            <input type="time" value={en} onChange={(e) => setEn(e.target.value)} className={cls} style={st_} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: T.inkSoft }}>
          Mövzu (istəyə bağlı)
          <input value={topic} onChange={(e) => setTopic(e.target.value)} className={cls} style={st_} />
        </label>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Aylıq davamiyyət cədvəli
// ------------------------------------------------------------
interface Cell { status: string; grade: number | null }

function MonthTable({
  color, version, onOpen,
}: { color: string; version: number; onOpen: (id: number, info: string) => void }) {
  const now = new Date();
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState('');
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [lessons, setLessons] = useState<any[]>([]);
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.list('groups', { per_page: 200 }).then((r) => {
      setGroups(r.data || []);
      if (r.data?.[0]) setGroupId((g) => g || String(r.data[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!groupId) return;
    let off = false;
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const first = `${y}-${pad(m)}-01`;
    const last = ymd(new Date(y, m, 0));
    (async () => {
      try {
        const ls = await api.list('lessons', { group_id: groupId, date_from: first, date_to: last + 'T23:59:59Z', per_page: 100, sort: 'date', order: 'asc' });
        const list = (ls.data || []).slice().sort((a: any, b: any) =>
          (dayKey(a.date) + (a.start_time || '')).localeCompare(dayKey(b.date) + (b.start_time || '')));
        const boards = await Promise.all(list.map((l: any) => api.raw('/attendance-board?lesson_id=' + l.id).catch(() => ({ data: [] }))));
        if (off) return;
        const stu = new Map<number, string>();
        const c: Record<string, Cell> = {};
        boards.forEach((b: any, i: number) => {
          (b.data || []).forEach((r: any) => {
            stu.set(r.student_id, r.name);
            if (r.status) c[list[i].id + ':' + r.student_id] = { status: r.status, grade: r.grade ?? null };
          });
        });
        setLessons(list);
        setStudents(Array.from(stu, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
        setCells(c);
      } catch (e: any) {
        if (!off) { setLessons([]); setStudents([]); setCells({}); }
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => { off = true; };
  }, [groupId, month, version]);

  const groupName = groups.find((g) => String(g.id) === groupId)?.name || '';
  const inputCls = 'px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none';
  const sty = { borderColor: T.line, color: T.ink };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls + ' min-w-[200px]'} style={sty} aria-label="Qrup">
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls} style={sty} aria-label="Ay" />
        <div className="flex items-center gap-3 ml-auto text-xs" style={{ color: T.inkSoft }}>
          {ATT_STATUSES.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1"><s.Icon className="w-3.5 h-3.5" style={{ color: s.fg }} />{s.label}</span>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner color={color} />
      ) : lessons.length === 0 || students.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ ...card, color: T.inkSoft }}>
          {groupName ? `${groupName} üçün bu ayda dərs və ya şagird yoxdur.` : 'Qrup seçin.'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={card} data-testid="month-table">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr style={{ background: T.bg }}>
                <th className="sticky left-0 z-10 text-left px-3 py-2 text-xs font-semibold min-w-[160px]" style={{ background: T.bg, color: T.inkSoft }}>Şagird</th>
                {lessons.map((l) => {
                  const [, mm, dd] = dayKey(l.date).split('-');
                  return (
                    <th key={l.id} className="px-1 py-1.5 font-semibold text-xs">
                      <button
                        title="Dərs jurnalını aç"
                        onClick={() => onOpen(l.id, `${groupName} · ${fmtLong(l.date)} · ${l.start_time || ''}`)}
                        className="px-1.5 py-1 rounded-lg hover:bg-white tabular-nums"
                        style={{ color: T.ink }}
                      >
                        {dd}.{mm}
                        <div className="font-normal" style={{ color: T.inkFaint }}>{l.start_time}</div>
                      </button>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-xs font-semibold" style={{ color: T.inkSoft }}>Dav.</th>
                <th className="px-3 py-2 text-xs font-semibold" style={{ color: T.inkSoft }}>Orta</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                let marked = 0, att = 0, gs = 0, gn = 0;
                const tds = lessons.map((l) => {
                  const c = cells[l.id + ':' + s.id];
                  if (c) {
                    marked++;
                    if (c.status === 'present' || c.status === 'late') att++;
                    if (c.grade) { gs += c.grade; gn++; }
                  }
                  const m = attMeta(c?.status);
                  return (
                    <td key={l.id} className="px-1 py-1.5 text-center">
                      {m ? (
                        <div className="inline-flex flex-col items-center leading-none gap-0.5" title={m.label}>
                          <m.Icon className="w-3.5 h-3.5" style={{ color: m.fg }} />
                          <span className="text-[11px] font-bold h-3" style={{ color: T.ink }}>{c.grade ?? ''}</span>
                        </div>
                      ) : (
                        <Minus className="w-3 h-3 inline" style={{ color: T.line }} />
                      )}
                    </td>
                  );
                });
                return (
                  <tr key={s.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                    <td className="sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap" style={{ background: T.surface, color: T.ink }}>{s.name}</td>
                    {tds}
                    <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums" style={{ color: T.ink }}>
                      {marked ? Math.round((att / marked) * 100) + '%' : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums" style={{ color: T.ink }}>
                      {gn ? (gs / gn).toFixed(1) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ScheduleGrid(props: Props) {
  if (getUser()?.role === 'teacher') return <TeacherLessons {...props} />;
  return <ScheduleGridBase {...props} />;
}
