// ============================================================
// Dizayn tokenləri — yumşaq, minimalist, təhsil mühiti
// Bütün komponentlər rəngi buradan götürməlidir (hex yazmaq əvəzinə).
// ============================================================
export const T = {
  bg: '#FAF9F6',        // kağız tonu
  surface: '#FFFFFF',
  ink: '#1C2434',       // əsas mətn
  inkSoft: '#5B6577',   // ikinci dərəcəli mətn
  inkFaint: '#9AA3B2',  // placeholder / köməkçi
  line: '#E8E5DE',      // incə sərhəd
  lineSoft: '#F0EEE8',
  accent: '#2F5BEA',    // əsas vurğu (akademik mavi)
  accentSoft: '#EAF0FF',
  ok: '#15803D', okSoft: '#E8F6EC',
  warn: '#B45309', warnSoft: '#FEF3E2',
  bad: '#BE123C', badSoft: '#FDEBEF',
  radius: 14,
};

export const ROLE_COLOR: Record<string, { color: string; soft: string; label: string }> = {
  admin: { color: '#2F5BEA', soft: '#EAF0FF', label: 'Admin' },
  teacher: { color: '#0F766E', soft: '#E6F6F3', label: 'Müəllim' },
  student: { color: '#B45309', soft: '#FEF3E2', label: 'Şagird' },
  guardian: { color: '#BE185D', soft: '#FDEAF3', label: 'Valideyn' },
};
