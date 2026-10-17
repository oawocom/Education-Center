'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Key, Trash2, UserPlus, Copy, Pencil, Wand2, AlertTriangle, Link2, CheckCircle2, Hash, Clock, MailCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, auth, EduUser } from '../utils/api';
import { T, ROLE_COLOR } from '../theme';
import { ScreenMeta } from '../screens';
import { ScreenHeader, PrincipleNote } from './screen';
import { Modal, Button, Field, Badge, Spinner } from './ui';
import { FieldDef } from '../types';

// ============================================================
// UsersScreen — "İstifadəçilər"
//
// Panel hesabları: yaratmaq, rol vermək, şifrə sıfırlamaq,
// dəvət linki almaq. Yalnız admin görür (nav resource: users).
// ============================================================

interface Props {
  meta: ScreenMeta;
  color: string;
}

interface ProfileInfo {
  kind: string;
  id: number;
  name: string;
  code: string;
  linked: boolean;
  missing: boolean; // rol var, profil yoxdur = kölgə hesab
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone?: string;
  last_login?: string;
  teacher_id?: number;
  student_id?: number;
  guardian_id?: number;
  sub_role_id?: number;
  profile?: ProfileInfo;
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  admin: { label: ROLE_COLOR.admin.label, color: ROLE_COLOR.admin.color },
  teacher: { label: ROLE_COLOR.teacher.label, color: ROLE_COLOR.teacher.color },
  student: { label: ROLE_COLOR.student.label, color: ROLE_COLOR.student.color },
  guardian: { label: ROLE_COLOR.guardian.label, color: ROLE_COLOR.guardian.color },
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'teacher', label: 'Müəllim' },
  { value: 'student', label: 'Şagird' },
  { value: 'guardian', label: 'Valideyn' },
];

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
  { key: 'email', label: 'E-poçt', type: 'email', required: true, width: 'half' },
  { key: 'role', label: 'Rol', type: 'select', required: true, width: 'half', options: ROLE_OPTIONS },
  { key: 'password', label: 'Parol', type: 'text', width: 'half', help: 'Boş buraxın: dəvət linki e-poçtla gedəcək və istifadəçi parolu özü təyin edəcək' },
  { key: 'teacher_id', label: 'Müəllim profili', type: 'relation', resource: 'teachers', width: 'half' },
  { key: 'student_id', label: 'Şagird profili', type: 'relation', resource: 'students', width: 'half' },
  { key: 'guardian_id', label: 'Valideyn profili', type: 'relation', resource: 'guardians', width: 'half' },
  { key: 'sub_role_id', label: 'Alt rol', type: 'relation', resource: 'sub-roles', width: 'half', help: 'İcazəni daraldır — boş buraxılsa tam baza rolu' },
  { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
];

// Redaktədə e-poçt və şifrə dəyişmir (şifrə ayrı düymədədir)
const EDIT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
  { key: 'role', label: 'Rol', type: 'select', required: true, width: 'half', options: ROLE_OPTIONS },
  { key: 'teacher_id', label: 'Müəllim profili', type: 'relation', resource: 'teachers', width: 'half' },
  { key: 'student_id', label: 'Şagird profili', type: 'relation', resource: 'students', width: 'half' },
  { key: 'guardian_id', label: 'Valideyn profili', type: 'relation', resource: 'guardians', width: 'half' },
  { key: 'sub_role_id', label: 'Alt rol', type: 'relation', resource: 'sub-roles', width: 'half' },
  { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
  { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv', width: 'half' },
];


const cardStyle = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius } as const;

function RoleChip({ role }: { role: string }) {
  const m = ROLE_COLOR[role] || ROLE_COLOR.admin;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold" style={{ background: m.soft, color: m.color }}>
      {m.label}
    </span>
  );
}

// ---------- Kodla əlavə et ----------

function AddByCode({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ user: EduUser; already?: boolean } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (c: string) => {
    setBusy(true);
    setError('');
    setResult(null);
    auth
      .addByCode(c)
      .then((r) => {
        setResult({ user: r.user, already: r.already });
        setCode('');
        if (!r.already) toast.success(`${r.user?.name || 'İstifadəçi'} əlavə olundu`);
        onAdded();
      })
      .catch((e) => setError(e?.message || 'Bu kodla şəxs tapılmadı'))
      .finally(() => { setBusy(false); setTimeout(() => inputRef.current?.focus(), 0); });
  };

  const onChange = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 6);
    setCode(d);
    setError('');
    if (d.length === 6 && !busy) submit(d);
  };

  const display = code.length > 3 ? code.slice(0, 3) + ' ' + code.slice(3) : code;

  return (
    <div className="p-6" style={cardStyle}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: T.accentSoft, color: T.accent }}>
          <Hash className="w-4 h-4" />
        </span>
        <h2 className="font-bold" style={{ color: T.ink }}>Kodla əlavə et</h2>
      </div>
      <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
        Qeydiyyatdan keçən şəxs öz 6 rəqəmli kodunu sizə verir — kodu yazın, o dərhal sistemə əlavə olunur.
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <input
          ref={inputRef}
          value={display}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="000 000"
          aria-label="6 rəqəmli kod"
          disabled={busy}
          className="w-full sm:w-64 text-center text-3xl font-bold tracking-[0.3em] py-3 rounded-xl outline-none"
          style={{ border: `1px solid ${error ? T.bad : T.line}`, background: T.bg, color: T.ink }}
        />
        <div className="min-h-[48px] flex items-center flex-1">
          {busy && <Spinner color={T.accent} />}
          {!busy && error && <p className="text-sm" style={{ color: T.bad }}>{error}</p>}
          {!busy && result && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: T.okSoft }}>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: T.ok }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: T.ink }}>{result.user?.name}</p>
                <p className="text-xs flex items-center gap-1.5" style={{ color: T.inkSoft }}>
                  {result.user?.role && <RoleChip role={result.user.role} />}
                  {result.already ? 'Artıq əlavə olunub' : 'Uğurla əlavə olundu'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Gözləyənlər ----------

function PendingList({ onAdded, refreshKey }: { onAdded: () => void; refreshKey: number }) {
  const [items, setItems] = useState<EduUser[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    auth.pending().then((r) => setItems(r.data || [])).catch(() => setItems((p) => p || []));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const approve = (u: EduUser) => {
    setBusyId(u.id);
    auth
      .approve(u.id)
      .then(() => {
        toast.success(`${u.name} əlavə olundu`);
        setItems((p) => (p || []).filter((x) => x.id !== u.id));
        onAdded();
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əlavə olunmadı'); })
      .finally(() => setBusyId(null));
  };

  return (
    <div className="p-6" style={cardStyle}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: T.warnSoft, color: T.warn }}>
          <Clock className="w-4 h-4" />
        </span>
        <h2 className="font-bold" style={{ color: T.ink }}>Gözləyənlər</h2>
        {items && items.length > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: T.warnSoft, color: T.warn }}>
            {items.length}
          </span>
        )}
      </div>
      {items === null ? (
        <Spinner color={T.accent} />
      ) : items.length === 0 ? (
        <p className="text-sm py-2" style={{ color: T.inkFaint }}>
          Hazırda gözləyən yoxdur. Yeni qeydiyyatdan keçənlər burada görünəcək.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: T.lineSoft }}>
          {items.map((u) => (
            <li key={u.id} className="py-3 flex items-center gap-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              <span className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0" style={{ background: (ROLE_COLOR[u.role] || ROLE_COLOR.admin).soft, color: (ROLE_COLOR[u.role] || ROLE_COLOR.admin).color }}>
                {(u.name || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>{u.name}</p>
                <p className="text-xs truncate" style={{ color: T.inkSoft }}>{u.email}</p>
              </div>
              {u.role && <RoleChip role={u.role} />}
              <code className="text-sm font-semibold tracking-widest hidden sm:block" style={{ color: T.inkSoft }}>{u.code}</code>
              <Button onClick={() => approve(u)} disabled={busyId === u.id} color={T.accent}>
                <UserPlus className="w-4 h-4" />
                Əlavə et
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function UsersScreen({ meta, color }: Props) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ role: 'teacher' });
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteMail, setInviteMail] = useState('');

  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const [relOptions, setRelOptions] = useState<Record<string, any[]>>({});

  const editable = can('users', 'create');
  const [pendingKey, setPendingKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    api
      .raw('/users' + (roleFilter ? '?role=' + roleFilter : ''))
      .then((res) => setRows((res.data || []) as UserRow[]))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [roleFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all(
      ['teachers', 'students', 'guardians', 'sub-roles'].map((r) =>
        api.list(r, { per_page: 500 }).then((res) => ({ r, items: res.data || [] })).catch(() => ({ r, items: [] }))
      )
    ).then((results) => {
      const map: Record<string, any[]> = {};
      results.forEach(({ r, items }) => {
        map[r] = items.map((it: any) => ({ value: it.id, label: it.name || `#${it.id}` }));
      });
      setRelOptions(map);
    });
  }, []);

  const create = () => {
    if (!form.name || !form.email || !form.role) {
      toast.error('Ad, e-poçt və rol tələb olunur');
      return;
    }

    setSaving(true);
    setInviteUrl('');
    api
      .raw('/users', { method: 'POST', body: JSON.stringify(form) })
      .then((res) => {
        const mailed = res && res.email_status === 'queued';
        toast.success(form.password ? 'İstifadəçi yaradıldı' : mailed ? 'Dəvət e-poçtla göndərildi' : 'Dəvət linki hazırdır');
        if (res && res.setup_url) setInviteUrl(res.setup_url);
        setInviteMail(res && res.setup_url ? (mailed ? 'sent:' + form.email : res.email_status || '') : '');
        setForm({ role: 'teacher' });
        setCreating(false);
        load();
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yaradılmadı'); })
      .finally(() => setSaving(false));
  };

  const openEdit = (u: UserRow) => {
    const initial: Record<string, any> = {};
    EDIT_FIELDS.forEach((f) => { initial[f.key] = (u as any)[f.key]; });
    setEditForm(initial);
    setEditing(u);
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!editForm.name || !editForm.role) {
      toast.error('Ad və rol tələb olunur');
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {};
    EDIT_FIELDS.forEach((f) => {
      payload[f.key] = editForm[f.key] === '' ? null : editForm[f.key];
      if (f.type === 'checkbox') payload[f.key] = !!editForm[f.key];
    });
    api
      .raw(`/users/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      .then(() => { toast.success('Yadda saxlanıldı'); setEditing(null); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yadda saxlanmadı'); })
      .finally(() => setSaving(false));
  };

  const sendReset = () => {
    if (!resetting) return;
    api
      .raw(`/users/${resetting.id}/send-reset`, { method: 'POST' })
      .then(() => { toast.success('Bərpa linki göndərildi', { description: resetting.email + ' · 24 saat etibarlı' }); setResetting(null); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Göndərilmədi'); });
  };

  const resetPassword = () => {
    if (!resetting || newPassword.length < 8) {
      toast.error('Parol ən azı 8 simvol olmalıdır');
      return;
    }
    api
      .raw(`/users/${resetting.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: newPassword }) })
      .then(() => { toast.success('Şifrə yeniləndi'); setResetting(null); setNewPassword(''); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Alınmadı'); });
  };

  const doDelete = () => {
    if (!deleting) return;
    api
      .raw(`/users/${deleting.id}`, { method: 'DELETE' })
      .then(() => { toast.success('Silindi'); setDeleting(null); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Silinmədi'); setDeleting(null); });
  };

  // Kölgə hesablar: rolu var, profili yoxdur. Bir düymə ilə hamısına
  // profil yaradılıb bağlanır — hesablar "real" olur.
  const orphanCount = rows.filter((u) => u.profile && u.profile.missing).length;
  const [backfilling, setBackfilling] = useState(false);

  const backfill = () => {
    setBackfilling(true);
    api
      .raw('/ops/backfill-profiles', { method: 'POST', body: JSON.stringify({}) })
      .then((res: any) => {
        toast.success(`${res?.count ?? 0} hesab üçün profil yaradıldı`);
        load();
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Alınmadı'); })
      .finally(() => setBackfilling(false));
  };

  const profileCell = (u: UserRow) => {
    if (u.role === 'admin') return <span style={{ color: T.inkFaint }}>—</span>;
    const p = u.profile;
    if (!p || p.missing) {
      return <Badge text="Profil yoxdur" color={T.bad} />;
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[#1C2434]">
        <Link2 className="w-3.5 h-3.5 text-[#9AA3B2]" />
        {p.name}
        {p.code && <span className="text-xs text-[#9AA3B2]">({p.code})</span>}
      </span>
    );
  };

  return (
    <>
      <ScreenHeader h1={meta.h1} sub={meta.sub} />

      {editable && (
        <div className="grid gap-4">
          <AddByCode onAdded={() => { load(); setPendingKey((k) => k + 1); }} />
          <PendingList refreshKey={pendingKey} onAdded={load} />
        </div>
      )}

      <div className="p-3 flex flex-wrap gap-2 items-center" style={cardStyle}>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.ink }}
        >
          <option value="">Rol: hamısı</option>
          {Object.keys(ROLE_META).map((r) => (
            <option key={r} value={r}>{ROLE_META[r].label}</option>
          ))}
        </select>

        {editable && (
          <div className="ml-auto flex flex-wrap gap-2 items-center">
            {orphanCount > 0 && (
              <Button variant="ghost" onClick={backfill} disabled={backfilling}>
                <Wand2 className="w-4 h-4" />
                {backfilling ? 'Yaradılır...' : `Profilləri bərpa et (${orphanCount})`}
              </Button>
            )}
            <Button onClick={() => { setCreating(true); setInviteUrl(''); }} color={T.accent}>
              <UserPlus className="w-4 h-4" />
              İstifadəçi
            </Button>
          </div>
        )}
      </div>

      {orphanCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: T.badSoft }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.bad }} />
          <p className="text-sm" style={{ color: T.bad }}>
            <b>{orphanCount}</b> hesabın profili yoxdur (kölgə hesab) — sistemdə kodu və məlumatı olmadan yalnız giriş üçün mövcuddur.
            “Profilləri bərpa et” düyməsi hər birinə ad və e-poçtundan avtomatik profil yaradıb bağlayır.
          </p>
        </div>
      )}

      {inviteUrl && (
        <div className="rounded-xl p-3" style={{ background: T.accentSoft, border: `1px solid ${T.line}` }}>
          {inviteMail.indexOf('sent:') === 0 ? (
            <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: T.ok }}>
              <MailCheck className="w-4 h-4" /> Dəvət {inviteMail.slice(5)} ünvanına göndərildi. Lazım olsa, linki özünüz də ötürə bilərsiniz (7 gün etibarlı):
            </p>
          ) : (
            <p className="text-xs font-semibold mb-1.5" style={{ color: T.accent }}>
              Dəvət linki (7 gün etibarlı){inviteMail === 'not_configured' ? ' — e-poçt qurulmayıb, linki istifadəçiyə özünüz ötürün' : ''}
            </p>
          )}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs break-all" style={{ color: T.accent }}>{inviteUrl}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Kopyalandı'); }}
              className="p-1.5 rounded-lg shrink-0"
              style={{ color: T.accent }}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={cardStyle}><Spinner color={T.accent} /></div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center" style={cardStyle}>
          <p className="text-sm" style={{ color: T.inkSoft }}>İstifadəçi yoxdur.</p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={cardStyle}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: T.inkSoft }}>
                {['Ad', 'E-poçt', 'Rol', 'Profil', 'Vəziyyət', ''].map((h, i) => (
                  <th key={i} className="text-left font-semibold text-xs uppercase tracking-wide px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAF9F6]" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                  <td className="px-4 py-3 font-medium" style={{ color: T.ink }}>{u.name}</td>
                  <td className="px-4 py-3" style={{ color: T.inkSoft }}>{u.email}</td>
                  <td className="px-4 py-3"><RoleChip role={u.role} /></td>
                  <td className="px-4 py-3 text-sm">{profileCell(u)}</td>
                  <td className="px-4 py-3">
                    <Badge text={(u as any).status === 'pending' ? 'Gözləyir' : u.is_active ? 'Aktiv' : 'Deaktiv'} color={(u as any).status === 'pending' ? T.warn : u.is_active ? T.ok : T.inkFaint} />
                  </td>
                  <td className="px-4 py-3">
                    {editable && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-[#F0EEE8]" style={{ color: T.inkSoft }} title="Redaktə">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setResetting(u); setNewPassword(''); }} className="p-1.5 rounded-lg hover:bg-[#F0EEE8]" style={{ color: T.inkSoft }} title="Parol: bərpa linki və ya yeni parol">
                          <Key className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleting(u)} className="p-1.5 rounded-lg hover:bg-[#FDEBEF]" style={{ color: T.bad }} title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.note && <PrincipleNote note={meta.note} color={color} />}

      <Modal
        open={creating}
        title="Yeni istifadəçi"
        onClose={() => setCreating(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Ləğv et</Button>
            <Button onClick={create} disabled={saving} color={color}>
              {saving ? 'Yaradılır...' : 'Yarat'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <Field
              key={f.key}
              def={f}
              value={form[f.key]}
              onChange={(v) => setForm({ ...form, [f.key]: v })}
              options={f.type === 'relation' ? relOptions[f.resource || ''] : undefined}
            />
          ))}
        </div>
        <p className="text-xs text-[#9AA3B2] mt-3">
          Profil seçməsəniz, rola uyğun profil (müəllim / şagird / valideyn) avtomatik yaradılıb bu hesaba bağlanır —
          beləcə hesab “kölgə” qalmır, sistemdə real qeydi (kodu, məlumatı) olur. Mövcud profil varsa, onu seçin ki, təkrar yaranmasın.
        </p>
      </Modal>

      <Modal
        open={!!editing}
        title={editing ? `${editing.name} — redaktə` : ''}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Ləğv et</Button>
            <Button onClick={saveEdit} disabled={saving} color={color}>
              {saving ? 'Saxlanılır...' : 'Yadda saxla'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EDIT_FIELDS.map((f) => (
            <Field
              key={f.key}
              def={f}
              value={editForm[f.key]}
              onChange={(v) => setEditForm({ ...editForm, [f.key]: v })}
              options={f.type === 'relation' ? relOptions[f.resource || ''] : undefined}
            />
          ))}
        </div>
        <p className="text-xs text-[#9AA3B2] mt-3">
          E-poçt dəyişdirilmir. Hesabı deaktiv etmək silməkdən daha təhlükəsizdir — tarixçə qalır, giriş bağlanır.
        </p>
      </Modal>

      <Modal
        open={!!resetting}
        title={resetting ? `${resetting.name} — parol` : ''}
        onClose={() => setResetting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>Ləğv et</Button>
            <Button onClick={resetPassword} color={color}>Parolu təyin et</Button>
          </>
        }
      >
        <div className="rounded-xl border p-3 mb-4" style={{ borderColor: T.line }}>
          <p className="text-sm font-semibold">Ən yaxşısı: bərpa linki göndərin</p>
          <p className="text-xs mt-1 mb-3" style={{ color: T.inkSoft }}>
            İstifadəçi {resetting?.email} ünvanına gələn linklə parolunu özü təyin edir — parol heç kimə görünmür.
          </p>
          <Button variant="ghost" onClick={sendReset}><Send className="w-3.5 h-3.5" /> Bərpa linkini göndər</Button>
        </div>
        <p className="text-sm font-semibold mb-1.5">Və ya parolu özünüz verin</p>
        <input
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Ən azı 8 simvol"
          className="w-full px-3 py-2 rounded-xl border border-[#E8E5DE] text-sm"
        />
        <p className="text-xs mt-2" style={{ color: T.inkFaint }}>İstifadəçinin bütün cihazlardakı sessiyaları bağlanacaq və ona xəbərdarlıq məktubu gedəcək.</p>
      </Modal>

      <Modal
        open={!!deleting}
        title="Silinsin?"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Ləğv et</Button>
            <Button variant="danger" onClick={doDelete}>Sil</Button>
          </>
        }
      >
        <p className="text-sm text-[#5B6577]">
          Hesab silinəcək. Şagird/müəllim profili qalır — yalnız giriş imkanı aradan qalxır.
        </p>
      </Modal>
    </>
  );
}
