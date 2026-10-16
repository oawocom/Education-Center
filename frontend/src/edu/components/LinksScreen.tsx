'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, Users, GraduationCap, Heart, ArrowLeft, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, getUser } from '../utils/api';
import { ScreenMeta } from '../screens';
import { ScreenHeader } from './screen';
import { Spinner } from './ui';
import { T, ROLE_COLOR } from '../theme';

// ============================================================
// LinksScreen — "Bağlantılar"
//
// Şagird ↔ valideyn / müəllim bağlantıları. Üç rejim:
//   student  : şagirdi seç → valideynləri və müəllimlərini idarə et
//   guardian : valideyni seç → övladlarını idarə et
//   teacher  : müəllimi seç → şagirdlərini idarə et
// Yadda saxla düyməsi yoxdur — seçim dərhal bağlanır.
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

type Mode = 'student' | 'guardian' | 'teacher';
type Person = { id: number; name: string };
type GLink = { link_id?: number; id: number; name: string; relation?: string };
type TLink = { link_id?: number; id: number; name: string };
interface Detail {
  guardians: GLink[];
  teachers: TLink[];
}
interface Student extends Person {
  guardians: number;
  teachers: number;
}

const RELATIONS = [
  { value: 'ana', label: 'Ana' },
  { value: 'ata', label: 'Ata' },
  { value: 'qeyyum', label: 'Qəyyum' },
];
const relLabel = (v?: string) => RELATIONS.find((r) => r.value === v)?.label || '';

const norm = (s: string) => s.toLocaleLowerCase('az').trim();
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();

const card = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius } as const;

// ---------- Axtarışlı seçim ----------

function Combobox({
  options, placeholder, onPick, accent,
}: {
  options: Person[];
  placeholder: string;
  onPick: (p: Person) => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const term = norm(q);
  const shown = options.filter((o) => !term || norm(o.name).includes(term)).slice(0, 50);

  const pick = (p: Person) => {
    onPick(p);
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-1 min-w-[200px]">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
        style={{ border: `1px dashed ${open ? accent : T.line}`, background: T.surface }}
      >
        <Plus className="w-4 h-4 shrink-0" style={{ color: accent }} />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) { e.preventDefault(); pick(shown[0]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{ color: T.ink }}
          aria-label={placeholder}
        />
      </div>
      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto p-1 shadow-lg"
          style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12 }}
        >
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-sm" style={{ color: T.inkFaint }}>
              {options.length === 0 ? 'Əlavə ediləcək başqa şəxs yoxdur' : 'Tapılmadı'}
            </p>
          ) : (
            shown.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[#F0EEE8]"
                style={{ color: T.ink }}
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Çip ----------

function Chip({
  name, sub, tone, onRemove,
}: {
  name: string;
  sub?: string;
  tone: { color: string; soft: string };
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full text-sm"
      style={{ background: tone.soft, color: T.ink }}
    >
      <span
        className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold"
        style={{ background: T.surface, color: tone.color }}
      >
        {initials(name)}
      </span>
      <span className="font-medium">{name}</span>
      {sub && <span className="text-xs" style={{ color: tone.color }}>{sub}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${name} bağlantısını sil`}
          className="rounded-full p-0.5 hover:bg-white/70"
          style={{ color: T.inkSoft }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

function Section({
  icon: Icon, title, tone, count, children, hint,
}: {
  icon: any; title: string; tone: { color: string; soft: string }; count: number; children: React.ReactNode; hint?: string;
}) {
  return (
    <section className="p-5" style={card}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: tone.soft, color: tone.color }}>
          <Icon className="w-4 h-4" />
        </span>
        <h3 className="font-bold" style={{ color: T.ink }}>{title}</h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: T.lineSoft, color: T.inkSoft }}>
          {count}
        </span>
      </div>
      {children}
      {hint && <p className="text-xs mt-3" style={{ color: T.inkFaint }}>{hint}</p>}
    </section>
  );
}

// ============================================================

export default function LinksScreen({ meta, color }: Props) {
  const me = getUser();
  const isAdmin = me?.role === 'admin';
  const canEdit = isAdmin; // müəllim yalnız oxuyur
  const accent = T.accent;

  const [mode, setMode] = useState<Mode>('student');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selStudent, setSelStudent] = useState<number | null>(null);
  const [selPerson, setSelPerson] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [allG, setAllG] = useState<Person[]>([]);
  const [allT, setAllT] = useState<Person[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [relation, setRelation] = useState('ana');
  const [mobileDetail, setMobileDetail] = useState(false);
  const allLoaded = useRef(false);

  const applyDirectory = (r: any) => {
    if (r.all_guardians) setAllG(r.all_guardians);
    if (r.all_teachers) setAllT(r.all_teachers);
  };

  const fetchDetail = useCallback(async (id: number) => {
    const r = await api.raw('/links?student_id=' + id);
    applyDirectory(r);
    const d: Detail = { guardians: r.guardians || [], teachers: r.teachers || [] };
    setDetails((p) => ({ ...p, [id]: d }));
    return d;
  }, []);

  // şagird siyahısı
  useEffect(() => {
    setLoading(true);
    api.raw('/links')
      .then((r) => setStudents(r.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  // seçilmiş şagirdin təfərrüatı
  useEffect(() => {
    if (mode !== 'student' || selStudent == null) return;
    if (details[selStudent]) return;
    setLoadingDetail(true);
    fetchDetail(selStudent).catch(() => toast.error('Yüklənmədi')).finally(() => setLoadingDetail(false));
  }, [mode, selStudent, details, fetchDetail]);

  // tərs rejim: bütün şagirdlərin təfərrüatı (bir dəfə, 6-lıq paketlərlə)
  const loadAll = useCallback(async () => {
    if (allLoaded.current) return;
    allLoaded.current = true;
    setLoadingAll(true);
    try {
      const ids = students.map((s) => s.id);
      for (let i = 0; i < ids.length; i += 6) {
        await Promise.all(ids.slice(i, i + 6).map((id) => fetchDetail(id).catch(() => null)));
      }
      if (ids.length === 0) {
        // şagird yoxdursa belə siyahılar lazımdır — alınmır
      }
    } finally {
      setLoadingAll(false);
    }
  }, [students, fetchDetail]);

  useEffect(() => {
    if (mode !== 'student' && !loading) loadAll();
  }, [mode, loading, loadAll]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setQ('');
    setSelPerson(null);
    setMobileDetail(false);
  };

  // ---------- Dəyişikliklər (optimistik) ----------

  const bump = (sid: number, key: 'guardians' | 'teachers', delta: number) =>
    setStudents((p) => p.map((s) => (s.id === sid ? { ...s, [key]: Math.max(0, s[key] + delta) } : s)));

  const addLink = async (sid: number, kind: 'guardian' | 'teacher', person: Person, rel?: string) => {
    const field = kind === 'guardian' ? 'guardians' : 'teachers';
    const cur = details[sid] || { guardians: [], teachers: [] };
    if ((cur[field] as any[]).some((x) => x.id === person.id)) return;
    const entry: any = { id: person.id, name: person.name, ...(kind === 'guardian' ? { relation: rel } : {}) };
    setDetails((p) => ({ ...p, [sid]: { ...cur, [field]: [...(cur[field] as any[]), entry] } }));
    bump(sid, field, 1);
    try {
      await api.raw('/links', {
        method: 'POST',
        body: JSON.stringify({ student_id: sid, kind, person_id: person.id, ...(kind === 'guardian' ? { relation: rel } : {}) }),
      });
      toast.success(`${person.name} bağlandı`);
    } catch (e: any) {
      setDetails((p) => ({ ...p, [sid]: { ...cur } }));
      bump(sid, field, -1);
      if (e?.status !== 403) toast.error(e?.message || 'Bağlanmadı');
    }
  };

  const removeLink = async (sid: number, kind: 'guardian' | 'teacher', person: Person) => {
    const field = kind === 'guardian' ? 'guardians' : 'teachers';
    const cur = details[sid] || { guardians: [], teachers: [] };
    setDetails((p) => ({ ...p, [sid]: { ...cur, [field]: (cur[field] as any[]).filter((x) => x.id !== person.id) } }));
    bump(sid, field, -1);
    try {
      await api.raw('/links', { method: 'DELETE', body: JSON.stringify({ student_id: sid, kind, person_id: person.id }) });
      toast.success('Bağlantı silindi');
    } catch (e: any) {
      setDetails((p) => ({ ...p, [sid]: { ...cur } }));
      bump(sid, field, 1);
      if (e?.status !== 403) toast.error(e?.message || 'Silinmədi');
    }
  };

  // ---------- Törəmə məlumat ----------

  // tərs rejim: şəxs → şagirdlər
  const peopleList = useMemo(() => {
    if (mode === 'student') return [];
    const base = mode === 'guardian' ? allG : allT;
    const field = mode === 'guardian' ? 'guardians' : 'teachers';
    return base.map((p) => ({
      ...p,
      kids: students.filter((s) => (details[s.id]?.[field] as any[] | undefined)?.some((x) => x.id === p.id)),
    }));
  }, [mode, allG, allT, students, details]);

  const term = norm(q);
  const shownStudents = students.filter((s) => !term || norm(s.name).includes(term));
  const shownPeople = peopleList.filter((p) => !term || norm(p.name).includes(term));
  const person = peopleList.find((p) => p.id === selPerson) || null;
  const student = students.find((s) => s.id === selStudent) || null;
  const det = selStudent != null ? details[selStudent] : undefined;

  const gTone = ROLE_COLOR.guardian;
  const tTone = ROLE_COLOR.teacher;
  const sTone = ROLE_COLOR.student;

  const tabs: { key: Mode; label: string }[] = [
    { key: 'student', label: 'Şagirdə görə' },
    { key: 'guardian', label: 'Valideynə görə' },
    { key: 'teacher', label: 'Müəllimə görə' },
  ];

  // ---------- Sol sütun ----------

  const leftList = (
    <div style={card} className="overflow-hidden flex flex-col">
      <div className="p-3" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
          <Search className="w-4 h-4" style={{ color: T.inkFaint }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === 'student' ? 'Şagird axtar...' : mode === 'guardian' ? 'Valideyn axtar...' : 'Müəllim axtar...'}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: T.ink }}
            aria-label="Axtar"
          />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[560px] p-1.5">
        {loading || (mode !== 'student' && loadingAll && peopleList.length === 0) ? (
          <Spinner color={accent} />
        ) : mode === 'student' ? (
          shownStudents.length === 0 ? (
            <p className="p-6 text-sm text-center" style={{ color: T.inkFaint }}>
              {students.length === 0 ? 'Hələ şagird yoxdur. Əvvəlcə “İstifadəçilər” bölməsindən şagird əlavə edin.' : 'Heç nə tapılmadı'}
            </p>
          ) : (
            shownStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelStudent(s.id); setMobileDetail(true); }}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F0EEE8]"
                style={s.id === selStudent ? { background: T.accentSoft } : undefined}
              >
                <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: sTone.soft, color: sTone.color }}>
                  {initials(s.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: T.ink }}>{s.name}</span>
                  <span className="block text-xs" style={{ color: T.inkSoft }}>
                    {s.guardians} valideyn · {s.teachers} müəllim
                  </span>
                </span>
              </button>
            ))
          )
        ) : shownPeople.length === 0 ? (
          <p className="p-6 text-sm text-center" style={{ color: T.inkFaint }}>
            {peopleList.length === 0 ? (mode === 'guardian' ? 'Hələ valideyn yoxdur.' : 'Hələ müəllim yoxdur.') : 'Heç nə tapılmadı'}
          </p>
        ) : (
          shownPeople.map((p) => {
            const tone = mode === 'guardian' ? gTone : tTone;
            return (
              <button
                key={p.id}
                onClick={() => { setSelPerson(p.id); setMobileDetail(true); }}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F0EEE8]"
                style={p.id === selPerson ? { background: T.accentSoft } : undefined}
              >
                <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: tone.soft, color: tone.color }}>
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: T.ink }}>{p.name}</span>
                  <span className="block text-xs" style={{ color: T.inkSoft }}>
                    {loadingAll ? '...' : `${p.kids.length} ${mode === 'guardian' ? 'övlad' : 'şagird'}`}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ---------- Sağ sütun ----------

  const emptyRight = (text: string) => (
    <div style={card} className="p-10 flex flex-col items-center text-center">
      <span className="w-12 h-12 rounded-2xl grid place-items-center mb-3" style={{ background: T.accentSoft, color: accent }}>
        <UserRound className="w-6 h-6" />
      </span>
      <p className="text-sm max-w-xs" style={{ color: T.inkSoft }}>{text}</p>
    </div>
  );

  const backBtn = (
    <button
      onClick={() => setMobileDetail(false)}
      className="lg:hidden inline-flex items-center gap-1 text-sm self-start"
      style={{ color: T.inkSoft }}
    >
      <ArrowLeft className="w-4 h-4" /> Siyahıya qayıt
    </button>
  );

  let right: React.ReactNode;

  if (mode === 'student') {
    if (!student) {
      right = emptyRight('Soldan şagird seçin — valideynlərini və müəllimlərini burada görəcəksiniz.');
    } else if (!det || loadingDetail) {
      right = <div style={card}><Spinner color={accent} /></div>;
    } else {
      const availG = allG.filter((g) => !det.guardians.some((x) => x.id === g.id));
      const availT = allT.filter((t) => !det.teachers.some((x) => x.id === t.id));
      right = (
        <div className="flex flex-col gap-4">
          {backBtn}
          <div className="p-5 flex items-center gap-4" style={card}>
            <span className="w-14 h-14 rounded-full grid place-items-center text-lg font-bold" style={{ background: sTone.soft, color: sTone.color }}>
              {initials(student.name)}
            </span>
            <div>
              <h2 className="text-xl font-extrabold" style={{ color: T.ink }}>{student.name}</h2>
              <p className="text-sm" style={{ color: T.inkSoft }}>Şagird</p>
            </div>
          </div>

          <Section icon={Heart} title="Valideynlər" tone={gTone} count={det.guardians.length}>
            <div className="flex flex-wrap gap-2 mb-3">
              {det.guardians.length === 0 && (
                <p className="text-sm" style={{ color: T.inkFaint }}>Hələ valideyn bağlanmayıb.</p>
              )}
              {det.guardians.map((g) => (
                <Chip
                  key={g.id}
                  name={g.name}
                  sub={relLabel(g.relation)}
                  tone={gTone}
                  onRemove={canEdit ? () => removeLink(student.id, 'guardian', g) : undefined}
                />
              ))}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  aria-label="Qohumluq"
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.ink }}
                >
                  {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <Combobox
                  options={availG}
                  placeholder="Əlavə et: valideyn axtar..."
                  accent={gTone.color}
                  onPick={(p) => addLink(student.id, 'guardian', p, relation)}
                />
              </div>
            )}
          </Section>

          <Section icon={GraduationCap} title="Müəllimlər" tone={tTone} count={det.teachers.length}>
            <div className="flex flex-wrap gap-2 mb-3">
              {det.teachers.length === 0 && (
                <p className="text-sm" style={{ color: T.inkFaint }}>Hələ müəllim bağlanmayıb.</p>
              )}
              {det.teachers.map((t) => (
                <Chip
                  key={t.id}
                  name={t.name}
                  tone={tTone}
                  onRemove={canEdit ? () => removeLink(student.id, 'teacher', t) : undefined}
                />
              ))}
            </div>
            {canEdit && (
              <Combobox
                options={availT}
                placeholder="Əlavə et: müəllim axtar..."
                accent={tTone.color}
                onPick={(p) => addLink(student.id, 'teacher', p)}
              />
            )}
          </Section>
          {!canEdit && (
            <p className="text-xs" style={{ color: T.inkFaint }}>Bu ekran sizin üçün yalnız oxumaq rejimindədir.</p>
          )}
        </div>
      );
    }
  } else if (!person) {
    right = emptyRight(
      mode === 'guardian'
        ? 'Soldan valideyn seçin — övladlarını burada görəcəksiniz.'
        : 'Soldan müəllim seçin — şagirdlərini burada görəcəksiniz.'
    );
  } else {
    const kind = mode === 'guardian' ? 'guardian' : 'teacher';
    const tone = mode === 'guardian' ? gTone : tTone;
    const avail = students.filter((s) => !person.kids.some((k) => k.id === s.id));
    right = (
      <div className="flex flex-col gap-4">
        {backBtn}
        <div className="p-5 flex items-center gap-4" style={card}>
          <span className="w-14 h-14 rounded-full grid place-items-center text-lg font-bold" style={{ background: tone.soft, color: tone.color }}>
            {initials(person.name)}
          </span>
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: T.ink }}>{person.name}</h2>
            <p className="text-sm" style={{ color: T.inkSoft }}>{tone.label}</p>
          </div>
        </div>
        <Section icon={Users} title={mode === 'guardian' ? 'Övladlar' : 'Şagirdlər'} tone={sTone} count={person.kids.length}>
          <div className="flex flex-wrap gap-2 mb-3">
            {person.kids.length === 0 && (
              <p className="text-sm" style={{ color: T.inkFaint }}>
                {mode === 'guardian' ? 'Hələ övlad bağlanmayıb.' : 'Hələ şagird bağlanmayıb.'}
              </p>
            )}
            {person.kids.map((s) => (
              <Chip
                key={s.id}
                name={s.name}
                tone={sTone}
                sub={kind === 'guardian' ? relLabel((details[s.id]?.guardians || []).find((g) => g.id === person.id)?.relation) : undefined}
                onRemove={canEdit ? () => removeLink(s.id, kind, person) : undefined}
              />
            ))}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2 items-center">
              {kind === 'guardian' && (
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  aria-label="Qohumluq"
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.ink }}
                >
                  {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
              <Combobox
                options={avail}
                placeholder="Əlavə et: şagird axtar..."
                accent={tone.color}
                onPick={(s) => addLink(s.id, kind, person, relation)}
              />
            </div>
          )}
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ScreenHeader h1={meta?.h1 || 'Bağlantılar'} sub={meta?.sub || 'Şagirdləri valideyn və müəllimlərlə bağlayın — dəyişiklik dərhal yadda qalır.'} />

      {isAdmin && (
        <div className="inline-flex p-1 rounded-xl" style={{ background: T.lineSoft }} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={mode === t.key}
              onClick={() => switchMode(t.key)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={mode === t.key ? { background: T.surface, color: T.ink, boxShadow: '0 1px 2px rgba(0,0,0,.06)' } : { color: T.inkSoft }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr] items-start">
        <div className={mobileDetail ? 'hidden lg:block' : ''}>{leftList}</div>
        <div className={mobileDetail ? '' : 'hidden lg:block'}>{right}</div>
      </div>
    </div>
  );
}
