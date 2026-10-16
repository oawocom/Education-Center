'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, Copy, ChevronUp, ChevronDown, Pencil, Search, Clock, Layers,
  Archive, Image as ImageIcon, Music, Check, FileQuestion,
} from 'lucide-react';
import { T } from '../theme';
import { api, can, MediaItem, mediaUrl } from '../utils/api';
import { MathText } from '../utils/math';
import { ScreenMeta } from '../screens';
import { Modal, Button, Spinner, ErrorState } from './ui';
import QuestionAnswerEditor from './QuestionAnswerEditor';
import MathEditor from './MathEditor';
import MediaPicker from './MediaPicker';
import { QTYPES, typeLabel, cardStyle, inputStyle, Label, Toggle } from './examKit';

// ============================================================
// ExamBuilder — müəllim/admin üçün "İmtahanlar" ekranı:
// siyahı → imtahan parametrləri + sual redaktoru (bütün sual növləri,
// çoxlu şəkil/audio, LaTeX, kopyalama, sıralama, sürətli əlavə).
// ============================================================

interface Props { meta: ScreenMeta; color: string }

interface Exam {
  id?: number;
  title: string;
  kind: string;
  group_id: number | null;
  subject_id: number | null;
  level_id: number | null;
  exam_date: string | null;
  duration_min: number;
  total_points: number;
  pass_percent: number;
  status: string;
  shuffle_questions: boolean;
  instructions: string;
  is_archived?: boolean;
}

interface Question {
  id?: number;
  exam_id: number;
  type: string;
  text: string;
  media: MediaItem[] | null;
  media_url: string;
  options: any;
  correct_answer: any;
  points: number;
  explanation: string;
  sort_order: number;
  skill_id: number | null;
}

interface Opt { id: number; name?: string; title?: string }

const KINDS = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'midterm', label: 'Aralıq' },
  { value: 'final', label: 'Final' },
  { value: 'placement', label: 'Level imtahanı' },
];

const emptyExam = (): Exam => ({
  title: '', kind: 'quiz', group_id: null, subject_id: null, level_id: null, exam_date: null,
  duration_min: 0, total_points: 0, pass_percent: 50, status: 'draft', shuffle_questions: false, instructions: '',
});

const dateOnly = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : '');

// ------------------------------------------------------------
// Giriş nöqtəsi: siyahı ↔ qurucu
// ------------------------------------------------------------
export default function ExamBuilderScreen({ meta, color }: Props) {
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  if (openId !== null) {
    return <ExamEditor examId={openId} color={color} onBack={() => setOpenId(null)} onCreated={(id) => setOpenId(id)} />;
  }
  return <ExamList meta={meta} color={color} onOpen={setOpenId} />;
}

// ------------------------------------------------------------
// Siyahı
// ------------------------------------------------------------
function ExamList({ meta, color, onOpen }: Props & { onOpen: (id: number | 'new') => void }) {
  const [rows, setRows] = useState<(Exam & { id: number })[]>([]);
  const [groups, setGroups] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [toDelete, setToDelete] = useState<(Exam & { id: number }) | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.list<Exam & { id: number }>('exams', { per_page: 200, sort: 'id', order: 'desc' }),
      api.list<Opt>('groups', { per_page: 200 }).catch(() => ({ data: [] as Opt[] })),
    ])
      .then(([ex, gr]) => {
        setRows(ex.data || []);
        const m: Record<number, string> = {};
        (gr.data || []).forEach((g: Opt) => { m[g.id] = g.name || g.title || '#' + g.id; });
        setGroups(m);
        setError('');
      })
      .catch((e) => setError(e?.message || 'Yüklənmə xətası'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const shown = rows.filter(
    (r) => (!status || r.status === status) && (!q || r.title.toLowerCase().includes(q.toLowerCase())),
  );

  const archive = async (e: Exam & { id: number }) => {
    try { await api.archive('exams', e.id); toast.success('Arxivləndi'); load(); } catch (err: any) { toast.error(err?.message || 'Xəta'); }
  };
  const remove = async () => {
    if (!toDelete) return;
    try { await api.remove('exams', toDelete.id); toast.success('Silindi'); setToDelete(null); load(); }
    catch (err: any) { toast.error(err?.message || 'Silinmədi'); }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: T.ink }}>{meta.h1}</h1>
          {meta.sub && <p className="mt-1 text-sm" style={{ color: T.inkSoft }}>{meta.sub}</p>}
        </div>
        {can('exams', 'create') && (
          <button
            onClick={() => onOpen('new')}
            data-testid="new-exam"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: color }}
          >
            <Plus className="w-4 h-4" /> Yeni imtahan
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.inkFaint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İmtahan axtar..." style={{ ...inputStyle, paddingLeft: 36 }} />
        </div>
        <div className="flex gap-1.5">
          {[['', 'Hamısı'], ['published', 'Dərc olunmuş'], ['draft', 'Layihə']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium"
              style={status === v
                ? { background: T.ink, color: T.surface }
                : { background: T.surface, color: T.inkSoft, border: `1px solid ${T.line}` }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorState text={error} /> : loading ? <Spinner color={color} /> : shown.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center" style={cardStyle}>
          <FileQuestion className="w-9 h-9 mb-3" style={{ color: T.inkFaint }} />
          <p className="text-sm" style={{ color: T.inkSoft }}>Hələ imtahan yoxdur</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((e) => (
            <div key={e.id} className="p-5 flex flex-col gap-3" style={cardStyle}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => onOpen(e.id)} className="text-left font-semibold text-[15px] leading-snug hover:underline" style={{ color: T.ink }}>
                  {e.title}
                </button>
                <StatusPill status={e.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: T.inkSoft }}>
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{e.duration_min > 0 ? `${e.duration_min} dəq` : 'limitsiz'}</span>
                <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{e.total_points} bal</span>
                {e.group_id && <span>{groups[e.group_id] || 'Qrup #' + e.group_id}</span>}
                <span>{KINDS.find((k) => k.value === e.kind)?.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => onOpen(e.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
                  style={{ background: T.accentSoft, color: T.accent }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Aç
                </button>
                <div className="flex-1" />
                {can('exams', 'update') && (
                  <button title="Arxivə at" onClick={() => archive(e)} style={{ color: T.inkFaint }}><Archive className="w-4 h-4" /></button>
                )}
                {can('exams', 'delete') && (
                  <button title="Sil" onClick={() => setToDelete(e)} style={{ color: T.inkFaint }}><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!toDelete}
        title="İmtahanı sil"
        onClose={() => setToDelete(null)}
        footer={<><Button variant="ghost" onClick={() => setToDelete(null)}>Ləğv et</Button><Button variant="danger" onClick={remove}>Sil</Button></>}
      >
        <p className="text-sm" style={{ color: T.inkSoft }}>"{toDelete?.title}" imtahanı və onun nəticələri silinəcək. Davam edilsin?</p>
      </Modal>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const pub = status === 'published';
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded-lg text-xs font-semibold"
      style={{ background: pub ? T.okSoft : T.warnSoft, color: pub ? T.ok : T.warn }}
    >
      {pub ? 'Dərc olunub' : 'Layihə'}
    </span>
  );
}

// ------------------------------------------------------------
// İmtahan redaktoru: parametrlər + suallar
// ------------------------------------------------------------
function ExamEditor({ examId, color, onBack, onCreated }: {
  examId: number | 'new'; color: string; onBack: () => void; onCreated: (id: number) => void;
}) {
  const isNew = examId === 'new';
  const [exam, setExam] = useState<Exam>(emptyExam());
  const [saved, setSaved] = useState<string>(JSON.stringify(emptyExam()));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [levels, setLevels] = useState<Opt[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [toDelete, setToDelete] = useState<Question | null>(null);
  const [error, setError] = useState('');
  const idRef = useRef<number | null>(isNew ? null : (examId as number));

  const canQ = (a: string) => can('questions', a);

  useEffect(() => {
    api.list<Opt>('groups', { per_page: 200 }).then((r) => setGroups(r.data || [])).catch(() => {});
    api.list<Opt>('subjects', { per_page: 200 }).then((r) => setSubjects(r.data || [])).catch(() => {});
    api.list<Opt>('levels', { per_page: 200 }).then((r) => setLevels(r.data || [])).catch(() => {});
  }, []);

  const loadQuestions = useCallback(async (id: number) => {
    const r = await api.list<Question>('questions', { exam_id: id, per_page: 500, sort: 'sort_order', order: 'asc' });
    const list = (r.data || []).slice().sort((a, b) => a.sort_order - b.sort_order || (a.id || 0) - (b.id || 0));
    setQuestions(list);
    return list;
  }, []);

  useEffect(() => {
    if (isNew) return;
    Promise.all([api.get<Exam>('exams', examId as number), loadQuestions(examId as number)])
      .then(([e]) => {
        const ex = { ...emptyExam(), ...e, exam_date: dateOnly(e.exam_date) || null };
        setExam(ex);
        setSaved(JSON.stringify(ex));
      })
      .catch((e) => setError(e?.message || 'Yüklənmədi'))
      .finally(() => setLoading(false));
  }, [examId, isNew, loadQuestions]);

  const sum = useMemo(() => questions.reduce((a, q) => a + (Number(q.points) || 0), 0), [questions]);

  // total_points avtomatik cəm
  const syncTotal = useCallback(async (list: Question[]) => {
    const id = idRef.current;
    if (!id) return;
    const total = list.reduce((a, q) => a + (Number(q.points) || 0), 0);
    setExam((cur) => {
      if (cur.total_points === total) return cur;
      api.update('exams', id, { total_points: total }).catch(() => {});
      const next = { ...cur, total_points: total };
      setSaved((s) => { try { return JSON.stringify({ ...JSON.parse(s), total_points: total }); } catch { return s; } });
      return next;
    });
  }, []);

  const dirty = JSON.stringify(exam) !== saved;
  const set = <K extends keyof Exam>(k: K, v: Exam[K]) => setExam((e) => ({ ...e, [k]: v }));

  const save = async () => {
    if (!exam.title.trim()) { toast.error('Başlıq yazın'); return; }
    setSaving(true);
    const payload = {
      ...exam,
      title: exam.title.trim(),
      duration_min: Math.max(0, Number(exam.duration_min) || 0),
      pass_percent: Math.min(100, Math.max(0, Number(exam.pass_percent) || 0)),
      total_points: isNew ? 0 : sum,
      exam_date: exam.exam_date || null,
    };
    delete (payload as any).id;
    try {
      if (isNew) {
        const created = await api.create<Exam & { id: number }>('exams', payload);
        toast.success('İmtahan yaradıldı — indi sual əlavə edin');
        idRef.current = created.id;
        onCreated(created.id);
      } else {
        await api.update('exams', examId as number, payload);
        setSaved(JSON.stringify({ ...exam, total_points: sum }));
        toast.success('Yadda saxlanıldı');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Saxlanılmadı');
    } finally {
      setSaving(false);
    }
  };

  // ---------- suallar ----------
  const newQuestion = (like?: Partial<Question>): Question => ({
    exam_id: idRef.current as number,
    type: like?.type || 'mcq',
    text: '',
    media: [],
    media_url: '',
    options: (like?.type || 'mcq') === 'mcq' || like?.type === 'multi' ? ['', '', '', ''] : null,
    correct_answer: null,
    points: like?.points ?? 1,
    explanation: '',
    sort_order: questions.length,
    skill_id: null,
  });

  const afterChange = async () => {
    const list = await loadQuestions(idRef.current as number);
    syncTotal(list);
    return list;
  };

  const duplicate = async (q: Question) => {
    try {
      const { id, ...rest } = q as any;
      delete rest.created_at; delete rest.updated_at;
      await api.create('questions', { ...rest, sort_order: questions.length });
      await afterChange();
      toast.success('Kopyalandı');
    } catch (e: any) { toast.error(e?.message || 'Xəta'); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const list = questions.slice();
    [list[i], list[j]] = [list[j], list[i]];
    setQuestions(list.map((q, idx) => ({ ...q, sort_order: idx })));
    try {
      await Promise.all(
        list.map((q, idx) => (q.sort_order !== idx ? api.update('questions', q.id as number, { sort_order: idx }) : null)),
      );
      await loadQuestions(idRef.current as number);
    } catch (e: any) { toast.error(e?.message || 'Sıralanmadı'); }
  };

  const removeQ = async () => {
    if (!toDelete) return;
    try {
      await api.remove('questions', toDelete.id as number);
      setToDelete(null);
      const list = await afterChange();
      // sıranı düzəlt
      await Promise.all(list.map((q, idx) => (q.sort_order !== idx ? api.update('questions', q.id as number, { sort_order: idx }) : null)));
      await loadQuestions(idRef.current as number);
    } catch (e: any) { toast.error(e?.message || 'Silinmədi'); }
  };

  if (loading) return <Spinner color={color} />;
  if (error) return <ErrorState text={error} />;

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: T.inkSoft }}>
        <ArrowLeft className="w-4 h-4" /> İmtahanlar
      </button>

      {/* Parametrlər */}
      <section className="p-6 mb-8" style={cardStyle}>
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <h2 className="text-lg font-bold" style={{ color: T.ink }}>{isNew ? 'Yeni imtahan' : 'İmtahan parametrləri'}</h2>
          <div className="flex items-center gap-3">
            {!isNew && (
              <span className="text-sm" style={{ color: T.inkSoft }} data-testid="total-points">
                Ümumi bal: <b style={{ color: T.ink }}>{sum}</b>
              </span>
            )}
            <button
              onClick={save}
              disabled={saving || (!isNew && !dirty)}
              data-testid="save-exam"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: color }}
            >
              <Check className="w-4 h-4" />{saving ? 'Saxlanılır...' : isNew ? 'Yarat' : 'Yadda saxla'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <div className="sm:col-span-2">
            <Label>Başlıq</Label>
            <input data-testid="exam-title" value={exam.title} onChange={(e) => set('title', e.target.value)} placeholder="Məs. Riyaziyyat — Aralıq imtahanı" style={inputStyle} />
          </div>
          <div>
            <Label>Qrup</Label>
            <select data-testid="exam-group" value={exam.group_id ?? ''} onChange={(e) => set('group_id', e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
              <option value="">— Seçilməyib —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.title}</option>)}
            </select>
          </div>
          <div>
            <Label>Növ</Label>
            <select value={exam.kind} onChange={(e) => set('kind', e.target.value)} style={inputStyle}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <Label hint="0 = limitsiz">Müddət (dəqiqə)</Label>
            <input data-testid="exam-duration" type="number" min={0} value={exam.duration_min} onChange={(e) => set('duration_min', Number(e.target.value))} style={inputStyle} />
            <p className="text-xs mt-1" style={{ color: T.inkFaint }}>Vaxt limiti serverdə tətbiq olunur.</p>
          </div>
          <div>
            <Label hint="keçid üçün minimum">Keçid faizi (%)</Label>
            <input type="number" min={0} max={100} value={exam.pass_percent} onChange={(e) => set('pass_percent', Number(e.target.value))} style={inputStyle} />
          </div>
          <div>
            <Label>İmtahan tarixi</Label>
            <input type="date" value={exam.exam_date || ''} onChange={(e) => set('exam_date', e.target.value || null)} style={inputStyle} />
          </div>
          <div>
            <Label>Status</Label>
            <div className="flex gap-2" data-testid="exam-status">
              {[['draft', 'Layihə'], ['published', 'Dərc olunub']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('status', v)}
                  data-status={v}
                  className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
                  style={exam.status === v
                    ? { background: v === 'published' ? T.okSoft : T.warnSoft, color: v === 'published' ? T.ok : T.warn, border: `1px solid ${v === 'published' ? T.ok : T.warn}` }
                    : { background: T.surface, color: T.inkSoft, border: `1px solid ${T.line}` }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Fənn</Label>
            <select value={exam.subject_id ?? ''} onChange={(e) => set('subject_id', e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
              <option value="">—</option>
              {subjects.map((g) => <option key={g.id} value={g.id}>{g.name || g.title}</option>)}
            </select>
          </div>
          <div>
            <Label>Səviyyə</Label>
            <select value={exam.level_id ?? ''} onChange={(e) => set('level_id', e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
              <option value="">—</option>
              {levels.map((g) => <option key={g.id} value={g.id}>{g.name || g.title}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Toggle checked={exam.shuffle_questions} onChange={(v) => set('shuffle_questions', v)} label="Sualları qarışdır (hər şagird üçün sabit sıra)" />
          </div>
          <div className="sm:col-span-2">
            <Label>Təlimat</Label>
            <textarea rows={2} value={exam.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Şagirdə göstəriləcək qısa qeyd" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
      </section>

      {/* Suallar */}
      {isNew ? (
        <p className="text-sm text-center py-6" style={{ color: T.inkFaint }}>Əvvəlcə imtahanı yaradın, sonra sual əlavə edə bilərsiniz.</p>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: T.ink }}>
              Suallar <span className="text-sm font-normal ml-1" style={{ color: T.inkFaint }}>{questions.length}</span>
            </h2>
            {canQ('create') && (
              <button
                onClick={() => setEditing(newQuestion())}
                data-testid="add-question"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: color }}
              >
                <Plus className="w-4 h-4" /> Sual əlavə et
              </button>
            )}
          </div>

          {questions.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center" style={cardStyle}>
              <FileQuestion className="w-9 h-9 mb-3" style={{ color: T.inkFaint }} />
              <p className="text-sm" style={{ color: T.inkSoft }}>Hələ sual yoxdur</p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {questions.map((q, i) => {
                const med = (q.media || []) as MediaItem[];
                return (
                  <li key={q.id} data-testid="question-row" className="p-4 flex gap-4 items-start" style={cardStyle}>
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: T.accentSoft, color: T.accent }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-relaxed break-words" style={{ color: T.ink }}>
                        <MathText text={q.text || '(mətn yoxdur)'} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: T.inkSoft }}>
                        <span className="px-2 py-0.5 rounded-lg" style={{ background: T.lineSoft }}>{typeLabel(q.type)}</span>
                        <span>{q.points} bal</span>
                        {med.filter((m) => m.type === 'image').length > 0 && (
                          <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{med.filter((m) => m.type === 'image').length}</span>
                        )}
                        {med.filter((m) => m.type === 'audio').length > 0 && (
                          <span className="inline-flex items-center gap-1"><Music className="w-3.5 h-3.5" />{med.filter((m) => m.type === 'audio').length}</span>
                        )}
                      </div>
                      {med.some((m) => m.type === 'image') && (
                        <div className="flex gap-1.5 mt-2">
                          {med.filter((m) => m.type === 'image').slice(0, 4).map((m) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={m.token} src={mediaUrl(m.token)} alt="" className="w-12 h-12 rounded-lg object-cover" style={{ background: T.lineSoft }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" style={{ color: T.inkFaint }}>
                      {canQ('update') && (
                        <>
                          <IconBtn title="Yuxarı" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Aşağı" onClick={() => move(i, 1)} disabled={i === questions.length - 1}><ChevronDown className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Redaktə" onClick={() => setEditing(q)} testid="edit-question"><Pencil className="w-4 h-4" /></IconBtn>
                        </>
                      )}
                      {canQ('create') && <IconBtn title="Kopyala" onClick={() => duplicate(q)} testid="dup-question"><Copy className="w-4 h-4" /></IconBtn>}
                      {canQ('delete') && <IconBtn title="Sil" onClick={() => setToDelete(q)}><Trash2 className="w-4 h-4" /></IconBtn>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {editing && (
        <QuestionModal
          key={(editing.id ?? 'new') + ':' + (editing as any)._k}
          initial={editing}
          color={color}
          onClose={() => setEditing(null)}
          onSaved={async (next) => {
            await afterChange();
            if (next) setEditing({ ...newQuestion(next), sort_order: questions.length + 1, _k: Date.now() } as any);
            else setEditing(null);
          }}
          countAfter={questions.length}
        />
      )}

      <Modal
        open={!!toDelete}
        title="Sualı sil"
        onClose={() => setToDelete(null)}
        footer={<><Button variant="ghost" onClick={() => setToDelete(null)}>Ləğv et</Button><Button variant="danger" onClick={removeQ}>Sil</Button></>}
      >
        <p className="text-sm" style={{ color: T.inkSoft }}>Bu sual silinəcək. Davam edilsin?</p>
      </Modal>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, testid }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; testid?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-[#F0EEE8]"
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------
// Sual redaktoru (modal)
// ------------------------------------------------------------
function QuestionModal({ initial, color, onClose, onSaved, countAfter }: {
  initial: Question; color: string; onClose: () => void;
  onSaved: (next?: { type: string; points: number }) => Promise<void>; countAfter: number;
}) {
  const [q, setQ] = useState<Question>(() => ({ ...initial, media: (initial.media || []) as MediaItem[] }));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Question>(k: K, v: Question[K]) => setQ((c) => ({ ...c, [k]: v }));

  const changeType = (t: string) => {
    setQ((c) => ({
      ...c,
      type: t,
      options: t === 'mcq' || t === 'multi' ? (Array.isArray(c.options) && typeof c.options[0] === 'string' ? c.options : ['', '', '', '']) : t === 'match' ? [{ left: '', right: '' }, { left: '', right: '' }] : null,
      correct_answer: t === 'multi' ? [] : t === 'numeric' ? { value: '', tolerance: 0 } : t === 'gap' ? '' : null,
    }));
  };

  // yoxla + hazır payload qaytar
  const build = (): any | null => {
    const t = q.type;
    const media = (q.media || []) as MediaItem[];
    if (!q.text.trim() && media.length === 0) { toast.error('Sual mətni yazın'); return null; }
    let options = q.options;
    let ca = q.correct_answer;
    if (t === 'mcq' || t === 'multi') {
      const o: string[] = (Array.isArray(options) ? options : []).filter((x: string) => x.trim() !== '');
      if (o.length < 2) { toast.error('Ən azı 2 variant yazın'); return null; }
      options = o;
      if (t === 'mcq') {
        if (typeof ca !== 'string' || !o.includes(ca)) { toast.error('Düzgün variantı seçin'); return null; }
      } else {
        ca = (Array.isArray(ca) ? ca : []).filter((x: string) => o.includes(x));
        if (ca.length === 0) { toast.error('Ən azı bir düzgün variant seçin'); return null; }
      }
    } else if (t === 'truefalse') {
      options = null;
      if (ca !== 'Doğru' && ca !== 'Yanlış') { toast.error('Düzgün cavabı seçin'); return null; }
    } else if (t === 'numeric') {
      options = null;
      const v = Number(String(ca?.value).replace(',', '.'));
      const tol = Number(String(ca?.tolerance === '' || ca?.tolerance == null ? 0 : ca.tolerance).replace(',', '.'));
      if (ca?.value === '' || ca?.value == null || Number.isNaN(v)) { toast.error('Düzgün ədədi daxil edin'); return null; }
      ca = { value: v, tolerance: Number.isNaN(tol) ? 0 : Math.abs(tol) };
    } else if (t === 'gap') {
      options = null;
      const list = (Array.isArray(ca) ? ca : [ca]).map((x: any) => String(x || '').trim()).filter(Boolean);
      if (list.length === 0) { toast.error('Gözlənilən cavabı yazın'); return null; }
      ca = list.length === 1 ? list[0] : list;
    } else if (t === 'match') {
      const pairs = (Array.isArray(options) ? options : []).filter((p: any) => p.left?.trim() && p.right?.trim());
      if (pairs.length < 2) { toast.error('Ən azı 2 cüt yazın'); return null; }
      options = pairs;
      ca = pairs.map((p: any) => p.left + '::' + p.right);
    } else {
      options = null;
      ca = null;
    }
    const { id, ...rest } = q as any;
    delete rest._k; delete rest.created_at; delete rest.updated_at;
    return { ...rest, text: q.text.trim(), media, options, correct_answer: ca, points: Number(q.points) || 0 };
  };

  const save = async (andNext: boolean) => {
    if (saving) return;
    const payload = build();
    if (!payload) return;
    setSaving(true);
    try {
      if (q.id) await api.update('questions', q.id, payload);
      else await api.create('questions', { ...payload, sort_order: countAfter });
      toast.success(q.id ? 'Yadda saxlanıldı' : 'Sual əlavə olundu');
      await onSaved(andNext ? { type: q.type, points: Number(q.points) || 1 } : undefined);
    } catch (e: any) {
      toast.error(e?.message || 'Saxlanılmadı');
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(!q.id); }
  };

  const footerBtn = 'px-3.5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5';

  return (
    <Modal
      open
      wide
      title={q.id ? 'Sualı redaktə et' : 'Yeni sual'}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs hidden sm:block" style={{ color: T.inkFaint }}>Ctrl + Enter — saxla və növbətisi</span>
          <Button variant="ghost" onClick={onClose}>Ləğv et</Button>
          <button type="button" data-testid="save-question" disabled={saving} onClick={() => save(false)} className={footerBtn} style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.ink }}>
            Saxla
          </button>
          <button type="button" data-testid="save-next" disabled={saving} onClick={() => save(true)} className={footerBtn + ' text-white'} style={{ background: color }}>
            <Plus className="w-4 h-4" /> Saxla və yeni sual
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5" onKeyDown={onKey}>
        <div>
          <Label>Sual növü</Label>
          <div className="flex flex-wrap gap-1.5" data-testid="type-chips">
            {QTYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                title={t.hint}
                data-type={t.value}
                onClick={() => changeType(t.value)}
                className="px-3 py-1.5 rounded-xl text-sm font-medium"
                style={q.type === t.value
                  ? { background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}` }
                  : { background: T.surface, color: T.inkSoft, border: `1px solid ${T.line}` }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label hint="LaTeX üçün $...$ istifadə edin">Sual mətni</Label>
          <MathEditor textareaId="q-text" autoFocus value={q.text} onChange={(v) => set('text', v)} rows={3} placeholder="Sualı yazın..." />
        </div>

        <div>
          <Label hint="istəyə bağlı, bir neçə fayl">Şəkil və audio</Label>
          <MediaPicker value={(q.media || []) as MediaItem[]} onChange={(v) => set('media', v)} />
        </div>

        <QuestionAnswerEditor
          type={q.type}
          options={q.options}
          correctAnswer={q.correct_answer}
          onOptionsChange={(v) => set('options', v)}
          onCorrectAnswerChange={(v) => set('correct_answer', v)}
          color={color}
        />

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <Label>Bal</Label>
            <input data-testid="q-points" type="number" min={0} step="0.5" value={q.points} onChange={(e) => set('points', e.target.value as any)} style={inputStyle} />
          </div>
          <div className="sm:col-span-3">
            <Label hint="nəticədən sonra şagirdə görünür">İzah</Label>
            <input value={q.explanation || ''} onChange={(e) => set('explanation', e.target.value)} placeholder="Qısa izah (istəyə bağlı)" style={inputStyle} />
          </div>
        </div>

        {q.media_url && (
          <p className="text-xs" style={{ color: T.inkFaint }}>Köhnə media linki: {q.media_url}</p>
        )}
      </div>
    </Modal>
  );
}
