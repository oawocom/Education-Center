'use client';

import { DragEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Music, Upload, X, Loader2 } from 'lucide-react';
import { T } from '../theme';
import { MediaItem, mediaUrl, uploadMedia } from '../utils/api';

// ============================================================
// MediaPicker — suala bir neçə şəkil / audio əlavə et.
// Yükləmə düyməsi + sürüklə-burax, önizləmə, silmə.
// ============================================================

export default function MediaPicker({ value, onChange }: { value: MediaItem[]; onChange: (v: MediaItem[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^(image|audio)\//.test(f.type) || /\.(png|jpe?g|gif|webp|mp3|wav|ogg|m4a)$/i.test(f.name));
    if (list.length === 0) {
      toast.error('Yalnız şəkil və ya audio faylı yükləyin');
      return;
    }
    setBusy((b) => b + list.length);
    for (const f of list) {
      try {
        const m = await uploadMedia(f);
        const next = [...valueRef.current, { type: m.type, token: m.token, name: m.name || f.name }];
        valueRef.current = next;
        onChange(next);
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message || 'yüklənmədi'}`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className="rounded-xl px-4 py-3.5 flex items-center gap-3 flex-wrap"
        style={{
          border: `1px dashed ${over ? T.accent : T.line}`,
          background: over ? T.accentSoft : T.bg,
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.ink }}
        >
          {busy > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Şəkil / audio yüklə
        </button>
        <span className="text-xs" style={{ color: T.inkFaint }}>və ya faylı bura sürüklə</span>
        <input
          ref={inputRef}
          data-testid="media-input"
          type="file"
          multiple
          accept="image/*,audio/*"
          className="hidden"
          onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }}
        />
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
          {value.map((m, i) => (
            <div
              key={m.token + i}
              className="relative rounded-xl p-2.5 flex items-center gap-3"
              style={{ border: `1px solid ${T.line}`, background: T.surface }}
            >
              {m.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(m.token)} alt={m.name || ''} className="w-14 h-14 rounded-lg object-cover shrink-0" style={{ background: T.lineSoft }} />
              ) : (
                <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center" style={{ background: T.accentSoft, color: T.accent }}>
                  <Music className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-xs mb-1" style={{ color: T.inkSoft }}>
                  {m.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Music className="w-3 h-3" />}
                  <span className="truncate">{m.name || m.type}</span>
                </div>
                {m.type === 'audio' && <audio controls src={mediaUrl(m.token)} className="w-full h-8" />}
              </div>
              <button
                type="button"
                aria-label="Sil"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                className="absolute top-1.5 right-1.5 rounded-full p-0.5"
                style={{ color: T.inkFaint }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
