'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Megaphone, MessageSquare, Receipt, UserPlus, ClipboardCheck, FileText, Circle } from 'lucide-react';
import { inbox, Notice } from '../utils/api';
import { T } from '../theme';

// ============================================================
// Zəng: oxunmamış bildirişlərin sayı + son bildirişlər.
// Hər dəqiqə və pəncərəyə qayıdanda yenilənir.
// Bildirişin "link"i menyu açarıdırsa, klik həmin bölməni açır.
// ============================================================

const KIND_ICON: Record<string, any> = {
  message: MessageSquare, announcement: Megaphone, invoice: Receipt, invoice_overdue: Receipt,
  payment: Receipt, registration: UserPlus, account_approved: UserPlus, attendance_alert: ClipboardCheck, exam_graded: FileText,
};

export function ago(iso: string): string {
  const d = new Date(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'indicə';
  if (s < 3600) return Math.floor(s / 60) + ' dəq əvvəl';
  if (s < 86400) return Math.floor(s / 3600) + ' saat əvvəl';
  if (s < 2 * 86400) return 'dünən';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' gün əvvəl';
  return d.toLocaleDateString('az-AZ');
}

export default function NotificationBell({ color }: { color: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [limit, setLimit] = useState(15);
  const timer = useRef<any>(null);

  const load = useCallback((n?: number) => {
    inbox
      .list(n || limit)
      .then((r) => {
        setItems(r.data || []);
        setUnread(r.unread || 0);
      })
      .catch(() => {});
  }, [limit]);

  useEffect(() => {
    load();
    timer.current = setInterval(() => load(), 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const openItem = (n: Notice) => {
    if (!n.is_read) {
      inbox.read([n.id]).catch(() => {});
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.link && n.link.indexOf('/') === -1) {
      window.dispatchEvent(new CustomEvent('edu-nav', { detail: n.link }));
      setOpen(false);
    }
  };

  const readAll = () => {
    inbox.read('all').then(() => load()).catch(() => {});
    setItems((xs) => xs.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-black/5"
        aria-label="Bildirişlər"
        title="Bildirişlər"
      >
        <Bell className="w-[18px] h-[18px]" style={{ color: T.inkSoft }} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: T.bad }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border bg-white shadow-lg overflow-hidden"
            style={{ borderColor: T.line }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.lineSoft }}>
              <p className="text-sm font-semibold">Bildirişlər</p>
              {unread > 0 && (
                <button onClick={readAll} className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
                  <CheckCheck className="w-3.5 h-3.5" /> Hamısını oxunmuş et
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-10 text-sm text-center" style={{ color: T.inkFaint }}>Hələ bildiriş yoxdur</p>
              )}
              {items.map((n) => {
                const Icon = KIND_ICON[n.type] || Circle;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className="w-full text-left flex gap-3 px-4 py-3 border-b hover:bg-black/[.03]"
                    style={{ borderColor: T.lineSoft, background: n.is_read ? undefined : 'rgba(47,91,234,.05)' }}
                  >
                    <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg flex items-center justify-center" style={{ background: T.lineSoft }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: n.priority === 'high' ? T.bad : T.inkSoft }} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start gap-2">
                        <span className={'flex-1 text-[13px] ' + (n.is_read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                        {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
                      </span>
                      {n.body && <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: T.inkSoft }}>{n.body}</span>}
                      <span className="block text-[11px] mt-1" style={{ color: T.inkFaint }}>{ago(n.created_at)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {items.length >= limit && limit < 100 && (
              <button
                onClick={() => { setLimit(100); load(100); }}
                className="w-full py-2.5 text-xs font-medium border-t"
                style={{ borderColor: T.lineSoft, color }}
              >
                Daha çox göstər
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
