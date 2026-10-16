'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, FileText, X, Loader2, CheckCheck, BookOpen, NotebookPen, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import { T } from '../theme';

// ============================================================
// LessonJournal — "Dərs jurnalı": mövzu, ev tapşırığı və şagird
// cədvəli (status + qiymət 1–10 + qeyd). Dəyişiklik edən kimi
// avtomatik saxlanılır (debounce). Həm ScheduleGrid, həm də
// AttendanceBoard eyni komponentdən istifadə edir.
// ============================================================

export const ATT_STATUSES = [
  { value: 'present', label: 'İştirak', short: 'İ', key: 'i', fg: T.ok, bg: T.okSoft, Icon: Check },
  { value: 'late', label: 'Gecikmə', short: 'G', key: 'g', fg: T.warn, bg: T.warnSoft, Icon: Clock },
  { value: 'excused', label: 'Üzrlü', short: 'Ü', key: 'u', fg: T.accent, bg: T.accentSoft, Icon: FileText },
  { value: 'absent', label: 'Qayıb', short: 'Q', key: 'q', fg: T.bad, bg: T.badSoft, Icon: X },
] as const;

export const attMeta = (v?: string | null) => ATT_STATUSES.find((s) => s.value === v);

interface Row {
  student_id: number;
  name: string;
  status: string;
  late_min: number;
  grade: number | null;
  note: string;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function LessonJournal({
  lessonId,
  color,
  editable,
  onSaved,
}: {
  lessonId: number;
  color: string;
  editable: boolean;
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [topic, setTopic] = useState('');
  const [homework, setHomework] = useState('');
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SaveState>('idle');
  const [err, setErr] = useState('');

  const rowsRef = useRef<Row[]>([]);
  const topicRef = useRef('');
  const hwRef = useRef('');
  const timer = useRef<any>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const dirty = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const doSave = useCallback(async () => {
    if (inflight.current) { again.current = true; return; }
    inflight.current = true;
    dirty.current = false;
    setState('saving');
    try {
      const entries = rowsRef.current
        .filter((r) => r.status)
        .map((r) => ({
          student_id: r.student_id,
          status: r.status,
          late_min: r.status === 'late' ? r.late_min || 0 : 0,
          grade: r.grade,
          note: r.note || '',
        }));
      await api.raw('/attendance-board', {
        method: 'POST',
        body: JSON.stringify({ lesson_id: lessonId, topic: topicRef.current, homework: hwRef.current, entries }),
      });
      setErr('');
      setState(dirty.current ? 'dirty' : 'saved');
      onSavedRef.current?.();
    } catch (e: any) {
      setErr(e?.message || 'Yadda saxlanmadı');
      setState('error');
    } finally {
      inflight.current = false;
      if (again.current) { again.current = false; doSave(); }
    }
  }, [lessonId]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; doSave(); }, 600);
  }, [doSave]);

  // Yükləmə
  useEffect(() => {
    let off = false;
    setLoading(true);
    api
      .raw('/attendance-board?lesson_id=' + lessonId)
      .then((res) => {
        if (off) return;
        const rs: Row[] = (res.data || []).map((r: any) => ({
          student_id: r.student_id, name: r.name, status: r.status || '',
          late_min: r.late_min || 0, grade: r.grade ?? null, note: r.note || '',
        }));
        rowsRef.current = rs; setRows(rs);
        topicRef.current = res.lesson?.topic || ''; setTopic(topicRef.current);
        hwRef.current = res.lesson?.homework || ''; setHomework(hwRef.current);
        setLesson(res.lesson);
        setState('idle');
      })
      .catch((e) => { if (!off) setErr(e?.message || 'Yüklənmədi'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => {
      off = true;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; doSave(); }
    };
  }, [lessonId, doSave]);

  const mutate = (fn: (rs: Row[]) => Row[]) => {
    const next = fn(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
    schedule();
  };
  const patch = (sid: number, p: Partial<Row>) =>
    mutate((rs) => rs.map((r) => (r.student_id === sid ? { ...r, ...p } : r)));

  const setStatus = (r: Row, status: string) => patch(r.student_id, { status: r.status === status ? '' : status });
  // Qiymət yazılıbsa, server kimi dərhal "iştirak" (gecikmə qalır)
  const setGrade = (r: Row, g: number | null) => {
    const p: Partial<Row> = { grade: r.grade === g ? null : g };
    if (p.grade != null && r.status !== 'present' && r.status !== 'late') p.status = 'present';
    patch(r.student_id, p);
  };
  const markAll = () => mutate((rs) => rs.map((r) => ({ ...r, status: 'present', late_min: 0 })));

  const onKey = (e: React.KeyboardEvent, r: Row) => {
    if (!editable) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      setGrade(r, k === '0' ? 10 : Number(k));
      return;
    }
    const s = ATT_STATUSES.find((x) => x.key === k);
    if (s) { e.preventDefault(); setStatus(r, s.value); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color }} /></div>;
  }
  if (!lesson) return <p className="text-sm py-6 text-center" style={{ color: T.bad }}>{err || 'Dərs tapılmadı'}</p>;

  const counts = ATT_STATUSES.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.value).length }));
  const inputCls = 'w-full px-3 py-2 rounded-xl border text-sm focus:outline-none disabled:opacity-70';

  return (
    <div className="flex flex-col gap-4">
      {/* Mövzu / ev tapşırığı */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: T.inkSoft }}>
            <BookOpen className="w-3.5 h-3.5" /> Mövzu
          </span>
          <input
            value={topic}
            disabled={!editable}
            onChange={(e) => { topicRef.current = e.target.value; setTopic(e.target.value); schedule(); }}
            placeholder="Bu gün nə keçildi?"
            className={inputCls}
            style={{ borderColor: T.line, color: T.ink, background: T.surface }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: T.warn }}>
            <NotebookPen className="w-3.5 h-3.5" /> Ev tapşırığı
          </span>
          <input
            value={homework}
            disabled={!editable}
            onChange={(e) => { hwRef.current = e.target.value; setHomework(e.target.value); schedule(); }}
            placeholder="Nə hazırlanmalıdır?"
            className={inputCls}
            style={{ borderColor: T.line, color: T.ink, background: T.warnSoft }}
          />
        </label>
      </div>

      {/* Alətlər: say + toplu + saxlama göstəricisi */}
      <div className="flex flex-wrap items-center gap-2">
        {counts.map((s) => (
          <span key={s.value} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: s.bg, color: s.fg }}>
            <s.Icon className="w-3 h-3" /> {s.label} {s.n}
          </span>
        ))}
        <div className="flex-1" />
        {editable && (
          <button onClick={markAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium hover:bg-[#FAF9F6]"
            style={{ borderColor: T.line, color: T.ink }}>
            <CheckCheck className="w-4 h-4" style={{ color: T.ok }} /> Hamısı iştirak edir
          </button>
        )}
        {editable && <SaveBadge state={state} err={err} onRetry={doSave} />}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: T.inkFaint }}>Bu qrupda aktiv şagird yoxdur.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: T.line }}>
          {rows.map((r, i) => (
            <div
              key={r.student_id}
              tabIndex={editable ? 0 : -1}
              onKeyDown={(e) => onKey(e, r)}
              data-testid="jrow"
              className="px-3 py-3 flex flex-col gap-2.5 outline-none focus:bg-[#FAF9F6]"
              style={{ borderTop: i ? `1px solid ${T.lineSoft}` : undefined }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-semibold min-w-[130px] flex-1" style={{ color: T.ink }}>{r.name}</span>
                <div className="inline-flex rounded-xl p-0.5 gap-0.5" style={{ background: T.lineSoft }} role="group">
                  {ATT_STATUSES.map((s) => {
                    const on = r.status === s.value;
                    return (
                      <button key={s.value} disabled={!editable} onClick={() => setStatus(r, s.value)}
                        title={s.label + ' (' + s.key.toUpperCase() + ')'} aria-pressed={on}
                        data-status={s.value}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                        style={on ? { background: s.fg, color: '#fff' } : { color: T.inkSoft }}>
                        <s.Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{s.label}</span>
                        <span className="sm:hidden">{s.short}</span>
                      </button>
                    );
                  })}
                </div>
                {r.status === 'late' && (
                  <input type="number" min={0} max={240} value={r.late_min || ''} disabled={!editable}
                    onChange={(e) => patch(r.student_id, { late_min: Number(e.target.value) || 0 })}
                    placeholder="dəq" aria-label="Gecikmə dəqiqə"
                    className="w-16 px-2 py-1.5 rounded-lg border text-xs focus:outline-none"
                    style={{ borderColor: T.line, color: T.ink }} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex gap-1" role="group" aria-label="Qiymət">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => {
                    const on = r.grade === g;
                    return (
                      <button key={g} disabled={!editable} onClick={() => setGrade(r, g)} aria-pressed={on}
                        data-grade={g}
                        className="w-7 h-7 rounded-lg text-xs font-semibold border transition-colors"
                        style={on
                          ? { background: color, color: '#fff', borderColor: color }
                          : { background: T.surface, color: T.inkSoft, borderColor: T.line }}>
                        {g}
                      </button>
                    );
                  })}
                </div>
                <input value={r.note} disabled={!editable} placeholder="Qeyd"
                  onChange={(e) => patch(r.student_id, { note: e.target.value })}
                  className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg border text-xs focus:outline-none"
                  style={{ borderColor: T.line, color: T.ink }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {editable && (
        <p className="text-xs" style={{ color: T.inkFaint }}>
          Qısa yollar: sətri seçib 1–9 (0 = 10) qiymət, İ / G / Ü / Q status. Dəyişikliklər avtomatik saxlanılır.
        </p>
      )}
    </div>
  );
}

export function SaveBadge({ state, err, onRetry }: { state: SaveState; err?: string; onRetry?: () => void }) {
  if (state === 'idle') return null;
  const base = 'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg';
  if (state === 'saving' || state === 'dirty')
    return <span className={base} style={{ color: T.inkSoft }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saxlanılır…</span>;
  if (state === 'saved')
    return <span className={base} style={{ color: T.ok, background: T.okSoft }} data-testid="saved"><Check className="w-3.5 h-3.5" /> Saxlanıldı</span>;
  return (
    <button onClick={onRetry} className={base} style={{ color: T.bad, background: T.badSoft }} title={err}>
      <AlertCircle className="w-3.5 h-3.5" /> {err || 'Xəta'} · yenidən cəhd
    </button>
  );
}
