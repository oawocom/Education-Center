'use client';

import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote, InsightRow, TableShell, TH_CLASS, TD_CLASS, TR_CLASS } from './screen';

// ============================================================
// SkillsScreen — "Güclü / Zəif tərəflər"
//
// Dizayndakı kimi: iki icmal sətri (güclü tərəflər / inkişaf
// sahələri) + bacarıq üzrə göstərici cədvəli.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface SkillStat {
  skill_id: number;
  name: string;
  code: string;
  percentage: number;
  count: number;
}

const barColor = (p: number) => (p >= 80 ? '#16A34A' : p >= 60 ? '#D97706' : '#DC2626');

export default function SkillsScreen({ meta, color }: Props) {
  const [skills, setSkills] = useState<SkillStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .raw('/stats/skills')
      .then((res) => setSkills(res.data || []))
      .catch((e) => setError(e?.message || 'Məlumat yüklənmədi'))
      .finally(() => setLoading(false));
  }, []);

  const measured = skills.filter((s) => s.count > 0);
  const sorted = [...measured].sort((a, b) => b.percentage - a.percentage);
  const strong = sorted.slice(0, 2);
  const weak = sorted.slice(-2).reverse();

  const fmt = (list: SkillStat[]) =>
    list.map((s) => `${s.name} (${Math.round(s.percentage)}%)`).join(', ');

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      {loading ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      ) : measured.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6 text-center">
          <p className="text-sm text-[#5B6577]">
            Hələ bacarıq üzrə qiymətləndirmə yoxdur. İmtahanlar keçirildikcə profil formalaşacaq.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {strong.length > 0 && (
              <InsightRow title="Güclü tərəflər 💪" subtitle={fmt(strong)} badge="Güclü" color="#16A34A" />
            )}
            {weak.length > 0 && (
              <InsightRow title="İnkişaf sahələri 📈" subtitle={fmt(weak)} badge="Fokus" color="#D97706" />
            )}
          </div>

          <TableShell>
            <thead className="bg-[#FAF9F6]">
              <tr>
                <th className={TH_CLASS}>Bacarıq</th>
                <th className={TH_CLASS}>Göstərici</th>
                <th className={TH_CLASS}>Ölçmə sayı</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.skill_id} className={TR_CLASS}>
                  <td className={TD_CLASS}>{s.name}</td>
                  <td className="px-4 py-3 w-1/2">
                    {s.count === 0 ? (
                      <span className="text-[#CBD5E1] text-sm">Ölçülməyib</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-[#F0EEE8] overflow-hidden min-w-[80px]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: Math.min(100, Math.max(0, s.percentage)) + '%',
                              background: barColor(s.percentage),
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold shrink-0" style={{ color: barColor(s.percentage) }}>
                          {Math.round(s.percentage)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className={TD_CLASS}>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}
