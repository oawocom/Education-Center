import type { NavItem, Role } from './nav';

// ============================================================
// HUB-lar — yuxarı naviqasiya. Hər hub bir neçə səhifəni birləşdirir
// (səhifələr hub daxilində alt-tab kimi görünür). Siyahıda olmayan
// bəndlər avtomatik "Əlavə" hub-ına düşür.
// ============================================================
export interface HubDef {
  id: string;
  label: string;
  keys: string[];
}

export const HUBS: Record<Role, HubDef[]> = {
  admin: [
    { id: 'home', label: 'Ana səhifə', keys: ['dashboard'] },
    { id: 'schedule', label: 'Cədvəl', keys: ['schedule'] },
    { id: 'groups', label: 'Qruplar', keys: ['groups'] },
    { id: 'people', label: 'İnsanlar', keys: ['students', 'teachers', 'guardians', 'links'] },
    { id: 'subjects', label: 'Fənlər', keys: ['subjects'] },
  ],
  teacher: [
    { id: 'home', label: 'Ana səhifə', keys: ['dashboard'] },
    { id: 'schedule', label: 'Dərslər', keys: ['schedule', 'attendance'] },
    { id: 'groups', label: 'Qruplarım', keys: ['groups'] },
  ],
  student: [
    { id: 'home', label: 'Ana səhifə', keys: ['dashboard'] },
    { id: 'schedule', label: 'Cədvəl', keys: ['schedule'] },
  ],
  guardian: [
    { id: 'home', label: 'Ana səhifə', keys: ['dashboard'] },
    { id: 'schedule', label: 'Cədvəl', keys: ['schedule'] },
  ],
};

export interface HubView {
  id: string;
  label: string;
  items: NavItem[];
}

export function buildHubs(role: Role, items: NavItem[]): HubView[] {
  const byKey: Record<string, NavItem> = {};
  items.forEach((i) => (byKey[i.key] = i));
  const used: Record<string, boolean> = {};
  const out: HubView[] = [];
  (HUBS[role] || []).forEach((h) => {
    const its = h.keys.filter((k) => byKey[k]).map((k) => { used[k] = true; return byKey[k]; });
    if (its.length) out.push({ id: h.id, label: h.label, items: its });
  });
  const rest = items.filter((i) => !used[i.key]);
  if (rest.length) out.push({ id: 'other', label: 'Əlavə', items: rest });
  return out;
}
