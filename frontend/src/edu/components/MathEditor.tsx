'use client';

import { KeyboardEvent, useRef } from 'react';
import { T } from '../theme';
import { MathText } from '../utils/math';
import { inputStyle } from './examKit';

// ============================================================
// MathEditor — mətn sahəsi + LaTeX snippet alət çubuğu + canlı önizləmə.
// $...$ sətir daxili, $$...$$ ayrıca sətirdə düstur. Alət çubuğu
// düyməsi kursor $ işarələrinin içində deyilsə, snippet-i $...$ ilə bükür.
// ============================================================

// § işarəsi kursorun qalacağı yerdir
const SNIPPETS: { l: string; t: string; title: string }[] = [
  { l: 'a⁄b', t: '\\frac{§}{}', title: 'Kəsr' },
  { l: '√', t: '\\sqrt{§}', title: 'Kök' },
  { l: 'xⁿ', t: '^{§}', title: 'Qüvvət' },
  { l: 'xₙ', t: '_{§}', title: 'İndeks' },
  { l: 'Σ', t: '\\sum_{i=1}^{n} §', title: 'Cəm' },
  { l: '∫', t: '\\int_{a}^{b} § \\, dx', title: 'İnteqral' },
  { l: 'lim', t: '\\lim_{x \\to §}', title: 'Limit' },
  { l: '[ ]', t: '\\begin{pmatrix} § & \\\\ & \\end{pmatrix}', title: 'Matris' },
  { l: 'π', t: '\\pi', title: 'pi' },
  { l: 'α', t: '\\alpha', title: 'alfa' },
  { l: 'β', t: '\\beta', title: 'beta' },
  { l: 'θ', t: '\\theta', title: 'teta' },
  { l: 'λ', t: '\\lambda', title: 'lambda' },
  { l: 'Δ', t: '\\Delta', title: 'Delta' },
  { l: 'ω', t: '\\omega', title: 'omeqa' },
  { l: '≤', t: '\\leq', title: 'Kiçik və ya bərabər' },
  { l: '≥', t: '\\geq', title: 'Böyük və ya bərabər' },
  { l: '≠', t: '\\neq', title: 'Bərabər deyil' },
  { l: '±', t: '\\pm', title: 'Artı-mənfi' },
  { l: '∞', t: '\\infty', title: 'Sonsuzluq' },
];

export default function MathEditor({
  value, onChange, rows = 3, placeholder, autoFocus, onKeyDown, textareaId,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (tex: string) => {
    const ta = ref.current;
    const v = value || '';
    const s = ta ? ta.selectionStart : v.length;
    const e = ta ? ta.selectionEnd : v.length;
    const before = v.slice(0, s);
    const selected = v.slice(s, e);
    const dollars = (before.match(/\$/g) || []).length;
    const inside = dollars % 2 === 1;
    let body = tex.replace('§', selected || '§');
    const caretIn = body.indexOf('§');
    body = body.replace('§', '');
    const pre = inside ? '' : '$';
    const post = inside ? '' : '$';
    const out = before + pre + body + post + v.slice(e);
    const caret = caretIn >= 0 ? before.length + pre.length + caretIn : before.length + pre.length + body.length + post.length;
    onChange(out);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(caret, caret);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {SNIPPETS.map((s) => (
          <button
            key={s.title}
            type="button"
            title={s.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(s.t)}
            className="min-w-[30px] h-7 px-1.5 rounded-lg text-[13px] transition-colors"
            style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.inkSoft }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentSoft; e.currentTarget.style.color = T.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.inkSoft; }}
          >
            {s.l}
          </button>
        ))}
      </div>
      <textarea
        id={textareaId}
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
      />
      {/\$/.test(value || '') && (
        <div
          className="mt-2 rounded-xl px-3.5 py-3 text-[15px]"
          style={{ background: T.bg, border: `1px dashed ${T.line}`, color: T.ink }}
        >
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: T.inkFaint }}>Önizləmə</div>
          <MathText text={value} />
        </div>
      )}
    </div>
  );
}
