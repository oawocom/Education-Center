'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Link2, UserPlus, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, can } from '../utils/api';
import { LinkActionDef, SelectOption, FieldDef } from '../types';
import { Modal, Button, Field, Badge, EmptyState } from './ui';
import { TH_CLASS, TD_CLASS, TR_CLASS } from './screen';

// ============================================================
// LinkManager — çoxdan-çoxa bağlantıların bir modaldan idarəsi
//
// Bir yerdə üç iş görülür:
//   1. mövcud bağlantıları görmək / silmək / redaktə etmək
//   2. sistemdə olan qeydi bağlamaq
//   3. sistemdə OLMAYAN qeydi elə burada yaradıb bağlamaq
//      (məs. şagird əlavə edərkən valideyni ayrıca ekrana
//       getmədən yaratmaq)
//
// Eyni komponent şagird↔valideyn, qrup↔şagird, müəllim↔fənn
// üçün işləyir — fərq yalnız resources.ts-dəki təsvirdədir.
// ============================================================

interface Props {
  open: boolean;
  onClose: () => void;
  def: LinkActionDef;
  rowId: number | string;
  rowLabel: string;
  title: string;
  color: string;
}

type Row = Record<string, any>;

const optionLabel = (it: Row): string =>
  it.name || it.title || it.topic || it.label || `#${it.id}`;

export default function LinkManager({ open, onClose, def, rowId, rowLabel, title, color }: Props) {
  const [links, setLinks] = useState<Row[]>([]);
  const [targets, setTargets] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  // əlavə etmə forması
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Row>({});

  // sistemdə olmayan qeydi burada yaratmaq
  const [creatingNew, setCreatingNew] = useState(false);
  const [newForm, setNewForm] = useState<Row>({});

  // mövcud bağlantının sahələrini dəyişmək
  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<Row>({});

  const canCreate = can(def.resource, 'create');
  const canUpdate = can(def.resource, 'update');
  const canDelete = can(def.resource, 'delete');
  const canCreateTarget = can(def.targetResource, 'create') && !!def.quickCreateFields;

  const load = useCallback(() => {
    if (!open || !rowId) return;
    setLoading(true);
    Promise.all([
      api.list(def.resource, { [def.selfKey]: String(rowId), per_page: 200 }).catch(() => ({ data: [] as Row[] })),
      api.list(def.targetResource, { per_page: 500 }).catch(() => ({ data: [] as Row[] })),
    ])
      .then(([ls, ts]) => {
        setLinks((ls.data || []) as Row[]);
        setTargets((ts.data || []) as Row[]);
      })
      .finally(() => setLoading(false));
  }, [open, rowId, def.resource, def.selfKey, def.targetResource]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) {
      setAdding(false);
      setCreatingNew(false);
      setEditing(null);
      setForm({});
      setNewForm({});
    }
  }, [open]);

  const targetName = (id: any): string => {
    const hit = targets.find((t) => String(t.id) === String(id));
    return hit ? optionLabel(hit) : `#${id}`;
  };

  // Artıq bağlanmış olanlar seçim siyahısından çıxarılır
  const linkedIds = useMemo(
    () => new Set(links.map((l) => String(l[def.targetKey]))),
    [links, def.targetKey]
  );

  const targetOptions: SelectOption[] = useMemo(
    () =>
      targets
        .filter((t) => !linkedIds.has(String(t.id)))
        .map((t) => ({ value: t.id, label: optionLabel(t) })),
    [targets, linkedIds]
  );

  const selectField: FieldDef = {
    key: def.targetKey,
    label: def.targetTitle,
    type: 'select',
    required: true,
    options: targetOptions,
  };

  const doAdd = () => {
    const targetId = form[def.targetKey];
    if (!targetId) {
      toast.error(def.targetTitle + ' seçilməlidir');
      return;
    }
    setBusy('add');
    const payload: Row = { [def.selfKey]: Number(rowId), [def.targetKey]: Number(targetId) };
    (def.linkFields || []).forEach((f) => {
      if (form[f.key] !== undefined && form[f.key] !== '') payload[f.key] = form[f.key];
      if (f.type === 'checkbox') payload[f.key] = !!form[f.key];
    });

    api.create(def.resource, payload)
      .then(() => { toast.success('Bağlantı əlavə edildi'); setForm({}); setAdding(false); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əlavə olunmadı'); })
      .finally(() => setBusy(''));
  };

  // Yeni qeyd yarat + dərhal bağla
  const doCreateAndLink = () => {
    const required = (def.quickCreateFields || []).filter((f) => f.required && !newForm[f.key]);
    if (required.length) {
      toast.error('Doldurulmalıdır: ' + required.map((f) => f.label).join(', '));
      return;
    }
    setBusy('new');
    const payload: Row = {};
    (def.quickCreateFields || []).forEach((f) => {
      payload[f.key] = newForm[f.key] === '' ? null : newForm[f.key];
      if (f.type === 'checkbox') payload[f.key] = !!newForm[f.key];
    });

    api.create(def.targetResource, payload)
      .then((created: any) =>
        api.create(def.resource, { [def.selfKey]: Number(rowId), [def.targetKey]: created.id })
      )
      .then(() => { toast.success(def.targetTitle + ' yaradıldı və bağlandı'); setNewForm({}); setCreatingNew(false); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Alınmadı'); })
      .finally(() => setBusy(''));
  };

  const doRemove = (link: Row) => {
    setBusy('del' + link.id);
    api.remove(def.resource, link.id)
      .then(() => { toast.success('Bağlantı silindi'); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Silinmədi'); })
      .finally(() => setBusy(''));
  };

  const openEdit = (link: Row) => {
    const initial: Row = {};
    (def.linkFields || []).forEach((f) => { initial[f.key] = link[f.key]; });
    setEditForm(initial);
    setEditing(link);
  };

  const doEdit = () => {
    if (!editing) return;
    setBusy('edit');
    const payload: Row = {};
    (def.linkFields || []).forEach((f) => {
      payload[f.key] = editForm[f.key] === '' ? null : editForm[f.key];
      if (f.type === 'checkbox') payload[f.key] = !!editForm[f.key];
    });
    api.update(def.resource, editing.id, payload)
      .then(() => { toast.success('Yeniləndi'); setEditing(null); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yadda saxlanmadı'); })
      .finally(() => setBusy(''));
  };

  const linkCell = (link: Row, f: FieldDef) => {
    const v = link[f.key];
    if (f.type === 'checkbox') {
      return v ? <Badge text="Bəli" color="#16A34A" /> : <span className="text-[#CBD5E1]">—</span>;
    }
    if (v === null || v === undefined || v === '') return <span className="text-[#CBD5E1]">—</span>;
    if (f.type === 'select' && f.options) {
      const hit = f.options.find((o) => String(o.value) === String(v));
      return hit ? hit.label : String(v);
    }
    return String(v);
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide
      footer={<Button variant="ghost" onClick={onClose}>Bağla</Button>}
    >
      <p className="text-sm text-[#5B6577] mb-4">
        <span className="font-semibold text-[#1C2434]">{rowLabel}</span> üçün {def.targetPlural.toLowerCase()}.
      </p>

      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin" style={{ borderTopColor: color }} />
        </div>
      ) : (
        <>
          {links.length === 0 ? (
            <div className="rounded-2xl border border-[#E8E5DE] bg-[#FAF9F6]">
              <EmptyState text={def.emptyText || 'Hələ bağlantı yoxdur'} />
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-2xl border border-[#E8E5DE]">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF9F6]">
                  <tr>
                    <th className={TH_CLASS}>{def.targetTitle}</th>
                    {(def.linkFields || []).map((f) => (
                      <th key={f.key} className={TH_CLASS}>{f.label}</th>
                    ))}
                    <th className={TH_CLASS + ' w-px'} />
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id} className={TR_CLASS}>
                      <td className={TD_CLASS + ' font-medium'}>{targetName(l[def.targetKey])}</td>
                      {(def.linkFields || []).map((f) => (
                        <td key={f.key} className={TD_CLASS}>{linkCell(l, f)}</td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && (def.linkFields || []).length > 0 && (
                            <button
                              onClick={() => openEdit(l)}
                              className="p-1.5 rounded-lg text-[#5B6577] hover:bg-[#F0EEE8]"
                              title="Redaktə"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => doRemove(l)}
                              disabled={busy === 'del' + l.id}
                              className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50"
                              title="Bağlantını sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Redaktə forması */}
          {editing && (
            <div className="mt-4 rounded-2xl border border-[#E8E5DE] bg-[#FAF9F6] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[#1C2434]">
                  {targetName(editing[def.targetKey])} — bağlantı detalları
                </p>
                <button onClick={() => setEditing(null)} className="text-[#9AA3B2] hover:text-[#5B6577]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(def.linkFields || []).map((f) => (
                  <Field
                    key={f.key}
                    def={f}
                    value={editForm[f.key]}
                    onChange={(v) => setEditForm({ ...editForm, [f.key]: v })}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={doEdit} disabled={busy === 'edit'} color={color}>
                  {busy === 'edit' ? 'Saxlanılır...' : 'Yadda saxla'}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Ləğv</Button>
              </div>
            </div>
          )}

          {/* Əlavə etmə */}
          {canCreate && !adding && !creatingNew && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={() => setAdding(true)} color={color}>
                <Link2 className="w-4 h-4" />
                Mövcud {def.targetTitle.toLowerCase()} bağla
              </Button>
              {canCreateTarget && (
                <Button variant="ghost" onClick={() => setCreatingNew(true)}>
                  <UserPlus className="w-4 h-4" />
                  Yeni {def.targetTitle.toLowerCase()} yarat
                </Button>
              )}
            </div>
          )}

          {adding && (
            <div className="mt-4 rounded-2xl border border-[#E8E5DE] bg-[#FAF9F6] p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  def={selectField}
                  value={form[def.targetKey]}
                  onChange={(v) => setForm({ ...form, [def.targetKey]: v })}
                />
                {(def.linkFields || []).map((f) => (
                  <Field
                    key={f.key}
                    def={f}
                    value={form[f.key]}
                    onChange={(v) => setForm({ ...form, [f.key]: v })}
                  />
                ))}
              </div>
              {targetOptions.length === 0 && (
                <p className="text-xs text-[#9AA3B2] mt-2">
                  Bağlanacaq {def.targetTitle.toLowerCase()} qalmayıb
                  {canCreateTarget ? ' — yenisini yarada bilərsiniz.' : '.'}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <Button onClick={doAdd} disabled={busy === 'add'} color={color}>
                  <Plus className="w-4 h-4" />
                  {busy === 'add' ? 'Əlavə olunur...' : 'Bağla'}
                </Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setForm({}); }}>Ləğv</Button>
              </div>
            </div>
          )}

          {creatingNew && (
            <div className="mt-4 rounded-2xl border border-[#E8E5DE] bg-[#FAF9F6] p-4">
              <p className="text-sm font-semibold text-[#1C2434] mb-3">
                Yeni {def.targetTitle.toLowerCase()} — yaradılıb dərhal bağlanacaq
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(def.quickCreateFields || []).map((f) => (
                  <Field
                    key={f.key}
                    def={f}
                    value={newForm[f.key]}
                    onChange={(v) => setNewForm({ ...newForm, [f.key]: v })}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={doCreateAndLink} disabled={busy === 'new'} color={color}>
                  {busy === 'new' ? 'Yaradılır...' : 'Yarat və bağla'}
                </Button>
                <Button variant="ghost" onClick={() => { setCreatingNew(false); setNewForm({}); }}>Ləğv</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
