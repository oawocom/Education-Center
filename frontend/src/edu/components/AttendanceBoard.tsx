'use client';

import { useEffect, useState } from 'react';
import { api, can } from '../utils/api';
import { ScreenMeta } from '../screens';
import { T } from '../theme';
import { ScreenHeader, PrincipleNote } from './screen';
import { Spinner } from './ui';
import LessonJournal from './LessonJournal';

// ============================================================
// AttendanceBoard — "Davamiyyət"
//
// Dərs seçilir; mövzu, ev tapşırığı, status və qiymət eyni
// LessonJournal komponentində (ScheduleGrid-dəki "Dərs jurnalı"
// ilə eyni məntiq) avtomatik saxlanılır.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface Lesson {
  id: number;
  group_id: number;
  date: string;
  start_time: string;
}

export default function AttendanceBoard({ meta, color }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [groups, setGroups] = useState<Record<number, string>>({});
  const [lessonID, setLessonID] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const editable = can('attendance', 'create');

  useEffect(() => {
    Promise.all([
      api.list('lessons', { per_page: 100 }).catch(() => ({ data: [] as any[] })),
      api.list('groups', { per_page: 200 }).catch(() => ({ data: [] as any[] })),
    ])
      .then(([ls, gs]) => {
        const list = (ls.data || []) as Lesson[];
        setLessons(list);
        const g: Record<number, string> = {};
        (gs.data || []).forEach((x: any) => { g[x.id] = x.name; });
        setGroups(g);
        // Bu günə ən yaxın dərs
        const today = new Date().toISOString().slice(0, 10);
        const near = [...list].sort(
          (a, b) => Math.abs(+new Date(a.date) - +new Date(today)) - Math.abs(+new Date(b.date) - +new Date(today))
        )[0];
        if (near) setLessonID(String(near.id));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      <div className="rounded-xl border p-3" style={{ background: T.surface, borderColor: T.line }}>
        <select
          value={lessonID}
          onChange={(e) => setLessonID(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none"
          style={{ borderColor: T.line, color: T.ink }}
        >
          <option value="">— Dərs seçin —</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {(groups[l.group_id] || `Qrup #${l.group_id}`) +
                ' · ' + new Date(l.date).toLocaleDateString('az-AZ') +
                (l.start_time ? ' · ' + l.start_time : '')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner color={color} />
      ) : !lessonID ? (
        <div className="rounded-xl border p-6 text-center" style={{ background: T.surface, borderColor: T.line }}>
          <p className="text-sm" style={{ color: T.inkSoft }}>Davamiyyəti qeyd etmək üçün dərs seçin.</p>
        </div>
      ) : (
        <div className="rounded-xl border p-4" style={{ background: T.surface, borderColor: T.line }}>
          <LessonJournal key={lessonID} lessonId={Number(lessonID)} color={color} editable={editable} />
        </div>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </div>
  );
}
