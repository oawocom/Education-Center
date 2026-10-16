'use client';

import { useEffect, useState } from 'react';
import { PlayCircle, CheckCircle2, Clock, Layers, Hourglass, FileQuestion } from 'lucide-react';
import { T } from '../theme';
import { api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote } from './screen';
import { Spinner, ErrorState, Modal, Button } from './ui';
import ExamPlayer from './ExamPlayer';
import { cardStyle } from './examKit';

// ============================================================
// ExamListScreen — şagirdin "İmtahanlarım" siyahısı.
// Vəziyyət /stats/results-dan alınır. "Başla" əvvəl təsdiq
// pəncərəsi göstərir (vaxt limiti varsa xəbərdarlıqla), çünki
// start çağırışı taymeri serverdə başladır.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface Exam {
  id: number;
  title: string;
  kind: string;
  duration_min: number;
  total_points: number;
  instructions?: string;
}

interface ResultRow {
  exam_id: number;
  percentage: number;
  status: string;
}

export default function ExamListScreen({ meta, color }: Props) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Record<number, ResultRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeExamId, setActiveExamId] = useState<number | null>(null);
  const [pending, setPending] = useState<Exam | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.list<Exam>('exams', { per_page: 200 }),
      api.raw('/stats/results').catch(() => ({ data: [] as ResultRow[] })),
    ])
      .then(([ex, res]) => {
        setExams(ex.data || []);
        const map: Record<number, ResultRow> = {};
        (res.data || []).forEach((r: ResultRow) => { map[r.exam_id] = r; });
        setResults(map);
      })
      .catch((e) => setError(e?.message || 'Yüklənmə xətası'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (activeExamId !== null) {
    return (
      <ExamPlayer
        examId={activeExamId}
        color={color}
        onFinish={() => { setActiveExamId(null); load(); }}
      />
    );
  }

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      <div className="mt-6">
        {error ? (
          <ErrorState text={error} />
        ) : loading ? (
          <Spinner color={color} />
        ) : exams.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center" style={cardStyle}>
            <FileQuestion className="w-9 h-9 mb-3" style={{ color: T.inkFaint }} />
            <p className="text-sm" style={{ color: T.inkSoft }}>Hələ imtahan yoxdur</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {exams.map((e) => {
              const r = results[e.id];
              const inProgress = !!r && r.status === 'in_progress';
              const done = !!r && !inProgress;
              const graded = done && r.status === 'graded';
              return (
                <div key={e.id} className="p-5 flex flex-col gap-3" style={cardStyle} data-testid="exam-card">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-snug" style={{ color: T.ink }}>{e.title}</p>
                    {graded && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold" style={{ background: T.okSoft, color: T.ok }}>
                        {Math.round(r.percentage)}%
                      </span>
                    )}
                    {inProgress && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold" style={{ background: T.accentSoft, color: T.accent }}>Davam edir</span>
                    )}
                    {done && !graded && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold" style={{ background: T.warnSoft, color: T.warn }}>Yoxlanılır</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: T.inkSoft }}>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {e.duration_min > 0 ? `${e.duration_min} dəqiqə` : 'Vaxt məhdudiyyəti yoxdur'}
                    </span>
                    {e.total_points > 0 && <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{e.total_points} bal</span>}
                  </div>
                  {done ? (
                    <div className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: T.ok }}>
                      <CheckCircle2 className="w-4 h-4" /> Verilib
                    </div>
                  ) : (
                    <button
                      onClick={() => setPending(e)}
                      data-testid="start-exam"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white self-start"
                      style={{ background: color }}
                    >
                      <PlayCircle className="w-4 h-4" /> {inProgress ? 'Davam et' : 'Başla'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {meta.note && <PrincipleNote note={meta.note} color={color} />}

      <Modal
        open={!!pending}
        title={pending?.title || ''}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>Ləğv et</Button>
            <button
              data-testid="confirm-start"
              onClick={() => { const id = pending!.id; setPending(null); setActiveExamId(id); }}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5"
              style={{ background: color }}
            >
              <PlayCircle className="w-4 h-4" /> İmtahana başla
            </button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3 text-sm" style={{ color: T.inkSoft }}>
            {pending.instructions && <p>{pending.instructions}</p>}
            {pending.duration_min > 0 ? (
              <p className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: T.warnSoft, color: T.warn }}>
                <Hourglass className="w-4 h-4 mt-0.5 shrink-0" />
                Vaxt limiti {pending.duration_min} dəqiqədir. Başladıqdan sonra taymer dayanmır, hətta səhifəni bağlasanız belə. Vaxt bitəndə iş avtomatik göndərilir.
              </p>
            ) : (
              <p>Bu imtahanda vaxt məhdudiyyəti yoxdur. Cavablarınız avtomatik saxlanılır.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
