'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Archive, ArchiveRestore, ChevronLeft, ChevronRight,
  Link2, Heart, Users, BookOpen, CheckCircle2, Wand2, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, can, getUser, ListParams } from '../utils/api';
import { ResourceDef, ColumnDef, SelectOption, RowActionDef, ToolbarActionDef } from '../types';
import { ScreenMeta } from '../screens';
import { Modal, Button, EmptyState, ErrorState, Badge, Field } from './ui';
import LinkManager from './LinkManager';
import LinksScreen from './LinksScreen';
import GroupsScreen from './GroupsScreen';
import QuestionAnswerEditor from './QuestionAnswerEditor';
import AttendanceBoard from './AttendanceBoard';
import ResultsScreen from './ResultsScreen';
import SkillsScreen from './SkillsScreen';
import AchievementsScreen from './AchievementsScreen';
import AvailabilityGrid from './AvailabilityGrid';
import ExamListScreen from './ExamListScreen';
import ExamBuilderScreen from './ExamBuilder';
import {
  ScreenHeader, StatCards, PrincipleNote, TableShell,
  TH_CLASS, TD_CLASS, TR_CLASS,
} from './screen';

const ACTION_ICONS: Record<string, any> = {
  link: Link2,
  heart: Heart,
  users: Users,
  book: BookOpen,
  check: CheckCircle2,
  wand: Wand2,
};

// ============================================================
// LinkPicker — forma içində çoxdan-çoxa seçim
//
// Sistemdə mövcud qeydlərdən (məs. valideynlər) çoxunu seçmək üçün
// axtarışlı çoxseçim. Seçim qeyd saxlananda ara cədvələ yazılır.
// ============================================================

function LinkPicker({
  label, title, options, selected, loading, color, onToggle,
}: {
  label: string;
  title: string;
  options: SelectOption[];
  selected: number[];
  loading?: boolean;
  color: string;
  onToggle: (id: number) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = term
    ? options.filter((o) => String(o.label).toLowerCase().includes(term))
    : options;

  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-semibold text-[#1C2434] mb-1.5">
        {label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs font-medium text-[#5B6577]">({selected.length} seçilib)</span>
        )}
      </label>

      {loading ? (
        <div className="rounded-xl border border-[#E8E5DE] p-3 text-sm text-[#9AA3B2]">Yüklənir...</div>
      ) : options.length === 0 ? (
        <div className="rounded-xl border border-[#E8E5DE] bg-[#FAF9F6] p-3 text-sm text-[#9AA3B2]">
          Sistemdə {title.toLowerCase()} yoxdur. Əvvəlcə əlavə edin.
        </div>
      ) : (
        <div className="rounded-xl border border-[#E8E5DE] overflow-hidden">
          {options.length > 6 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Axtar..."
              className="w-full px-3 py-2 text-sm border-b border-[#E8E5DE] focus:outline-none"
            />
          )}
          <div className="max-h-44 overflow-y-auto p-1">
            {shown.map((o) => {
              const id = Number(o.value);
              const on = selected.includes(id);
              return (
                <label
                  key={String(o.value)}
                  className={
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-sm ' +
                    (on ? 'bg-[#F0EEE8]' : 'hover:bg-[#FAF9F6]')
                  }
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(id)}
                    className="w-4 h-4 rounded border-[#CBD5E1]"
                    style={{ accentColor: color }}
                  />
                  <span className="text-[#1C2434]">{o.label}</span>
                </label>
              );
            })}
            {shown.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-[#9AA3B2]">Tapılmadı</p>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-[#9AA3B2] mt-1">
        Sistemdə mövcud {title.toLowerCase()} qeydlərindən seçin. Qohumluq və əsas əlaqə üçün sətirdəki “{label}” düyməsindən istifadə edin.
      </p>
    </div>
  );
}

// ============================================================
// GenericCrudPage — resurs tərifindən ekran qurur.
// Tərtibat CMS dizaynı ilə eynidir: başlıq → stat kartları →
// filtrlər → cədvəl → prinsip qeydi.
//
// Bu, hər resurs üçün İŞLƏYƏN standart görünüşdür. Bəzi resurslar
// üçün daha uyğun, əlyazma hazırlanmış ekranlar aşağıdakı `CrudPage`
// dispetçeri tərəfindən onun yerinə seçilir (bax fayl sonu).
// ============================================================

interface Props {
  def: ResourceDef;
  meta?: ScreenMeta | null;
  color?: string;
  fixedFilters?: Record<string, string | number>;
}

type Row = Record<string, any>;

function GenericCrudPage({ def, meta, color = '#2F5BEA', fixedFilters }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = def.perPage || 25;

  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  // Sətir və toolbar əməliyyatları
  const [linkFor, setLinkFor] = useState<{ action: RowActionDef; row: Row } | null>(null);
  const [runAction, setRunAction] = useState<
    { kind: 'row'; action: RowActionDef; row: Row } | { kind: 'toolbar'; action: ToolbarActionDef } | null
  >(null);
  const [actionForm, setActionForm] = useState<Row>({});
  const [running, setRunning] = useState(false);

  // Forma içindəki çoxdan-çoxa seçimlər (məs. şagird → valideynlər)
  const inlineLinks = def.inlineLinks || [];
  const ilKey = (il: { resource: string; targetKey: string }) => il.resource + ':' + il.targetKey;
  // seçilmiş qarşı-tərəf id-ləri
  const [linkSel, setLinkSel] = useState<Record<string, number[]>>({});
  // mövcud ara-cədvəl sətirləri {id, targetId} — silmək üçün lazımdır
  const [linkRows, setLinkRows] = useState<Record<string, { id: number; targetId: number }[]>>({});

  // --- Resurs dəyişəndə ekranı sıfırla ---
  // Panel eyni komponenti başqa resursla təkrar istifadə edir;
  // köhnə səhifə nömrəsi, filtr və sətirlər yeni resursa keçməməlidir.
  const resetKey = useRef(def.key);
  if (resetKey.current !== def.key) {
    resetKey.current = def.key;
    // render zamanı state sıfırlanması — React bunu dəstəkləyir
    setRows([]);
    setTotal(0);
    setPage(1);
    setQ('');
    setQInput('');
    setFilters({});
    setShowArchived(false);
    setLoading(true);
    setError('');
    setEditing(null);
    setDeleting(null);
    setLinkFor(null);
    setRunAction(null);
    setLinkSel({});
    setLinkRows({});
  }

  // --- Əlaqəli resurslar ---
  const relResources = useMemo(() => {
    const set = new Set<string>();
    def.columns.forEach((c) => { if (c.type === 'relation' && c.resource) set.add(c.resource); });
    def.fields.forEach((f) => { if (f.type === 'relation' && f.resource) set.add(f.resource); });
    (def.filters || []).forEach((f) => { if (f.type === 'relation' && f.resource) set.add(f.resource); });
    (def.toolbarActions || []).forEach((a) =>
      (a.fields || []).forEach((f) => { if (f.type === 'relation' && f.resource) set.add(f.resource); })
    );
    (def.rowActions || []).forEach((a) =>
      (a.endpoint?.fields || []).forEach((f) => { if (f.type === 'relation' && f.resource) set.add(f.resource); })
    );
    (def.inlineLinks || []).forEach((il) => set.add(il.targetResource));
    return Array.from(set);
  }, [def]);

  // Bəzi resursların "ad" sahəsi yoxdur (məs. suallar — "text").
  // labelKey verilibsə ONU İSTİFADƏ ET, yoxsa adi ehtimal siyahısına düş.
  const relLabelKeys = useMemo(() => {
    const map: Record<string, string> = {};
    const consider = (resource?: string, labelKey?: string) => {
      if (resource && labelKey && !map[resource]) map[resource] = labelKey;
    };
    def.columns.forEach((c) => { if (c.type === 'relation') consider(c.resource, c.labelKey); });
    def.fields.forEach((f) => { if (f.type === 'relation') consider(f.resource, f.labelKey); });
    (def.filters || []).forEach((f) => { if (f.type === 'relation') consider(f.resource, f.labelKey); });
    return map;
  }, [def]);

  const [relOptions, setRelOptions] = useState<Record<string, SelectOption[]>>({});
  const [relLoading, setRelLoading] = useState(false);
  const relLoaded = useRef('');

  useEffect(() => {
    const sig = relResources.join(',');
    if (relLoaded.current === sig || relResources.length === 0) return;
    relLoaded.current = sig;
    setRelLoading(true);

    Promise.all(
      relResources.map((res) =>
        api.list(res, { per_page: 500 })
          .then((r) => ({ res, items: r.data || [] }))
          .catch(() => ({ res, items: [] as any[] }))
      )
    )
      .then((results) => {
        const map: Record<string, SelectOption[]> = {};
        results.forEach(({ res, items }) => {
          const lk = relLabelKeys[res];
          const short = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s);
          map[res] = items.map((it: any) => ({
            value: it.id,
            label: (lk && it[lk] && short(String(it[lk]))) || it.name || it.title || it.topic || it.label || `#${it.id}`,
          }));
        });
        setRelOptions(map);
      })
      .finally(() => setRelLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relResources]);

  const relLabel = (resource: string | undefined, id: any): string => {
    if (!resource || id === null || id === undefined || id === '') return '—';
    const opts = relOptions[resource] || [];
    const hit = opts.find((o) => String(o.value) === String(id));
    return hit ? hit.label : `#${id}`;
  };

  // --- Siyahı ---
  // fixedFilters valideyn komponentdə hər render-də yeni obyekt kimi
  // yarana bilər; onu məzmununa görə sabitləşdiririk ki, useCallback
  // sonsuz yüklənmə dövrəsinə düşməsin.
  const fixedKey = JSON.stringify(fixedFilters || {});

  const load = useCallback(() => {
    setLoading(true);
    setError('');

    const params: ListParams = { page, per_page: perPage };
    if (q) params.q = q;
    if (showArchived) params.archived = '1';
    Object.keys(filters).forEach((k) => { if (filters[k]) params[k] = filters[k]; });
    const fixed = JSON.parse(fixedKey) as Record<string, string | number>;
    Object.keys(fixed).forEach((k) => { params[k] = fixed[k]; });

    api.list(def.key, params)
      .then((res) => { setRows(res.data || []); setTotal(res.total || 0); })
      .catch((e) => setError(e?.message || 'Yüklənmə xətası'))
      .finally(() => setLoading(false));
  }, [def.key, page, perPage, q, filters, showArchived, fixedKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  // --- Form ---
  const openCreate = () => {
    const initial: Row = {};
    def.fields.forEach((f) => { if (f.type === 'checkbox') initial[f.key] = false; });
    if (fixedFilters) Object.assign(initial, fixedFilters);
    setForm(initial);
    const sel: Record<string, number[]> = {};
    inlineLinks.forEach((il) => { sel[ilKey(il)] = []; });
    setLinkSel(sel);
    setLinkRows({});
    setEditing({});
  };

  const openEdit = (row: Row) => {
    const initial: Row = {};
    def.fields.forEach((f) => { initial[f.key] = row[f.key]; });
    setForm(initial);
    setEditing(row);

    // Mövcud çoxdan-çoxa bağlantıları yüklə
    setLinkSel({});
    setLinkRows({});
    if (inlineLinks.length && row.id) {
      Promise.all(
        inlineLinks.map((il) =>
          api.list(il.resource, { [il.selfKey]: String(row.id), per_page: 300 } as any)
            .then((r) => ({ il, items: r.data || [] }))
            .catch(() => ({ il, items: [] as any[] }))
        )
      ).then((results) => {
        const sel: Record<string, number[]> = {};
        const rows: Record<string, { id: number; targetId: number }[]> = {};
        results.forEach(({ il, items }) => {
          const k = ilKey(il);
          rows[k] = items.map((x: any) => ({ id: x.id, targetId: Number(x[il.targetKey]) }));
          sel[k] = items.map((x: any) => Number(x[il.targetKey]));
        });
        setLinkSel(sel);
        setLinkRows(rows);
      });
    }
  };

  // Qeyd saxlandıqdan sonra ara cədvəlləri seçimlə uyğunlaşdır
  const syncLinks = (savedId: number): Promise<any> => {
    const ops: Promise<any>[] = [];
    inlineLinks.forEach((il) => {
      const k = ilKey(il);
      const sel = linkSel[k] || [];
      const rows = linkRows[k] || [];
      const existing = rows.map((r) => r.targetId);
      sel.filter((id) => !existing.includes(id)).forEach((id) => {
        ops.push(api.create(il.resource, { [il.selfKey]: savedId, [il.targetKey]: id }).catch(() => {}));
      });
      rows.filter((r) => !sel.includes(r.targetId)).forEach((r) => {
        ops.push(api.remove(il.resource, r.id).catch(() => {}));
      });
    });
    return Promise.all(ops);
  };

  const toggleLink = (k: string, id: number) => {
    setLinkSel((prev) => {
      const cur = prev[k] || [];
      return { ...prev, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const save = () => {
    const missing = def.fields.filter((f) => f.required && !f.readOnly && !form[f.key]);
    if (missing.length) {
      toast.error(`Doldurulmalıdır: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }

    const payload: Row = {};
    def.fields.forEach((f) => {
      if (f.readOnly) return;
      payload[f.key] = form[f.key] === '' ? null : form[f.key];
    });

    setSaving(true);
    const isNew = !editing || !editing.id;
    const req = isNew ? api.create(def.key, payload) : api.update(def.key, editing!.id, payload);

    req
      .then((saved: any) => {
        const savedId = Number((saved && saved.id) || (editing && editing.id));
        const after = inlineLinks.length && savedId ? syncLinks(savedId) : Promise.resolve();
        return after.then(() => {
          toast.success(isNew ? 'Əlavə edildi' : 'Yadda saxlanıldı');
          setEditing(null);
          load();
        });
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Yadda saxlanmadı'); })
      .finally(() => setSaving(false));
  };

  const doDelete = () => {
    if (!deleting) return;
    api.remove(def.key, deleting.id)
      .then(() => { toast.success('Silindi'); setDeleting(null); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Silinmədi'); setDeleting(null); });
  };

  const toggleArchive = (row: Row) => {
    api.archive(def.key, row.id, !!row.is_archived)
      .then(() => { toast.success(row.is_archived ? 'Arxivdən çıxarıldı' : 'Arxivləndi'); load(); })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əməliyyat alınmadı'); });
  };

  // --- Sətir / toolbar əməliyyatları ---

  const rowLabel = (row: Row): string =>
    row.name || row.title || row.applicant_name || row.topic || `#${row.id}`;

  const actionAllowed = (perm?: { resource: string; action: string }) =>
    !perm || can(perm.resource, perm.action);

  const rowActionVisible = (a: RowActionDef, row: Row) => {
    if (!actionAllowed(a.perm)) return false;
    if (a.when) {
      for (const k of Object.keys(a.when)) {
        if (String(row[k]) !== String(a.when[k])) return false;
      }
    }
    return true;
  };

  const visibleRowActions = (row: Row) => (def.rowActions || []).filter((a) => rowActionVisible(a, row));

  const openRowAction = (action: RowActionDef, row: Row) => {
    if (action.kind === 'link' && action.link) {
      setLinkFor({ action, row });
      return;
    }
    const initial: Row = {};
    (action.endpoint?.fields || []).forEach((f) => { if (f.type === 'checkbox') initial[f.key] = false; });
    setActionForm(initial);
    setRunAction({ kind: 'row', action, row });
  };

  const openToolbarAction = (action: ToolbarActionDef) => {
    const initial: Row = {};
    (action.fields || []).forEach((f) => { if (f.type === 'checkbox') initial[f.key] = false; });
    setActionForm(initial);
    setRunAction({ kind: 'toolbar', action });
  };

  const executeAction = () => {
    if (!runAction) return;

    const isRow = runAction.kind === 'row';
    const ep = isRow ? (runAction as any).action.endpoint : (runAction as any).action;
    if (!ep) return;

    const fields = (isRow ? ep.fields : (runAction as any).action.fields) || [];
    const missing = fields.filter((f: any) => f.required && !actionForm[f.key]);
    if (missing.length) {
      toast.error('Doldurulmalıdır: ' + missing.map((m: any) => m.label).join(', '));
      return;
    }

    const payload: Row = {};
    fields.forEach((f: any) => { payload[f.key] = actionForm[f.key] === '' ? null : actionForm[f.key]; });
    if (isRow) {
      const r = (runAction as any).row as Row;
      payload[ep.idKey || 'id'] = r.id;
    }

    setRunning(true);
    api
      .raw(isRow ? ep.path : (runAction as any).action.path, {
        method: (isRow ? ep.method : (runAction as any).action.method) || 'POST',
        body: JSON.stringify(payload),
      })
      .then((res: any) => {
        const base = (isRow ? ep.successText : (runAction as any).action.successText) || 'Əməliyyat tamamlandı';
        const n = res && (res.created ?? res.count);
        toast.success(typeof n === 'number' ? `${base} — ${n} qeyd` : base);
        setRunAction(null);
        load();
      })
      .catch((e) => { if (e?.status !== 403) toast.error(e?.message || 'Əməliyyat alınmadı'); })
      .finally(() => setRunning(false));
  };

  const actionModalFields = (): any[] => {
    if (!runAction) return [];
    return runAction.kind === 'row'
      ? (runAction.action.endpoint?.fields || [])
      : (runAction.action.fields || []);
  };

  const visibleToolbarActions = (def.toolbarActions || []).filter((a) => actionAllowed(a.perm));

  // --- Xana ---
  const cell = (row: Row, col: ColumnDef) => {
    const v = row[col.key];
    if (v === null || v === undefined || v === '') return <span className="text-[#CBD5E1]">—</span>;

    switch (col.type) {
      case 'bool':
        return <Badge text={v ? 'Bəli' : 'Xeyr'} color={v ? '#16A34A' : '#9AA3B2'} />;
      case 'badge': {
        const text = (col.map && col.map[v]) || String(v);
        return <Badge text={text} color={col.badgeColors && col.badgeColors[v]} />;
      }
      case 'date':
        return new Date(v).toLocaleDateString('az-AZ');
      case 'money':
        return Number(v).toLocaleString('az-AZ', { minimumFractionDigits: 2 });
      case 'relation':
        return relLabel(col.resource, v);
      case 'number':
        return Number(v).toLocaleString('az-AZ');
      default:
        return (col.map && col.map[v]) || String(v);
    }
  };

  // --- CSV ixracı: cari axtarış və filtrlərlə bütün sətirlər (Excel-də açılır) ---
  const [exporting, setExporting] = useState(false);
  const cellText = (row: Row, col: ColumnDef): string => {
    const v = row[col.key];
    if (v === null || v === undefined || v === '') return '';
    switch (col.type) {
      case 'bool':
        return v ? 'Bəli' : 'Xeyr';
      case 'badge':
        return (col.map && col.map[v]) || String(v);
      case 'date':
        return new Date(v).toLocaleDateString('az-AZ');
      case 'money':
      case 'number':
        return String(v).replace('.', ',');
      case 'relation': {
        const l = relLabel(col.resource, v);
        return typeof l === 'string' ? l : String(v);
      }
      default:
        return (col.map && col.map[v]) || (typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params: ListParams = { per_page: 500 };
      if (q) params.q = q;
      if (showArchived) params.archived = '1';
      Object.keys(filters).forEach((k) => { if (filters[k]) params[k] = filters[k]; });
      const fixed = JSON.parse(fixedKey) as Record<string, string | number>;
      Object.keys(fixed).forEach((k) => { params[k] = fixed[k]; });
      let all: Row[] = [];
      for (let p = 1; p <= 40; p++) {
        const res = await api.list(def.key, { ...params, page: p });
        all = all.concat(res.data || []);
        if (all.length >= (res.total || 0) || !(res.data || []).length) break;
      }
      const quote = (x: string) => (/[";\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x);
      const lines = [def.columns.map((c) => quote(c.label)).join(';')];
      all.forEach((r) => lines.push(def.columns.map((c) => quote(cellText(r, c))).join(';')));
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = def.key + '-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(all.length + ' sətir ixrac edildi');
    } catch (e: any) {
      if (e?.status !== 403) toast.error(e?.message || 'İxrac alınmadı');
    } finally {
      setExporting(false);
    }
  };

  const canCreate = can(def.key, 'create') && !def.readOnly;
  const canUpdate = can(def.key, 'update') && !def.readOnly;
  const canDelete = can(def.key, 'delete') && !def.readOnly;
  const hasRowActions = (def.rowActions || []).length > 0;
  const showActions = canUpdate || canDelete || hasRowActions;
  const pages = Math.max(1, Math.ceil(total / perPage));

  const hasToolbar =
    total > 0 ||
    def.searchable ||
    (def.filters && def.filters.length > 0) ||
    def.archivable ||
    canCreate ||
    visibleToolbarActions.length > 0;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <ScreenHeader h1={meta?.h1 || def.title} sub={meta?.sub || def.description} />
      </div>

      {meta?.stats && meta.stats.length > 0 && <StatCards stats={meta.stats} color={color} />}

      {hasToolbar && (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-3 flex flex-wrap gap-2 items-center">
          {def.searchable && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9AA3B2]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Axtar..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E8E5DE] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5BEA]/25"
              />
            </div>
          )}

          {(def.filters || []).map((f) => {
            const opts = f.type === 'relation' ? relOptions[f.resource || ''] || [] : f.options || [];
            return (
              <select
                key={f.key}
                value={filters[f.key] || ''}
                onChange={(e) => { setPage(1); setFilters({ ...filters, [f.key]: e.target.value }); }}
                className="px-3 py-2 rounded-xl border border-[#E8E5DE] text-sm bg-white focus:outline-none"
              >
                <option value="">{f.label}: hamısı</option>
                {opts.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                ))}
              </select>
            );
          })}

          {def.archivable && (
            <label className="flex items-center gap-2 text-sm text-[#5B6577] px-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => { setPage(1); setShowArchived(e.target.checked); }}
                className="w-4 h-4 rounded border-[#CBD5E1]"
              />
              Arxiv
            </label>
          )}

          <div className="ml-auto flex flex-wrap gap-2 items-center">
            {total > 0 && (
              <Button variant="ghost" onClick={exportCsv} disabled={exporting}>
                <Download className="w-4 h-4" />
                {exporting ? 'Hazırlanır…' : 'Excel (CSV)'}
              </Button>
            )}
            {visibleToolbarActions.map((a) => (
              <Button key={a.key} variant="ghost" onClick={() => openToolbarAction(a)}>
                <Wand2 className="w-4 h-4" />
                {a.label}
              </Button>
            ))}
            {canCreate && (
              <Button onClick={openCreate} color={color}>
                <Plus className="w-4 h-4" />
                {def.titleSingular}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cədvəl */}
      {error ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] p-4">
          <ErrorState text={error} />
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE] py-12 flex justify-center">
          <div
            className="w-6 h-6 rounded-full border-2 border-[#E8E5DE] animate-spin"
            style={{ borderTopColor: color }}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E5DE]">
          <EmptyState />
        </div>
      ) : (
        <TableShell>
          <thead className="bg-[#FAF9F6]">
            <tr>
              {def.columns.map((c) => (
                <th key={c.key} className={TH_CLASS} style={{ textAlign: c.align || 'left' }}>
                  {c.label}
                </th>
              ))}
              {showActions && <th className={TH_CLASS + ' w-px'} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TR_CLASS + ' hover:bg-[#FAF9F6] transition-colors'}>
                {def.columns.map((c) => (
                  <td key={c.key} className={TD_CLASS} style={{ textAlign: c.align || 'left' }}>
                    {cell(row, c)}
                  </td>
                ))}
                {showActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {visibleRowActions(row).map((a) => {
                        const Icon = ACTION_ICONS[a.icon || 'link'] || Link2;
                        return (
                          <button
                            key={a.key}
                            onClick={() => openRowAction(a, row)}
                            className="px-2 py-1.5 rounded-lg text-[#5B6577] hover:bg-[#F0EEE8] inline-flex items-center gap-1 text-xs font-semibold"
                            title={a.label}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="hidden lg:inline">{a.label}</span>
                          </button>
                        );
                      })}
                      {canUpdate && (
                        <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-[#5B6577] hover:bg-[#F0EEE8]" title="Redaktə">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {def.archivable && canUpdate && (
                        <button onClick={() => toggleArchive(row)} className="p-1.5 rounded-lg text-[#5B6577] hover:bg-[#F0EEE8]" title={row.is_archived ? 'Arxivdən çıxar' : 'Arxivlə'}>
                          {row.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleting(row)} className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {total > perPage && (
        <div className="flex items-center justify-between text-sm text-[#5B6577]">
          <span>{total} qeyd · səhifə {page}/{pages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg border border-[#E8E5DE] bg-white disabled:opacity-40 hover:bg-[#F0EEE8]">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg border border-[#E8E5DE] bg-white disabled:opacity-40 hover:bg-[#F0EEE8]">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {meta?.note && <PrincipleNote note={meta.note} color={color} />}

      {/* Əlavə / redaktə */}
      <Modal
        open={!!editing}
        title={editing && editing.id ? `${def.titleSingular} — redaktə` : `Yeni ${def.titleSingular.toLowerCase()}`}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Ləğv et</Button>
            <Button onClick={save} disabled={saving} color={color}>
              {saving ? 'Saxlanılır...' : 'Yadda saxla'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {def.fields.filter((f) => !f.hidden).map((f) => (
            <Field
              key={f.key}
              def={f}
              value={form[f.key]}
              onChange={(v) => setForm({ ...form, [f.key]: v })}
              options={f.type === 'relation' ? relOptions[f.resource || ''] : undefined}
              loading={f.type === 'relation' && relLoading}
            />
          ))}

          {/* Sual növünə görə dəyişən variant/cavab redaktoru (yalnız "questions") */}
          {def.key === 'questions' && (
            <div className="sm:col-span-2"><QuestionAnswerEditor
              type={form.type || 'mcq'}
              options={form.options}
              correctAnswer={form.correct_answer}
              onOptionsChange={(v) => setForm({ ...form, options: v })}
              onCorrectAnswerChange={(v) => setForm({ ...form, correct_answer: v })}
              color={color}
            /></div>
          )}

          {/* Forma içindəki çoxdan-çoxa seçimlər (məs. Valideynlər) */}
          {inlineLinks
            .filter((il) => can(il.resource, 'read'))
            .map((il) => {
              const k = ilKey(il);
              const opts = relOptions[il.targetResource] || [];
              const sel = linkSel[k] || [];
              return (
                <LinkPicker
                  key={k}
                  label={il.label || il.targetPlural}
                  title={il.targetTitle}
                  options={opts}
                  selected={sel}
                  loading={relLoading}
                  color={color}
                  onToggle={(id) => toggleLink(k, id)}
                />
              );
            })}
        </div>
      </Modal>

      {/* Silmə */}
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
          Bu qeyd birdəfəlik silinəcək. Bu əməliyyat geri qaytarıla bilməz.
          {def.archivable && ' Silmək əvəzinə arxivləmək daha təhlükəsizdir.'}
        </p>
      </Modal>

      {/* Bağlantı idarəçisi (şagird ↔ valideyn və s.) */}
      {linkFor && linkFor.action.link && (
        <LinkManager
          open={!!linkFor}
          onClose={() => setLinkFor(null)}
          def={linkFor.action.link}
          rowId={linkFor.row.id}
          rowLabel={rowLabel(linkFor.row)}
          title={linkFor.action.label}
          color={color}
        />
      )}

      {/* Əməliyyat modalı (toplu və sətir əməliyyatları) */}
      <Modal
        open={!!runAction}
        title={runAction ? runAction.action.label : ''}
        onClose={() => setRunAction(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRunAction(null)}>Ləğv et</Button>
            <Button onClick={executeAction} disabled={running} color={color}>
              {running ? 'İcra olunur...' : 'İcra et'}
            </Button>
          </>
        }
      >
        {runAction && (
          <>
            <p className="text-sm text-[#5B6577] mb-4">
              {runAction.kind === 'toolbar'
                ? runAction.action.description
                : runAction.action.endpoint?.confirmText}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {actionModalFields().map((f: any) => (
                <Field
                  key={f.key}
                  def={f}
                  value={actionForm[f.key]}
                  onChange={(v) => setActionForm({ ...actionForm, [f.key]: v })}
                  options={f.type === 'relation' ? relOptions[f.resource || ''] : undefined}
                  loading={f.type === 'relation' && relLoading}
                />
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

// ============================================================
// CrudPage — naviqasiyanın çağırdığı YEGANƏ giriş nöqtəsi.
//
// Bəzi resurslar üçün əlyazma hazırlanmış, generic cədvəldən daha
// uyğun ekranlar var: davamiyyət lövhəsi, bacarıq profili,
// nailiyyətlər, boş saatlar, bacarıq sütunlu nəticələr. Bu
// dispetçer resurs açarına (və lazım olduqda rola) görə düzgün
// ekranı seçir, qalan hər şey üçün isə generic cədvələ (yuxarıda)
// keçir.
//
// İKİ RESURS BÜTÜN ROLLAR ARASINDA PAYLAŞILIR, amma məzmunu tamam
// fərqlidir — ona görə tək açar kifayət etmir, rol da yoxlanılır:
//   - attendance         → admin/müəllim: qeyd lövhəsi (yaza bilir)
//                           şagird/valideyn: generic cədvəl
//                           (backend özü öz qeydlərinə daraldır)
//   - exam-submissions   → admin/müəllim: qiymətləndirmə cədvəli (generic)
//                           şagird/valideyn: bacarıq sütunlu nəticə ekranı
// ============================================================

export default function CrudPage(props: Props) {
  const { def, meta, color = '#2F5BEA' } = props;
  const role = getUser()?.role;
  const safeMeta: ScreenMeta = meta || { h1: def.title, sub: def.description || '' };

  if (def.key === 'links' || def.key === 'student-guardians') {
    return <LinksScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'groups' && (role === 'admin' || role === 'teacher')) {
    return <GroupsScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'attendance' && (role === 'admin' || role === 'teacher')) {
    return <AttendanceBoard meta={safeMeta} color={color} />;
  }

  if (def.key === 'exams' && (role === 'admin' || role === 'teacher')) {
    return <ExamBuilderScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'exams' && role === 'student') {
    return <ExamListScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'exam-submissions' && (role === 'student' || role === 'guardian')) {
    return <ResultsScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'skill-scores') {
    return <SkillsScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'student-achievements') {
    return <AchievementsScreen meta={safeMeta} color={color} />;
  }

  if (def.key === 'teacher-availability') {
    return <AvailabilityGrid meta={safeMeta} color={color} />;
  }

  return <GenericCrudPage {...props} />;
}
