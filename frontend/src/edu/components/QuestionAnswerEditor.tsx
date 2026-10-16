'use client';

import { KeyboardEvent, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { T } from '../theme';
import { MathText } from '../utils/math';
import { Label, inputStyle } from './examKit';

// ============================================================
// QuestionAnswerEditor — sual növünə görə dəyişən variant/cavab redaktoru.
//
//   mcq        → variant siyahısı + bir düzgün seçim (radio)
//   multi      → variant siyahısı + bir neçə düzgün seçim (checkbox)
//   truefalse  → "Doğru / Yanlış" seçimi
//   numeric    → {value, tolerance}
//   gap        → qəbul olunan cavab(lar) (string və ya string[])
//   open       → düzgün cavab yoxdur
//   match      → sol/sağ cütlər, düzgün cavab avtomatik hesablanır
//
// Variantlarda LaTeX ($...$) işləyir, altında önizləmə görünür.
// Dəyərlər JS dəyəri kimi saxlanılır (JSON-a çevirmə api qatındadır).
// ============================================================

interface Props {
  type: string;
  options: any;
  correctAnswer: any;
  onOptionsChange: (v: any) => void;
  onCorrectAnswerChange: (v: any) => void;
  color: string;
}

const rowStyle = { background: T.bg, border: `1px solid ${T.line}`, borderRadius: 12, padding: '8px 10px' } as const;
const addBtn = 'self-start inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border border-dashed';

function Preview({ text }: { text: string }) {
  if (!/\$/.test(text || '')) return null;
  return (
    <div className="text-sm mt-1 ml-1" style={{ color: T.inkSoft }}>
      <MathText text={text} />
    </div>
  );
}

export default function QuestionAnswerEditor({
  type, options, correctAnswer, onOptionsChange, onCorrectAnswerChange, color,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const opts: string[] = Array.isArray(options) ? options.filter((x) => typeof x === 'string') : [];

  const focusLast = (sel: string) =>
    setTimeout(() => {
      const els = wrap.current?.querySelectorAll<HTMLInputElement>(sel);
      if (els && els.length) els[els.length - 1].focus();
    }, 30);

  // ---------- mcq / multi ----------
  if (type === 'mcq' || type === 'multi') {
    const multi = type === 'multi';
    const correctList: string[] = multi
      ? (Array.isArray(correctAnswer) ? correctAnswer : [])
      : (typeof correctAnswer === 'string' && correctAnswer ? [correctAnswer] : []);

    const setOptionText = (i: number, text: string) => {
      const next = [...opts];
      const old = next[i];
      next[i] = text;
      onOptionsChange(next);
      if (old !== '' && correctList.includes(old)) {
        if (multi) onCorrectAnswerChange(Array.from(new Set(correctList.map((x) => (x === old ? text : x)))));
        else onCorrectAnswerChange(text);
      }
    };

    const toggleCorrect = (text: string) => {
      if (text === '') return;
      if (multi) {
        onCorrectAnswerChange(correctList.includes(text) ? correctList.filter((x) => x !== text) : [...correctList, text]);
      } else {
        onCorrectAnswerChange(text);
      }
    };

    const addOption = () => {
      onOptionsChange([...opts, '']);
      focusLast('input[data-opt]');
    };
    const removeOption = (i: number) => {
      const removed = opts[i];
      onOptionsChange(opts.filter((_, idx) => idx !== i));
      if (multi) onCorrectAnswerChange(correctList.filter((x) => x !== removed));
      else if (correctAnswer === removed) onCorrectAnswerChange('');
    };
    const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
      if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (i === opts.length - 1) addOption();
        else {
          const els = wrap.current?.querySelectorAll<HTMLInputElement>('input[data-opt]');
          els?.[i + 1]?.focus();
        }
      }
    };

    return (
      <div ref={wrap}>
        <Label hint={multi ? 'Düzgün olanları işarələ' : 'Düzgün variantı işarələ'}>Variantlar</Label>
        <div className="flex flex-col gap-2">
          {opts.map((o, i) => (
            <div key={i}>
              <div className="flex items-center gap-2.5" style={rowStyle}>
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name="mcq-correct"
                  checked={o !== '' && correctList.includes(o)}
                  onChange={() => toggleCorrect(o)}
                  className="w-4 h-4 shrink-0"
                  style={{ accentColor: color }}
                />
                <span className="text-xs w-4 shrink-0 font-semibold" style={{ color: T.inkFaint }}>
                  {String.fromCharCode(65 + (i % 26))}
                </span>
                <input
                  data-opt
                  value={o}
                  onChange={(e) => setOptionText(i, e.target.value)}
                  onKeyDown={(e) => onKey(e, i)}
                  placeholder={`Variant ${i + 1}  (LaTeX: $x^2$)`}
                  style={{ ...inputStyle, padding: '6px 10px', flex: 1 }}
                />
                <button type="button" aria-label="Sil" onClick={() => removeOption(i)} style={{ color: T.inkFaint }} className="shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Preview text={o} />
            </div>
          ))}
          <button type="button" onClick={addOption} className={addBtn} style={{ borderColor: T.line, color: T.inkSoft }}>
            <Plus className="w-4 h-4" /> Variant əlavə et
          </button>
        </div>
      </div>
    );
  }

  // ---------- truefalse ----------
  if (type === 'truefalse') {
    return (
      <div>
        <Label>Düzgün cavab</Label>
        <div className="flex gap-2">
          {['Doğru', 'Yanlış'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onCorrectAnswerChange(v)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition"
              style={
                correctAnswer === v
                  ? { background: color, color: '#fff', borderColor: color }
                  : { borderColor: T.line, color: T.inkSoft, background: T.surface }
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- numeric ----------
  if (type === 'numeric') {
    const ca = correctAnswer && typeof correctAnswer === 'object' && !Array.isArray(correctAnswer) ? correctAnswer : {};
    const set = (k: 'value' | 'tolerance', raw: string) => {
      const norm = raw.replace(',', '.');
      const n = norm === '' || norm === '-' || norm.endsWith('.') ? raw : Number(norm);
      onCorrectAnswerChange({ value: ca.value ?? '', tolerance: ca.tolerance ?? 0, ...ca, [k]: Number.isNaN(n as number) ? raw : n });
    };
    return (
      <div>
        <Label hint="şagirdin cavabı bu intervalda olarsa düzgün sayılır">Ədədi cavab</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs mb-1" style={{ color: T.inkSoft }}>Düzgün qiymət</div>
            <input
              data-testid="num-value"
              inputMode="decimal"
              value={ca.value ?? ''}
              onChange={(e) => set('value', e.target.value)}
              placeholder="0.25"
              style={inputStyle}
            />
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: T.inkSoft }}>Tolerantlıq (±)</div>
            <input
              data-testid="num-tol"
              inputMode="decimal"
              value={ca.tolerance ?? ''}
              onChange={(e) => set('tolerance', e.target.value)}
              placeholder="0.001"
              style={inputStyle}
            />
          </div>
        </div>
      </div>
    );
  }

  // ---------- gap ----------
  if (type === 'gap') {
    const list: string[] = Array.isArray(correctAnswer) ? correctAnswer : typeof correctAnswer === 'string' ? [correctAnswer] : [''];
    const commit = (l: string[]) => onCorrectAnswerChange(l.length === 1 ? l[0] : l);
    return (
      <div ref={wrap}>
        <Label hint="böyük/kiçik hərf və boşluqlar fərq etmir">Qəbul olunan cavab(lar)</Label>
        <div className="flex flex-col gap-2">
          {list.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                data-gap
                value={a}
                onChange={(e) => commit(list.map((x, idx) => (idx === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commit([...list, '']);
                    focusLast('input[data-gap]');
                  }
                }}
                placeholder={i === 0 ? 'Məs. went' : 'Alternativ cavab'}
                style={inputStyle}
              />
              {list.length > 1 && (
                <button type="button" aria-label="Sil" onClick={() => commit(list.filter((_, idx) => idx !== i))} style={{ color: T.inkFaint }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => { commit([...list, '']); focusLast('input[data-gap]'); }}
            className={addBtn}
            style={{ borderColor: T.line, color: T.inkSoft }}
          >
            <Plus className="w-4 h-4" /> Alternativ cavab
          </button>
        </div>
      </div>
    );
  }

  // ---------- open ----------
  if (type === 'open') {
    return (
      <div className="rounded-xl px-3.5 py-3" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
        <p className="text-sm" style={{ color: T.inkSoft }}>
          Açıq suallar avtomatik yoxlanmır — müəllim "İmtahan işləri" bölməsində balı özü verəcək.
        </p>
      </div>
    );
  }

  // ---------- match ----------
  if (type === 'match') {
    const pairs: { left: string; right: string }[] = Array.isArray(options) ? options.filter((p) => p && typeof p === 'object') : [];

    const recompute = (next: { left: string; right: string }[]) => {
      onOptionsChange(next);
      onCorrectAnswerChange(next.filter((p) => p.left && p.right).map((p) => p.left + '::' + p.right));
    };
    const setPair = (i: number, side: 'left' | 'right', val: string) =>
      recompute(pairs.map((p, idx) => (idx === i ? { ...p, [side]: val } : p)));
    const addPair = () => { recompute([...pairs, { left: '', right: '' }]); focusLast('input[data-left]'); };
    const removePair = (i: number) => recompute(pairs.filter((_, idx) => idx !== i));

    return (
      <div ref={wrap}>
        <Label hint="şagirdə sol tərəf göstərilir, sağı seçir">Uyğun cütlər</Label>
        <div className="flex flex-col gap-2">
          {pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2" style={rowStyle}>
              <input data-left value={p.left} onChange={(e) => setPair(i, 'left', e.target.value)} placeholder="Sol" style={{ ...inputStyle, padding: '6px 10px' }} />
              <span style={{ color: T.inkFaint }}>↔</span>
              <input
                value={p.right}
                onChange={(e) => setPair(i, 'right', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && i === pairs.length - 1 && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); addPair(); } }}
                placeholder="Sağ"
                style={{ ...inputStyle, padding: '6px 10px' }}
              />
              <button type="button" aria-label="Sil" onClick={() => removePair(i)} style={{ color: T.inkFaint }} className="shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addPair} className={addBtn} style={{ borderColor: T.line, color: T.inkSoft }}>
            <Plus className="w-4 h-4" /> Cüt əlavə et
          </button>
        </div>
      </div>
    );
  }

  return null;
}
