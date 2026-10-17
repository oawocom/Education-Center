// Super admin panelinin bu tətbiqə aid sözləri və imkanları.
// page.tsx Education Center və Professional Law-da eynidir; fərq yalnız bu fayldadır.

export const CONFIG = {
  product: 'Education Center',
  accent: '#2453C9',
  accentHover: '#1C43A6',
  accentSoft: '#EAF0FC',

  unit: 'Mərkəz',
  unitPl: 'Mərkəzlər',
  unitLower: 'mərkəz',
  unitPlLower: 'mərkəzlər',
  unitGen: 'Mərkəzin', // "Mərkəzin adı"
  unitDat: 'mərkəzə', // "mərkəzə admin əlavə et"
  newUnit: 'Yeni mərkəz',
  created: 'Mərkəz yaradıldı',

  admin: 'Admin',
  adminGen: 'Adminin',
  addAdmin: 'Admin əlavə et',
  firstAdmin: 'İlk admin',

  // e-poçt qurulmayanda nə işləmir
  mailMissing: 'Dəvət, parolun bərpası və bildiriş məktubları getmir.',

  minPassword: 8,
  domainExample: 'merkez.az',

  // kartdakı saylar: backend-in counts açarları
  counts: [
    { key: 'users', label: 'Hesab' },
    { key: 'admins', label: 'Admin' },
    { key: 'branches', label: 'Filial' },
    { key: 'teachers', label: 'Müəllim' },
    { key: 'students', label: 'Şagird' },
    { key: 'groups', label: 'Qrup' },
  ],
  // siyahıdakı və yuxarıdakı əsas saylar
  mainCounts: [
    { key: 'users', label: 'Hesab' },
    { key: 'teachers', label: 'Müəllim' },
    { key: 'students', label: 'Şagird' },
    { key: 'groups', label: 'Qrup' },
  ],
  roles: { admin: 'Admin', teacher: 'Müəllim', student: 'Şagird', guardian: 'Valideyn' } as Record<string, string>,

  // bu tətbiqdə olan əlavə imkanlar
  features: { resetLink: true, mailLog: true, audit: true },
};
