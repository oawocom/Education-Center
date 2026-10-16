'use client';

import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote, TableShell, TH_CLASS, TD_CLASS, TR_CLASS } from './screen';

// ============================================================
// ReportsScreen — "Hesabatlar"
// Müəllim performansı: orta imtahan balı, davamiyyət, yük.
//
// BranchStatsScreen — "Filiallar"
// Filial üzrə şagird / müəllim / qrup / otaq sayı.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

const pctColor = (p: number) => (p >= 80 ? '#16A34A' : p >= 60 ? '#D97706' : '#DC2626');

function Loader({ color }: { color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      <div className="flex-1 h-2 rounded-full bg-[#F0EEE8] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: v + '%', background: pctColor(v) }} />
      </div>
      <span className="text-sm font-semibold shrink-0" style={{ color: pctColor(v) }}>
        {Math.round(v)}%
      </span>
    </div>
  );
}

// ---------- Hesabatlar ----------

interface TeacherStat {
  teacher_id: number;
  name: string;
  groups: number;
  students: number;
  avg_score: number;
  submissions: number;
  attendance: number;
}

export function ReportsScreen({ meta, color }: Props) {
  const [rows, setRows] = useState<TeacherStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .raw('/stats/teacher-performance')
      .then((res) => setRows(res.data || []))
      .catch((e) => setError(e?.message || 'Hesabat yüklənmədi'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      {loading ? (
        <Loader color={color} />
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-6 text-center">
          <p className="text-sm text-[#5B6577]">Hələ hesabat üçün məlumat yoxdur.</p>
        </div>
      ) : (
        <TableShell>
          <thead className="bg-[#FAF9F6]">
            <tr>
              <th className={TH_CLASS}>Müəllim</th>
              <th className={TH_CLASS}>Qrup</th>
              <th className={TH_CLASS}>Şagird</th>
              <th className={TH_CLASS}>Orta imtahan balı</th>
              <th className={TH_CLASS}>Davamiyyət</th>
              <th className={TH_CLASS}>İş sayı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teacher_id} className={TR_CLASS}>
                <td className={TD_CLASS + ' font-medium'}>{r.name}</td>
                <td className={TD_CLASS}>{r.groups}</td>
                <td className={TD_CLASS}>{r.students}</td>
                <td className="px-4 py-3">
                  {r.submissions === 0 ? (
                    <span className="text-[#CBD5E1] text-sm">Ölçülməyib</span>
                  ) : (
                    <Bar value={r.avg_score} />
                  )}
                </td>
                <td className="px-4 py-3"><Bar value={r.attendance} /></td>
                <td className={TD_CLASS}>{r.submissions}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}
    </>
  );
}

// ---------- Filial statistikası ----------

interface BranchStat {
  branch_id: number;
  name: string;
  students: number;
  teachers: number;
  groups: number;
  rooms: number;
}

export function BranchStatsScreen({ meta, color }: Props) {
  const [rows, setRows] = useState<BranchStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .raw('/stats/branches')
      .then((res) => setRows(res.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const total = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      teachers: a.teachers + r.teachers,
      groups: a.groups + r.groups,
    }),
    { students: 0, teachers: 0, groups: 0 }
  );

  if (loading) return <Loader color={color} />;
  if (rows.length === 0) return null;

  return (
    <>
      <TableShell>
        <thead className="bg-[#FAF9F6]">
          <tr>
            <th className={TH_CLASS}>Filial</th>
            <th className={TH_CLASS}>Şagird</th>
            <th className={TH_CLASS}>Müəllim</th>
            <th className={TH_CLASS}>Qrup</th>
            <th className={TH_CLASS}>Otaq</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.branch_id} className={TR_CLASS}>
              <td className={TD_CLASS + ' font-medium'}>{r.name}</td>
              <td className={TD_CLASS}>{r.students}</td>
              <td className={TD_CLASS}>{r.teachers}</td>
              <td className={TD_CLASS}>{r.groups}</td>
              <td className={TD_CLASS}>{r.rooms}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className={TR_CLASS + ' bg-[#FAF9F6] font-semibold'}>
              <td className={TD_CLASS}>Cəmi</td>
              <td className={TD_CLASS}>{total.students}</td>
              <td className={TD_CLASS}>{total.teachers}</td>
              <td className={TD_CLASS}>{total.groups}</td>
              <td className={TD_CLASS} />
            </tr>
          )}
        </tbody>
      </TableShell>
    </>
  );
}
