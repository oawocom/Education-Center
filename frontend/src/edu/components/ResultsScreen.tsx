'use client';

import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote, TableShell, TH_CLASS, TD_CLASS, TR_CLASS, StatCards } from './screen';

// ============================================================
// ResultsScreen — "Nəticələrim" / "İmtahan nəticələri"
//
// Dizayndakı kimi: imtahan sətirləri + bacarıq sütunları
// (Dinləmə / Oxu / Yazı / Danışıq) + orta göstərici.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface ResultRow {
  submission_id: number;
  exam_id: number;
  title: string;
  submitted_at: string | null;
  percentage: number;
  total_score: number;
  status: string;
}

interface SkillCell {
  submission_id: number;
  code: string;
  name: string;
  percentage: number;
}

interface Skill {
  skill_id: number;
  name: string;
  code: string;
}

const pctColor = (p: number) => (p >= 80 ? '#16A34A' : p >= 60 ? '#D97706' : '#DC2626');

export default function ResultsScreen({ meta, color }: Props) {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [cells, setCells] = useState<SkillCell[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .raw('/stats/results')
      .then((res) => {
        setRows(res.data || []);
        setCells(res.skill_cells || []);
        setSkills(res.skills || []);
        setAverage(res.average || 0);
      })
      .catch((e) => setError(e?.message || 'Nəticələr yüklənmədi'))
      .finally(() => setLoading(false));
  }, []);

  const cellFor = (submissionID: number, code: string) => {
    const hit = cells.find((c) => c.submission_id === submissionID && c.code === code);
    if (!hit) return <span className="text-[#CBD5E1]">—</span>;
    return (
      <span className="font-semibold" style={{ color: pctColor(hit.percentage) }}>
        {Math.round(hit.percentage)}%
      </span>
    );
  };

  return (
    <>
      <ScreenHeader
        h1={meta.h1}
        sub={rows.length > 0 ? `Orta bal: ${Math.round(average)}% — ${meta.sub}` : meta.sub}
      />

      {meta.stats && meta.stats.length > 0 && <StatCards stats={meta.stats} color={color} />}

      {loading ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6 text-center">
          <p className="text-sm text-[#5B6577]">Hələ qiymətləndirilmiş imtahan yoxdur.</p>
        </div>
      ) : (
        <TableShell>
          <thead className="bg-[#FAF9F6]">
            <tr>
              <th className={TH_CLASS}>İmtahan</th>
              <th className={TH_CLASS}>Tarix</th>
              {skills.map((s) => (
                <th key={s.code} className={TH_CLASS}>{s.name}</th>
              ))}
              <th className={TH_CLASS}>Orta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.submission_id} className={TR_CLASS}>
                <td className={TD_CLASS}>{r.title}</td>
                <td className={TD_CLASS}>
                  {r.submitted_at || <span className="text-[#CBD5E1]">—</span>}
                </td>
                {skills.map((s) => (
                  <td key={s.code} className={TD_CLASS}>{cellFor(r.submission_id, s.code)}</td>
                ))}
                <td className={TD_CLASS}>
                  <span className="font-bold" style={{ color: pctColor(r.percentage) }}>
                    {Math.round(r.percentage)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}
