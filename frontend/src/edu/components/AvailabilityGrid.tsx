'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, can, getUser } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote, TableShell, TH_CLASS, TR_CLASS } from './screen';

// ============================================================
// AvailabilityGrid — "Boş saatlarım"
//
// Dizayndakı kimi: xanaları klik edərək boş saatları işarələmək.
// Klik → yaradır, təkrar klik → silir.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

const DAYS = [
  { n: 1, label: 'B.e' },
  { n: 2, label: 'Ç.a' },
  { n: 3, label: 'Ç' },
  { n: 4, label: 'C.a' },
  { n: 5, label: 'C' },
  { n: 6, label: 'Ş' },
];

const HOURS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

interface Slot {
  id: number;
  teacher_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
}

const nextHour = (t: string) => {
  const h = parseInt(t.slice(0, 2), 10);
  return String(h + 1).padStart(2, '0') + ':00';
};

export default function AvailabilityGrid({ meta, color }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const user = getUser();
  const teacherID = user?.teacher_id;
  const editable = can('teacher-availability', 'create');

  const load = useCallback(() => {
    api
      .list('teacher-availability', { per_page: 500 })
      .then((res) => setSlots((res.data || []) as Slot[]))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const find = (day: number, time: string) =>
    slots.find((s) => Number(s.weekday) === day && s.start_time === time);

  const toggle = (day: number, time: string) => {
    if (!editable) return;

    const key = day + time;
    if (busy) return;
    setBusy(key);

    const existing = find(day, time);

    if (existing) {
      api.remove('teacher-availability', existing.id)
        .then(() => { setSlots((s) => s.filter((x) => x.id !== existing.id)); })
        .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Silinmədi'); })
        .finally(() => setBusy(''));
      return;
    }

    if (!teacherID) {
      toast.error('Hesabınız müəllim profilinə bağlı deyil');
      setBusy('');
      return;
    }

    api.create('teacher-availability', {
      teacher_id: teacherID,
      weekday: day,
      start_time: time,
      end_time: nextHour(time),
    })
      .then((created: any) => { setSlots((s) => [...s, created]); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əlavə olunmadı'); })
      .finally(() => setBusy(''));
  };

  const freeCount = slots.length;
  const activeDays = new Set(slots.map((s) => Number(s.weekday))).size;

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      <div className="flex flex-wrap gap-4">
        {[
          { emoji: '⏰', value: freeCount, label: 'Boş saat / həftə' },
          { emoji: '📆', value: activeDays, label: 'Aktiv günlər' },
        ].map((s) => (
          <div key={s.label} className="flex-1 min-w-[160px] bg-white rounded-2xl border border-[#E8E5DE] p-5 flex flex-col gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: color + '14' }}>
              {s.emoji}
            </div>
            <span className="text-2xl font-extrabold" style={{ color }}>{s.value}</span>
            <span className="text-sm text-[#5B6577]">{s.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
        </div>
      ) : (
        <TableShell>
          <thead className="bg-[#FAF9F6]">
            <tr>
              <th className={TH_CLASS}>Saat</th>
              {DAYS.map((d) => (
                <th key={d.n} className={TH_CLASS + ' text-center'}>{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((t) => (
              <tr key={t} className={TR_CLASS}>
                <td className="px-4 py-2 text-[#1C2434] font-semibold whitespace-nowrap">{t}</td>
                {DAYS.map((d) => {
                  const on = !!find(d.n, t);
                  const key = d.n + t;
                  return (
                    <td key={d.n} className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggle(d.n, t)}
                        disabled={!editable || busy === key}
                        className={
                          'w-full h-9 rounded-lg text-xs font-semibold transition ' +
                          (editable ? 'cursor-pointer' : 'cursor-default') +
                          (busy === key ? ' opacity-50' : '')
                        }
                        style={
                          on
                            ? { background: color, color: '#fff' }
                            : { background: '#FAF9F6', color: '#CBD5E1', border: '1px dashed #E8E5DE' }
                        }
                      >
                        {on ? 'Boş' : '+'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {!editable && (
        <p className="text-xs text-[#9AA3B2]">Bu qrafiki yalnız müəllim özü dəyişə bilər.</p>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}
