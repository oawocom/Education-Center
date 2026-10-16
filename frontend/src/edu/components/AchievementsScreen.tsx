'use client';

import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote } from './screen';

// ============================================================
// AchievementsScreen — "Nailiyyətlər"
//
// Dizayndakı kimi: XP və ardıcıllıq kartları + qazanılmış (🏆)
// və kilidli (🔒) nişanların siyahısı.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface Achievement {
  id: number;
  code: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  earned_at: string | null;
  progress: number;
}

export default function AchievementsScreen({ meta, color }: Props) {
  const [items, setItems] = useState<Achievement[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .raw('/stats/achievements')
      .then((res) => {
        setItems(res.data || []);
        setXp(res.xp || 0);
      })
      .catch((e) => setError(e?.message || 'Məlumat yüklənmədi'))
      .finally(() => setLoading(false));
  }, []);

  const earned = items.filter((i) => i.earned_at);

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      {/* XP kartları */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[160px] bg-white rounded-2xl border border-[#E8E5DE] p-5 flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: color + '14' }}>
            ⭐
          </div>
          <span className="text-2xl font-extrabold" style={{ color }}>
            {xp.toLocaleString('az-AZ')}
          </span>
          <span className="text-sm text-[#5B6577]">XP</span>
        </div>

        <div className="flex-1 min-w-[160px] bg-white rounded-2xl border border-[#E8E5DE] p-5 flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: color + '14' }}>
            🏅
          </div>
          <span className="text-2xl font-extrabold" style={{ color }}>
            {earned.length} / {items.length}
          </span>
          <span className="text-sm text-[#5B6577]">Qazanılmış nişan</span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6 text-center">
          <p className="text-sm text-[#5B6577]">Hələ nailiyyət təyin olunmayıb.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a) => {
            const done = !!a.earned_at;
            return (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-[#E8E5DE] p-4 flex items-center justify-between gap-4"
                style={done ? undefined : { opacity: 0.65 }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: done ? color + '14' : '#F0EEE8' }}
                  >
                    {a.icon || '🏆'}
                  </div>
                  <div className="min-w-0">
                    <span className="block font-semibold text-[#1C2434] truncate">{a.title}</span>
                    <span className="block text-sm text-[#5B6577] mt-0.5 truncate">
                      {done ? `Qazanılıb · ${a.earned_at}` : a.description || 'Hələ qazanılmayıb'}
                      {a.xp_reward > 0 && ` · +${a.xp_reward} XP`}
                    </span>
                  </div>
                </div>

                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                  style={done ? { background: color + '14', color } : { background: '#F0EEE8', color: '#9AA3B2' }}
                >
                  {done ? 'Qazanılıb 🏆' : 'Kilidli 🔒'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}
