'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Users } from 'lucide-react';
import { ScreenMeta } from '../screens';
import { api, getUser } from '../utils/api';
import { T } from '../theme';
import { ScreenHeader } from './screen';
import { Modal, Spinner } from './ui';

// Qruplar: qrup yarat -> hər sətir: fənn + müəllim + günlər + saat.
// Saxlayanda dərslər müəllimlərdə, şagirdlərdə və valideynlərdə avtomatik görünür.

interface Props { meta: ScreenMeta; color: string }
interface Opt { id: number; name: string }
interface Row { subject_id: number | ''; teacher_id: number | ''; days: number[]; start: string; end: string }

const DAYS = ['B.e', 'Ç.a', 'Çər', 'C.a', 'Cümə', 'Şən', 'Baz'];
const card = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius } as const;
const inp = 'w-full px-3 py-2 rounded-xl border text-sm bg-white';
const emptyRow = (): Row => ({ subject_id: '', teacher_id: '', days: [], start: '09:00', end: '10:00' });

export default function GroupsScreen({ meta, color }: Props) {
  const isAdmin = getUser()?.role === 'admin';
  const [groups, setGroups] = useState<any[]>([]);
  const [plans, setPlans] = useState<Record<number, any[]>>({});
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [teachers, setTeachers] = useState<Opt[]>([]);
  const [students, setStudents] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ id?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s, t, st] = await Promise.all([
        api.list('groups', { per_page: 200 }),
        api.list('subjects', { per_page: 200 }).catch(() => ({ data: [] })),
        api.list('teachers', { per_page: 200 }).catch(() => ({ data: [] })),
        isAdmin ? api.list('students', { per_page: 500 }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setGroups(g.data || []);
      setSubjects((s.data || []).map((x: any) => ({ id: x.id, name: x.name })));
      setTeachers((t.data || []).map((x: any) => ({ id: x.id, name: x.name })));
      setStudents((st.data || []).map((x: any) => ({ id: x.id, name: x.name })));
      const pm: Record<number, any[]> = {};
      await Promise.all((g.data || []).map((x: any) =>
        api.raw(`/groups/${x.id}/plan`).then((p) => { pm[x.id] = p.slots || []; }).catch(() => { pm[x.id] = []; })));
      setPlans(pm);
    } catch (e: any) {
      toast.error(e?.message || 'Yüklənmədi');
    } finally { setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  const nm = (list: Opt[], id: any) => list.find((x) => x.id === id)?.name || '';

  const summary = (gid: number) => {
    const by = new Map<string, number[]>();
    (plans[gid] || []).forEach((s: any) => {
      const k = `${nm(subjects, s.subject_id) || 'Dərs'} · ${nm(teachers, s.teacher_id) || '—'} · ${s.start_time}–${s.end_time}`;
      by.set(k, [...(by.get(k) || []), s.weekday]);
    });
    return Array.from(by, ([k, d]) => ({ k, days: d.sort().map((x) => DAYS[x - 1]).join(', ') }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <ScreenHeader h1={meta.h1 || 'Qruplar'} sub={meta.sub} />
        {isAdmin && (
          <button onClick={() => setEdit({})} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
            style={{ background: color }}><Plus className="w-4 h-4" /> Yeni qrup</button>
        )}
      </div>
      {loading ? <Spinner color={color} /> : groups.length === 0 ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ ...card, color: T.inkSoft }}>
          Hələ qrup yoxdur.{isAdmin ? ' "Yeni qrup" düyməsi ilə başlayın.' : ''}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="groups">
          {groups.map((g) => (
            <div key={g.id} className="p-4 flex flex-col gap-2" style={card}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold" style={{ color: T.ink }}>{g.name}</div>
                {isAdmin && (
                  <button onClick={() => setEdit({ id: g.id })} className="p-1.5 rounded-lg hover:bg-[#FAF9F6]" aria-label="Redaktə"
                    style={{ color: T.inkSoft }}><Pencil className="w-4 h-4" /></button>
                )}
              </div>
              {summary(g.id).length === 0 ? (
                <p className="text-sm" style={{ color: T.inkFaint }}>Dərs günləri seçilməyib</p>
              ) : summary(g.id).map((s) => (
                <div key={s.k} className="text-sm rounded-lg px-3 py-2" style={{ background: T.lineSoft, color: T.ink }}>
                  <div className="font-semibold">{s.k}</div>
                  <div style={{ color: T.inkSoft }}>{s.days}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Planner id={edit.id} color={color} subjects={subjects} teachers={teachers} students={students}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      )}
    </div>
  );
}

function Planner({ id, color, subjects, teachers, students, onClose, onSaved }: {
  id?: number; color: string; subjects: Opt[]; teachers: Opt[]; students: Opt[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [picked, setPicked] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(16);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState<string[] | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get('groups', id).then((g: any) => setName((g.data || g).name || '')).catch(() => {});
    api.raw(`/groups/${id}/plan`).then((p) => {
      const m = new Map<string, Row>();
      (p.slots || []).forEach((s: any) => {
        const k = `${s.subject_id}|${s.teacher_id}|${s.start_time}|${s.end_time}`;
        const r = m.get(k) || { subject_id: s.subject_id || '', teacher_id: s.teacher_id || '', days: [], start: s.start_time, end: s.end_time };
        r.days.push(s.weekday); m.set(k, r);
      });
      setRows(m.size ? Array.from(m.values()) : [emptyRow()]);
      setPicked(p.student_ids || []);
    }).catch(() => {});
  }, [id]);

  const shown = useMemo(() => students.filter((s) => s.name.toLocaleLowerCase('az').includes(q.toLocaleLowerCase('az'))), [students, q]);
  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggleDay = (i: number, d: number) => upd(i, { days: rows[i].days.includes(d) ? rows[i].days.filter((x) => x !== d) : [...rows[i].days, d] });

  const save = async (force = false) => {
    if (!name.trim()) return toast.error('Qrupun adını yazın');
    const slots: any[] = [];
    for (const r of rows) {
      if (!r.days.length && !r.subject_id && !r.teacher_id) continue;
      if (!r.subject_id || !r.teacher_id || !r.days.length) return toast.error('Hər sətirdə fənn, müəllim və ən azı bir gün seçin');
      if (r.start >= r.end) return toast.error('Bitmə saatı başlanğıcdan sonra olmalıdır');
      r.days.forEach((d) => slots.push({ subject_id: r.subject_id, teacher_id: r.teacher_id, weekday: d, start_time: r.start, end_time: r.end }));
    }
    setBusy(true);
    try {
      let gid = id;
      if (!gid) {
        const g: any = await api.create('groups', { name: name.trim() });
        gid = (g.data || g).id;
      } else {
        await api.update('groups', gid, { name: name.trim() });
      }
      const res = await api.raw(`/groups/${gid}/plan`, { method: 'POST', body: JSON.stringify({ slots, student_ids: picked, weeks, force }) });
      toast.success(`Qrup saxlandı · ${res.lessons_created} dərs avtomatik yarandı`);
      onSaved();
    } catch (e: any) {
      if (e?.status === 409 && e.body?.conflicts) setConf(e.body.conflicts);
      else toast.error(e?.message || 'Saxlanmadı');
    } finally { setBusy(false); }
  };

  return (
    <Modal open title={id ? 'Qrupu redaktə et' : 'Yeni qrup'} onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: T.ink }}>Qrupun adı</label>
          <input className={inp} style={{ borderColor: T.line }} value={name} onChange={(e) => setName(e.target.value)} placeholder="məs. 7-A Riyaziyyat" data-testid="g-name" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold" style={{ color: T.ink }}>Fənlər, müəllimlər və günlər</div>
          {rows.map((r, i) => (
            <div key={i} className="p-3 rounded-xl border flex flex-col gap-3" style={{ borderColor: T.line }} data-testid="g-row">
              <div className="grid gap-2 md:grid-cols-2">
                <select className={inp} style={{ borderColor: T.line }} value={r.subject_id} onChange={(e) => upd(i, { subject_id: Number(e.target.value) || '' })}>
                  <option value="">Fənn seçin…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className={inp} style={{ borderColor: T.line }} value={r.teacher_id} onChange={(e) => upd(i, { teacher_id: Number(e.target.value) || '' })}>
                  <option value="">Müəllim seçin…</option>
                  {teachers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DAYS.map((d, k) => (
                  <button key={d} type="button" onClick={() => toggleDay(i, k + 1)} aria-pressed={r.days.includes(k + 1)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border"
                    style={r.days.includes(k + 1) ? { background: color, color: '#fff', borderColor: color } : { color: T.inkSoft, borderColor: T.line }}>{d}</button>
                ))}
                <span className="mx-1" />
                <input type="time" className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: T.line }} value={r.start} onChange={(e) => upd(i, { start: e.target.value })} />
                <span style={{ color: T.inkFaint }}>–</span>
                <input type="time" className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: T.line }} value={r.end} onChange={(e) => upd(i, { end: e.target.value })} />
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="ml-auto p-1.5 rounded-lg" aria-label="Sil" style={{ color: T.inkFaint }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="self-start inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
            <Plus className="w-4 h-4" /> Fənn əlavə et
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: T.ink }}>
            <Users className="w-4 h-4" /> Şagirdlər <span style={{ color: T.inkFaint }}>({picked.length} seçilib)</span>
          </div>
          <input className={inp} style={{ borderColor: T.line }} placeholder="Axtar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-48 overflow-auto rounded-xl border p-1 grid sm:grid-cols-2 gap-0.5" style={{ borderColor: T.line }}>
            {shown.length === 0 && <div className="p-3 text-sm" style={{ color: T.inkFaint }}>Şagird tapılmadı</div>}
            {shown.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer hover:bg-[#FAF9F6]" style={{ color: T.ink }}>
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm" style={{ color: T.inkSoft }}>
          Dərslər avtomatik yaradılır:
          <select className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: T.line }} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[4, 8, 12, 16, 24, 36].map((w) => <option key={w} value={w}>{w} həftə</option>)}
          </select>
          ərzində
        </div>

        {conf && (
          <div className="rounded-xl p-3 text-sm flex flex-col gap-1" style={{ background: '#FEF3E2', color: '#92400E' }}>
            <div className="font-semibold">Müəllim həmin vaxtda başqa qrupda dərs deyir:</div>
            {conf.map((c) => <div key={c}>• {c}</div>)}
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setConf(null); save(true); }} className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold" style={{ background: '#B45309' }}>Yenə də saxla</button>
              <button onClick={() => setConf(null)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: '#B45309' }}>Düzəliş edim</button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: T.line, color: T.ink }}>Ləğv et</button>
          <button onClick={() => save(false)} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: color }} data-testid="g-save">
            {busy ? 'Saxlanır…' : 'Saxla'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
