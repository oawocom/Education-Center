'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import { ResourceDef, FieldDef, SelectOption } from '../types';
import { Modal, Button } from './ui';
import { T } from '../theme';

// ============================================================
// CSV idxalı — Excel-dən siyahı köçürmək (şagirdlər, müəllimlər ...).
// Başlıqlar formadakı sahə adları ilə eynidir (nümunə faylı endirmək olar).
// Hər sətir adi "əlavə et" kimi göndərilir: eyni yoxlamalar, eyni icazələr.
// ============================================================

// Hansı siyahılarda idxal düyməsi görünür
export const IMPORTABLE = ['students', 'teachers', 'guardians', 'branches', 'rooms', 'subjects', 'levels', 'groups', 'tuition-plans', 'skills'];

function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i').replace(/[*:]/g, '').trim();

// convert - CSV xanası → API dəyəri; uyğun gəlməsə xəta mətni
function convert(f: FieldDef, raw: string, opts: SelectOption[]): { v?: any; err?: string } {
  const s = raw.trim();
  if (s === '') return { v: null };
  switch (f.type) {
    case 'number': {
      const n = Number(s.replace(/\s/g, '').replace(',', '.'));
      return isNaN(n) ? { err: `${f.label}: "${s}" rəqəm deyil` } : { v: n };
    }
    case 'checkbox':
      return { v: ['1', 'bəli', 'beli', 'hə', 'he', 'true', 'yes', 'aktiv', 'x', '+'].indexOf(norm(s)) !== -1 };
    case 'date': {
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return { v: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00Z` };
      m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (m) return { v: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z` };
      return { err: `${f.label}: "${s}" tarix deyil (GG.AA.İİİİ)` };
    }
    case 'select':
    case 'relation': {
      const hit = opts.find((o) => norm(o.label) === norm(s) || String(o.value) === s);
      if (!hit) return { err: `${f.label}: "${s}" tapılmadı` };
      return { v: f.type === 'relation' ? Number(hit.value) : hit.value };
    }
    default:
      return { v: s };
  }
}

export default function ImportModal({
  def, relOptions, color, onClose, onDone,
}: { def: ResourceDef; relOptions: Record<string, SelectOption[]>; color: string; onClose: () => void; onDone: () => void }) {
  const fields = useMemo(() => def.fields.filter((f) => !f.readOnly && !f.hidden), [def]);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);

  const optsFor = (f: FieldDef) => (f.type === 'relation' ? relOptions[f.resource || ''] || [] : f.options || []);

  const template = () => {
    const head = fields.map((f) => f.label).join(';');
    const hint = fields
      .map((f) => {
        const o = optsFor(f);
        if (o.length) return o.slice(0, 3).map((x) => x.label).join(' / ');
        if (f.type === 'date') return '31.12.2026';
        if (f.type === 'checkbox') return 'Bəli';
        if (f.type === 'number') return '0';
        return '';
      })
      .join(';');
    const blob = new Blob(['﻿' + head + '\r\n' + hint + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = def.key + '-numune.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    setRows(parseCsv(text));
  };

  // başlıq → sahə
  const mapping = useMemo(() => {
    if (!rows || !rows.length) return [] as (FieldDef | null)[];
    return rows[0].map((h) => fields.find((f) => norm(f.label) === norm(h) || norm(f.key) === norm(h)) || null);
  }, [rows, fields]);
  const data = rows ? rows.slice(1) : [];
  const missingRequired = fields.filter((f) => f.required && mapping.indexOf(f) === -1);
  const unknown = rows && rows.length ? rows[0].filter((_, i) => !mapping[i]) : [];

  const run = async () => {
    if (!rows) return;
    setBusy(true);
    setProgress(0);
    let ok = 0;
    const errors: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const line = data[i];
      const payload: Record<string, any> = {};
      const errs: string[] = [];
      mapping.forEach((f, col) => {
        if (!f) return;
        const r = convert(f, line[col] || '', optsFor(f));
        if (r.err) errs.push(r.err);
        else payload[f.key] = r.v;
      });
      fields.forEach((f) => {
        if (f.required && (payload[f.key] === null || payload[f.key] === undefined || payload[f.key] === '')) errs.push(`${f.label} boşdur`);
      });
      if (errs.length) {
        errors.push(`Sətir ${i + 2}: ${errs.join('; ')}`);
      } else {
        try {
          await api.create(def.key, payload);
          ok++;
        } catch (e: any) {
          errors.push(`Sətir ${i + 2}: ${e?.message || 'əlavə olunmadı'}`);
          if (e?.status === 403) break;
        }
      }
      setProgress(i + 1);
    }
    setBusy(false);
    setResult({ ok, errors });
    if (ok) {
      toast.success(`${ok} qeyd əlavə edildi`);
      onDone();
    }
  };

  return (
    <Modal
      open
      wide
      title={`${def.title} — CSV-dən idxal`}
      onClose={() => { if (!busy) onClose(); }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bağla</Button>
          {rows && data.length > 0 && !result && (
            <Button color={color} onClick={run} disabled={busy || missingRequired.length > 0}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {busy ? `${progress} / ${data.length}` : `${data.length} sətri idxal et`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: T.line, background: T.bg }}>
          <p>Excel-də siyahını <b>CSV</b> kimi saxlayın (Fayl → Saxla → CSV UTF-8). Birinci sətir başlıqlardır — formadakı sahə adları ilə eyni olmalıdır.</p>
          <p className="mt-1 text-xs" style={{ color: T.inkSoft }}>Hər sətir yeni qeyd kimi əlavə olunur — eyni faylı iki dəfə idxal etsəniz, qeydlər təkrarlanar.</p>
          <button onClick={template} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color }}>
            <Download className="w-4 h-4" /> Nümunə faylı endir
          </button>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer text-sm" style={{ borderColor: T.line, color: T.inkSoft }}>
          <FileUp className="w-5 h-5" />
          {fileName || 'CSV faylını seçin'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
        </label>

        {rows && (
          <>
            {missingRequired.length > 0 && (
              <p className="text-sm px-3 py-2 rounded-lg flex items-start gap-2" style={{ background: T.badSoft, color: T.bad }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Faylda məcburi sütun yoxdur: {missingRequired.map((f) => f.label).join(', ')}
              </p>
            )}
            {unknown.length > 0 && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: T.warnSoft, color: T.warn }}>
                Tanınmayan sütunlar nəzərə alınmayacaq: {unknown.join(', ')}
              </p>
            )}
            <p className="text-sm" style={{ color: T.inkSoft }}>{data.length} sətir tapıldı. İlk 5-i:</p>
            <div className="overflow-x-auto border rounded-xl" style={{ borderColor: T.line }}>
              <table className="w-full text-xs">
                <thead style={{ background: T.bg }}>
                  <tr>
                    {rows[0].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2 whitespace-nowrap" style={{ color: mapping[i] ? T.ink : T.inkFaint }}>
                        {h}{mapping[i] ? '' : ' (?)'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: T.lineSoft }}>
                      {rows[0].map((_, j) => <td key={j} className="px-3 py-1.5 whitespace-nowrap">{r[j]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-2">
            <p className="text-sm flex items-center gap-2" style={{ color: result.ok ? T.ok : T.inkSoft }}>
              <CheckCircle2 className="w-4 h-4" /> {result.ok} qeyd əlavə edildi{result.errors.length ? `, ${result.errors.length} sətir alınmadı` : ''}.
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: T.badSoft, color: T.bad }}>
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
