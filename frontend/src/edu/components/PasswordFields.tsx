'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Yeni parol + təkrarı, gücünün göstəricisi ilə. Qayda serverdəki ilə eynidir: ən azı 8 simvol.
export const MIN_PASSWORD = 8;

export function passwordIssue(pw: string, pw2: string): string {
  if (pw.length < MIN_PASSWORD) return `Parol ən azı ${MIN_PASSWORD} simvol olmalıdır`;
  if (pw !== pw2) return 'Parollar eyni deyil';
  return '';
}

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s++;
  if (pw.length >= 12) s++;
  if (/[a-zəğıöüşç]/.test(pw) && /[A-ZƏĞIİÖÜŞÇ]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9əğıöüşçƏĞIİÖÜŞÇ]/.test(pw)) s++;
  if (pw.length < MIN_PASSWORD) return { score: Math.min(s, 1), label: 'Qısadır', color: '#DC2626' };
  if (s <= 2) return { score: 2, label: 'Zəif', color: '#D97706' };
  if (s === 3) return { score: 3, label: 'Orta', color: '#CA8A04' };
  return { score: 4, label: 'Güclü', color: '#16A34A' };
}

export function PasswordFields({
  pw, pw2, setPw, setPw2, label = 'Yeni parol',
}: { pw: string; pw2: string; setPw: (v: string) => void; setPw2: (v: string) => void; label?: string }) {
  const [show, setShow] = useState(false);
  const st = strength(pw);
  const input =
    'w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]';
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          className={input + ' pr-10'}
          type={show ? 'text' : 'password'}
          required
          minLength={MIN_PASSWORD}
          placeholder={`${label} (ən azı ${MIN_PASSWORD} simvol)`}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
        />
        <button type="button" tabIndex={-1} onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {pw && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= st.score ? st.color : '#E2E8F0' }} />
            ))}
          </div>
          <span className="text-xs font-medium" style={{ color: st.color }}>{st.label}</span>
        </div>
      )}
      <input
        className={input}
        type={show ? 'text' : 'password'}
        required
        minLength={MIN_PASSWORD}
        placeholder="Parolu təkrarlayın"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        autoComplete="new-password"
      />
    </div>
  );
}
