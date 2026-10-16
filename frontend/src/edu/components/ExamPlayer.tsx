'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Clock, Check, AlertTriangle, CloudOff, Loader2, Send, CircleCheck, Hourglass,
} from 'lucide-react';
import { T } from '../theme';
import { api, MediaItem, mediaUrl } from '../utils/api';
import { MathText } from '../utils/math';
import { Button, Spinner, ErrorState, Modal } from './ui';
import { cardStyle, inputStyle, fmtClock } from './examKit';

// ============================================================
// ExamPlayer — şagirdin imtahan ekranı.
//
// Axın: POST /exams/:id/start → (server vaxtı: remaining_seconds) →
// cavab dəyişəndə debounce + hər ~10 san avtomatik saxlama
// (POST /exams/:id/save; cavabda remaining_seconds ilə taymer sinxronlanır)
// → vaxt bitəndə və ya "Bitir" ilə POST /exams/:id/submit.
// Vaxt limiti SERVERDƏ tətbiq olunur; burada yalnız göstərilir.
// ============================================================

interface Question {
  id: number;
  type: string;
  text: string;
  media_url: string;
  media: MediaItem[] | null;
  options: any;
  points: number;
  sort_order: number;
}

interface Exam {
  id: number;
  title: string;
  kind: string;
  duration_min: number;
  instructions: string;
  pass_percent?: number;
}

interface Props {
  examId: number;
  color: string;
  onFinish: () => void;
}

type Result = {
  graded: boolean;
  percentage?: number;
  late?: boolean;
  timedOut?: boolean;
  already?: boolean;
  status?: string;
};

function legacyKind(url: string): 'audio' | 'image' | null {
  const u = url.toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/.test(u)) return 'audio';
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(u)) return 'image';
  return null;
}

const AUTOSAVE_MS = 10000;
const DEBOUNCE_MS = 1500;

export default function ExamPlayer({ examId, color, onFinish }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [index, setIndex] = useState(0);
  const [limited, setLimited] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // refs (taymer/avtosaxlama closure-larından kənarda)
  const answersRef = useRef<Record<number, any>>({});
  const dirty = useRef<Set<number>>(new Set());
  const endAt = useRef<number | null>(null);
  const savingRef = useRef(false);
  const submittedRef = useRef(false);
  const warned = useRef<{ five: boolean; one: boolean }>({ five: false, one: false });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncRemaining = (sec: any) => {
    if (typeof sec === 'number' && sec >= 0) endAt.current = Date.now() + sec * 1000;
  };

  // ---------- start ----------
  useEffect(() => {
    api
      .raw(`/exams/${examId}/start`, { method: 'POST' })
      .then((res: any) => {
        if (res.already_submitted) {
          const s = res.submission || {};
          setResult({
            graded: s.status === 'graded',
            percentage: s.percentage,
            timedOut: !!res.timed_out,
            already: true,
            status: s.status,
          });
          setLoading(false);
          return;
        }
        setExam(res.exam);
        const qs: Question[] = res.questions || [];
        setQuestions(qs);
        const saved: Record<number, any> = {};
        Object.keys(res.saved_answers || {}).forEach((k) => { saved[Number(k)] = res.saved_answers[k]; });
        answersRef.current = saved;
        setAnswers(saved);
        setLimited(!!res.limited);
        if (res.limited && typeof res.remaining_seconds === 'number') {
          syncRemaining(res.remaining_seconds);
          setLeft(Math.max(0, Math.ceil(res.remaining_seconds)));
        }
        setLoading(false);
      })
      .catch((e) => { setError(e?.message || 'Yüklənmədi'); setLoading(false); });
  }, [examId]);

  // ---------- cavab ----------
  const setAnswer = (qid: number, value: any) => {
    answersRef.current = { ...answersRef.current, [qid]: value };
    dirty.current.add(qid);
    setAnswers(answersRef.current);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { save(); }, DEBOUNCE_MS);
  };

  const payload = (ids?: number[]) =>
    (ids || Object.keys(answersRef.current).map(Number)).map((qid) => ({ question_id: qid, value: answersRef.current[qid] }));

  // ---------- submit ----------
  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (debounce.current) clearTimeout(debounce.current);
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const res = await api.raw(`/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: payload() }),
      });
      setResult({ graded: !!res.graded, percentage: res.percentage, late: !!res.late, timedOut: auto || !!res.late });
    } catch (e: any) {
      submittedRef.current = false;
      if (e?.status === 403 || e?.status === 401) return;
      toast.error(e?.message || 'Göndərilmədi — yenidən cəhd edin');
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // ---------- avtosaxlama ----------
  const save = useCallback(async () => {
    if (savingRef.current || submittedRef.current) return;
    const ids = Array.from(dirty.current);
    if (ids.length === 0 && !limited) return;
    savingRef.current = true;
    dirty.current = new Set();
    if (ids.length) setSaveState('saving');
    try {
      const res = await api.raw(`/exams/${examId}/save`, {
        method: 'POST',
        body: JSON.stringify({ answers: payload(ids) }),
      });
      syncRemaining(res?.remaining_seconds);
      { setSaveState('saved'); setSavedAt(new Date()); }
    } catch (e: any) {
      ids.forEach((i) => dirty.current.add(i));
      if (e?.status === 410 || e?.body?.timed_out) {
        endAt.current = Date.now();
      } else if (e?.status === 400 || e?.status === 404) {
        // iş artıq aktiv deyil — nəticəni göstər
        if (!submittedRef.current) submit(true);
      } else {
        setSaveState('error');
      }
    } finally {
      savingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, limited, submit]);

  useEffect(() => {
    if (loading || result) return;
    const t = setInterval(save, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [loading, result, save]);

  // ---------- taymer ----------
  useEffect(() => {
    if (!limited || loading || result) return;
    const tick = () => {
      if (endAt.current === null) return;
      const s = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 60 && !warned.current.one) {
        warned.current.one = true; warned.current.five = true;
        toast.error('Son 1 dəqiqə qalıb!', { duration: 6000 });
      } else if (s <= 300 && !warned.current.five) {
        warned.current.five = true;
        toast.warning('Son 5 dəqiqə qalıb', { duration: 5000 });
      }
      if (s <= 0 && !submittedRef.current) {
        toast.error('Vaxt bitdi — iş avtomatik göndərilir');
        submit(true);
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [limited, loading, result, submit]);

  // brauzeri bağlamazdan əvvəl xəbərdarlıq
  useEffect(() => {
    if (loading || result) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [loading, result]);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  if (loading) return <Spinner color={color} />;
  if (error) return <ErrorState text={error} />;

  if (result) return <ResultView result={result} exam={exam} color={color} onFinish={onFinish} />;

  if (!exam || questions.length === 0) {
    return (
      <div className="p-8 text-center" style={cardStyle}>
        <p className="text-sm" style={{ color: T.inkSoft }}>Bu imtahanda sual yoxdur.</p>
        <Button onClick={onFinish} color={color} className="mt-4">Geri</Button>
      </div>
    );
  }

  const q = questions[index];
  const isAnswered = (id: number) => {
    const v = answers[id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== '';
  };
  const answeredCount = questions.filter((x) => isAnswered(x.id)).length;
  const unanswered = questions.length - answeredCount;
  const urgent = left !== null && left <= 60;
  const warn = left !== null && left <= 300;
  const med = (q.media || []) as MediaItem[];
  const legacy = q.media_url ? legacyKind(q.media_url) : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Sticky üst zolaq */}
      <div
        className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3"
        style={{ background: T.bg }}
      >
        <div className="px-5 py-3 flex items-center gap-4 flex-wrap" style={cardStyle}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate" style={{ color: T.ink }}>{exam.title}</p>
            <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: T.inkSoft }}>
              <span>Sual {index + 1} / {questions.length}</span>
              <span>·</span>
              <span>{answeredCount} cavablandırılıb</span>
              <span className="inline-flex items-center gap-1" data-testid="save-state" style={{ color: saveState === 'error' ? T.bad : T.inkFaint }}>
                {saveState === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> saxlanılır</>}
                {saveState === 'saved' && <><Check className="w-3.5 h-3.5" /> saxlanıldı{savedAt ? ' ' + savedAt.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</>}
                {saveState === 'error' && <><CloudOff className="w-3.5 h-3.5" /> saxlanmadı, təkrar cəhd olunur</>}
              </span>
            </p>
          </div>
          {limited && left !== null && (
            <div
              data-testid="timer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-semibold tabular-nums"
              style={{
                background: urgent ? T.badSoft : warn ? T.warnSoft : T.bg,
                color: urgent ? T.bad : warn ? T.warn : T.ink,
                border: `1px solid ${urgent ? T.bad : warn ? T.warn : T.line}`,
              }}
            >
              <Clock className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              {fmtClock(left)}
            </div>
          )}
          <button
            type="button"
            data-testid="finish-btn"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: color }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Bitir
          </button>
        </div>
        <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: T.lineSoft }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%`, background: color }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 items-start">
        {/* Sual */}
        <div>
          <div className="p-6 sm:p-8 flex flex-col gap-6" style={cardStyle} data-testid="question-card">
            {exam.instructions && index === 0 && (
              <p className="text-sm rounded-xl px-4 py-3" style={{ background: T.accentSoft, color: T.accent }}>{exam.instructions}</p>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="text-[19px] leading-relaxed font-medium break-words" style={{ color: T.ink }}>
                <MathText text={q.text} />
              </div>
              <span className="shrink-0 text-xs px-2 py-1 rounded-lg" style={{ background: T.lineSoft, color: T.inkSoft }}>{q.points} bal</span>
            </div>

            {(med.length > 0 || legacy) && (
              <div className="flex flex-col gap-3">
                {med.map((m) =>
                  m.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={m.token} src={mediaUrl(m.token)} alt={m.name || ''} className="rounded-xl max-h-96 object-contain mx-auto" style={{ border: `1px solid ${T.line}` }} />
                  ) : (
                    <audio key={m.token} controls src={mediaUrl(m.token)} className="w-full" />
                  ),
                )}
                {legacy === 'audio' && <audio controls src={q.media_url} className="w-full" />}
                {legacy === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.media_url} alt="" className="rounded-xl max-h-96 object-contain mx-auto" />
                )}
              </div>
            )}

            <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} color={color} />
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ChevronLeft className="w-4 h-4" /> Əvvəlki
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} color={color}>
                Növbəti <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={submitting} color={color}>
                Bitir və göndər
              </Button>
            )}
          </div>
        </div>

        {/* Naviqator */}
        <aside className="p-4 lg:sticky lg:top-28" style={cardStyle}>
          <p className="text-xs font-semibold mb-3" style={{ color: T.inkSoft }}>Suallar</p>
          <div className="grid grid-cols-6 lg:grid-cols-4 gap-2" data-testid="navigator">
            {questions.map((x, i) => {
              const done = isAnswered(x.id);
              const cur = i === index;
              return (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Sual ${i + 1}`}
                  data-done={done}
                  className="aspect-square rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: done ? color : T.surface,
                    color: done ? '#fff' : T.inkSoft,
                    border: `1px solid ${cur ? T.ink : done ? color : T.line}`,
                    boxShadow: cur ? `0 0 0 2px ${T.bg}, 0 0 0 3px ${T.ink}` : undefined,
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-1.5 text-xs" style={{ color: T.inkSoft }}>
            <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: color }} /> Cavablandırılıb</span>
            <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ border: `1px solid ${T.line}` }} /> Cavabsız</span>
          </div>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        title="İmtahanı bitirmək istəyirsiniz?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Davam et</Button>
            <button
              type="button"
              data-testid="confirm-submit"
              onClick={() => submit(false)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5"
              style={{ background: color }}
            >
              <Send className="w-4 h-4" /> Göndər
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm" style={{ color: T.inkSoft }}>
          <p>{questions.length} sualdan <b style={{ color: T.ink }}>{answeredCount}</b> cavablandırılıb.</p>
          {unanswered > 0 && (
            <p className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: T.warnSoft, color: T.warn }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {unanswered} sual cavabsız qalıb. Göndərdikdən sonra dəyişiklik etmək mümkün olmayacaq.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------
// Nəticə / artıq verilib / vaxt bitib
// ------------------------------------------------------------
function ResultView({ result, exam, color, onFinish }: { result: Result; exam: Exam | null; color: string; onFinish: () => void }) {
  const pct = Math.round(result.percentage || 0);
  const pass = exam?.pass_percent ? pct >= exam.pass_percent : null;
  let title = 'İmtahan göndərildi';
  let note = 'Cavablarınız qeydə alındı. Açıq suallar müəllim tərəfindən yoxlanandan sonra nəticə tam görünəcək.';
  if (result.already && !result.timedOut) { title = 'Bu imtahanı artıq vermisiniz'; note = result.graded ? 'Nəticəniz aşağıdadır.' : 'İşiniz yoxlanılır.'; }
  if (result.timedOut) { title = 'Vaxt bitdi'; note = 'Vaxt bitdiyi üçün iş avtomatik göndərildi. Vaxtında saxlanılmış cavablarınız yoxlanıldı.'; }
  else if (result.graded && !result.already) note = 'İmtahan yoxlanıldı. Ətraflı nəticəni "Nəticələrim" bölməsindən görə bilərsiniz.';

  return (
    <div className="max-w-md mx-auto mt-10 p-10 text-center flex flex-col items-center gap-4" style={cardStyle} data-testid="result-view">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: result.timedOut ? T.warnSoft : result.graded ? T.okSoft : T.accentSoft, color: result.timedOut ? T.warn : result.graded ? T.ok : T.accent }}>
        {result.timedOut ? <Hourglass className="w-6 h-6" /> : result.graded ? <CircleCheck className="w-6 h-6" /> : <Check className="w-6 h-6" />}
      </div>
      <h2 className="text-lg font-bold" style={{ color: T.ink }}>{title}</h2>
      {result.graded && (
        <>
          <p className="text-5xl font-bold tabular-nums" style={{ color }} data-testid="result-pct">{pct}%</p>
          {pass !== null && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: pass ? T.okSoft : T.badSoft, color: pass ? T.ok : T.bad }}>
              {pass ? 'Keçdi' : 'Keçmədi'}
            </span>
          )}
        </>
      )}
      <p className="text-sm" style={{ color: T.inkSoft }}>{note}</p>
      <Button onClick={onFinish} color={color}>Siyahıya qayıt</Button>
    </div>
  );
}

// ------------------------------------------------------------
// Cavab girişi
// ------------------------------------------------------------
function OptionCard({ selected, color, onClick, letter, children, type }: {
  selected: boolean; color: string; onClick: () => void; letter?: string; children: React.ReactNode; type: 'radio' | 'checkbox';
}) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={selected}
      onClick={onClick}
      data-selected={selected}
      className="w-full text-left flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-colors"
      style={{
        border: `1.5px solid ${selected ? color : T.line}`,
        background: selected ? color + '12' : T.surface,
        color: T.ink,
      }}
    >
      <span
        className="shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold"
        style={{
          borderRadius: type === 'radio' ? 999 : 8,
          background: selected ? color : T.lineSoft,
          color: selected ? '#fff' : T.inkSoft,
        }}
      >
        {selected && !letter ? <Check className="w-4 h-4" /> : letter}
      </span>
      <span className="text-base leading-snug"><MathText text={String(children)} /></span>
    </button>
  );
}

function QuestionInput({ q, value, onChange, color }: { q: Question; value: any; onChange: (v: any) => void; color: string }) {
  const opts: string[] = Array.isArray(q.options) ? q.options.filter((x: any) => typeof x === 'string') : [];
  const L = (i: number) => String.fromCharCode(65 + (i % 26));

  if (q.type === 'mcq' || q.type === 'truefalse') {
    const list = q.type === 'truefalse' ? ['Doğru', 'Yanlış'] : opts;
    return (
      <div className="flex flex-col gap-2.5" role="radiogroup">
        {list.map((o, i) => (
          <OptionCard key={o + i} type="radio" selected={value === o} color={color} onClick={() => onChange(o)} letter={L(i)}>{o}</OptionCard>
        ))}
      </div>
    );
  }

  if (q.type === 'multi') {
    const list: string[] = Array.isArray(value) ? value : [];
    const toggle = (o: string) => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o]);
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-xs" style={{ color: T.inkFaint }}>Bir neçə cavab seçə bilərsiniz</p>
        {opts.map((o, i) => (
          <OptionCard key={o + i} type="checkbox" selected={list.includes(o)} color={color} onClick={() => toggle(o)} letter={L(i)}>{o}</OptionCard>
        ))}
      </div>
    );
  }

  if (q.type === 'numeric') {
    return (
      <div>
        <input
          data-testid="numeric-input"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.replace(',', '.'))}
          placeholder="Ədədi cavab, məs. 0.25"
          style={{ ...inputStyle, fontSize: 18, padding: '12px 16px', maxWidth: 320 }}
        />
      </div>
    );
  }

  if (q.type === 'gap') {
    return (
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cavabınızı yazın..."
        style={{ ...inputStyle, fontSize: 17, padding: '12px 16px' }}
      />
    );
  }

  if (q.type === 'open') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="Cavabınızı ətraflı yazın..."
        style={{ ...inputStyle, fontSize: 16, padding: '12px 16px', resize: 'vertical', lineHeight: 1.6 }}
      />
    );
  }

  if (q.type === 'match') {
    const pairs: { left: string; right: string }[] = Array.isArray(q.options) ? q.options : [];
    const rightPool = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const list: string[] = Array.isArray(value) ? value : [];
    const chosenFor = (left: string) => {
      const hit = list.find((s) => s.startsWith(left + '::'));
      return hit ? hit.slice(left.length + 2) : '';
    };
    const setChoice = (left: string, right: string) => {
      const rest = list.filter((s) => !s.startsWith(left + '::'));
      onChange(right ? [...rest, left + '::' + right] : rest);
    };
    return (
      <div className="flex flex-col gap-3">
        {pairs.map((p) => (
          <div key={p.left} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <span className="flex-1 min-w-[40%] text-base font-medium" style={{ color: T.ink }}><MathText text={p.left} /></span>
            <select
              value={chosenFor(p.left)}
              onChange={(e) => setChoice(p.left, e.target.value)}
              style={{ ...inputStyle, flex: 1, padding: '10px 12px' }}
            >
              <option value="">— Seçin —</option>
              {rightPool.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
