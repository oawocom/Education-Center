'use client';

import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Role } from '../nav';
import { ScreenMeta } from '../screens';
import { ScreenHeader, StatCards, InsightRow, PrincipleNote } from './screen';

// ============================================================
// Dashboard — rolun giriş ekranı
// Dizayndakı kimi: başlıq → stat kartları → icmal sətirləri → qeyd
// ============================================================

interface Props {
  role: Role;
  meta: ScreenMeta;
  color: string;
  userName: string;
}

interface Insight {
  title: string;
  subtitle?: string;
  badge?: string;
}

const WD = ['', 'B.e', 'Ç.a', 'Çərşənbə', 'C.a', 'Cümə', 'Şənbə', 'Bazar'];

export default function Dashboard({ role, meta, color, userName }: Props) {
  const [lessons, setLessons] = useState<Insight[]>([]);
  const [notices, setNotices] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    const groupsP = api.list('groups', { per_page: 200 }).catch(() => ({ data: [] as any[] }));
    const roomsP = api.list('rooms', { per_page: 200 }).catch(() => ({ data: [] as any[] }));

    // Bugünkü dərslər
    const lessonsP = api
      .list('lessons', { per_page: 20, date_from: today, date_to: today })
      .catch(() => ({ data: [] as any[] }));

    Promise.all([lessonsP, groupsP, roomsP])
      .then(([ls, gs, rs]) => {
        const gmap: Record<number, string> = {};
        (gs.data || []).forEach((g: any) => { gmap[g.id] = g.name; });
        const rmap: Record<number, string> = {};
        (rs.data || []).forEach((r: any) => { rmap[r.id] = r.name; });

        setLessons(
          (ls.data || []).map((l: any) => ({
            title: gmap[l.group_id] || `Qrup #${l.group_id}`,
            subtitle: [l.start_time, l.room_id ? `Otaq ${rmap[l.room_id] || l.room_id}` : null, l.topic]
              .filter(Boolean)
              .join(' · '),
            badge: 'Bugün',
          }))
        );
      })
      .finally(() => setLoading(false));

    // Son elanlar
    api
      .list('announcements', { per_page: 3, status: 'published' })
      .then((res) => {
        setNotices(
          (res.data || []).map((a: any) => ({
            title: a.title,
            subtitle: a.body ? String(a.body).slice(0, 90) : undefined,
            badge: 'Elan',
          }))
        );
      })
      .catch(() => setNotices([]));
  }, [role]);

  const h1 = meta.h1.indexOf('Salam') === 0 ? `Salam, ${userName} 👋` : meta.h1;

  return (
    <>
      <ScreenHeader h1={h1} sub={meta.sub} />

      {meta.stats && meta.stats.length > 0 && <StatCards stats={meta.stats} color={color} />}

      <div className="flex flex-col gap-3">
        {loading && (
          <div className="bg-white rounded-2xl border border-[#E8E5DE] p-4 text-sm text-[#9AA3B2]">
            Yüklənir...
          </div>
        )}

        {!loading && lessons.length === 0 && notices.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E8E5DE] p-4">
            <span className="block font-semibold text-[#1C2434]">Bugün üçün planlaşdırılmış dərs yoxdur</span>
            <span className="block text-sm text-[#5B6577] mt-0.5">
              Dərslər əlavə olunduqca burada görünəcək.
            </span>
          </div>
        )}

        {lessons.map((l, i) => (
          <InsightRow key={'l' + i} title={l.title} subtitle={l.subtitle} badge={l.badge} color={color} />
        ))}

        {notices.map((n, i) => (
          <InsightRow key={'n' + i} title={n.title} subtitle={n.subtitle} badge={n.badge} color={color} />
        ))}
      </div>

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}
