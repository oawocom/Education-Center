'use client';

import { useEffect, useState } from 'react';

// ============================================================
// Riyazi düstur render-i (KaTeX, CDN-dən bir dəfə yüklənir).
//   $...$   — sətir daxili düstur
//   $$...$$ — ayrıca sətirdə düstur
// KaTeX yüklənməyibsə mətn olduğu kimi göstərilir (xəta vermir).
// ============================================================

const KATEX_VER = '0.16.11';
let _loading: Promise<any> | null = null;

export function loadKatex(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const w = window as any;
  if (w.katex) return Promise.resolve(w.katex);
  if (_loading) return _loading;
  _loading = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/katex.min.css`;
    document.head.appendChild(link);
    const s = document.createElement('script');
    s.src = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/katex.min.js`;
    s.onload = () => resolve(w.katex || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _loading;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// text → HTML (düsturlar KaTeX ilə, qalan hissə təhlükəsiz mətn)
export function renderMathHtml(katex: any, text: string): string {
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(esc(text.slice(last, m.index)).replace(/\n/g, '<br/>'));
    const display = m[1] !== undefined;
    const src = (m[1] !== undefined ? m[1] : m[2]) || '';
    try {
      out.push(katex.renderToString(src, { displayMode: display, throwOnError: false }));
    } catch (e) {
      out.push(esc(m[0]));
    }
    last = m.index + m[0].length;
  }
  out.push(esc(text.slice(last)).replace(/\n/g, '<br/>'));
  return out.join('');
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const hasMath = /\$/.test(text || '');

  useEffect(() => {
    if (!hasMath) return;
    let alive = true;
    loadKatex().then((k) => {
      if (!alive || !k) return;
      setHtml(renderMathHtml(k, text || ''));
    });
    return () => {
      alive = false;
    };
  }, [text, hasMath]);

  if (!hasMath || html === null) return <span className={className} style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
