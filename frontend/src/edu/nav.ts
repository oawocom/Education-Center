// ============================================================
// Education Center — panel menyusu
//
// İkonlar CMS dizaynındakı emoji-lərlə eynidir.
// Görünmə qərarı burada verilmir: hər bənd `resource` açarına
// bağlıdır və istifadəçinin icazə xəritəsində həmin resurs
// yoxdursa, bənd görünmür.
//
// `group` — menyudakı bölmə başlığı. Mərkəzin iş axını ilə
// eyni ardıcıllıqdadır: kim → nə öyrənir → necə ölçülür →
// nə ilə öyrənir → nə ödəyir → mərkəzin quruluşu → sistem.
// ============================================================

export type Role = 'admin' | 'teacher' | 'student' | 'guardian';

export interface NavItem {
  key: string;
  label: string;
  emoji: string;
  resource: string; // icazə açarı (boş olsa həmişə görünür)
  view: string; // hansı ekran açılır
  group?: string; // menyu bölməsi
}

// Rol rəngləri — dizayndan
export const ROLE_THEME: Record<Role, { color: string; soft: string; title: string }> = {
  admin: { color: '#2F5BEA', soft: '#EAF0FF', title: 'Admin paneli' },
  teacher: { color: '#0F766E', soft: '#E6F6F3', title: 'Müəllim paneli' },
  student: { color: '#B45309', soft: '#FEF3E2', title: 'Şagird paneli' },
  guardian: { color: '#BE185D', soft: '#FDEAF3', title: 'Valideyn paneli' },
};

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { key: 'dashboard', label: 'İdarə paneli', emoji: '📊', resource: '', view: 'dashboard' },

    // --- İnsanlar ---
    { key: 'students', label: 'Şagirdlər', emoji: '👥', resource: 'students', view: 'crud:students', group: 'İnsanlar' },
    { key: 'guardians', label: 'Valideynlər', emoji: '❤️', resource: 'guardians', view: 'crud:guardians', group: 'İnsanlar' },
    { key: 'teachers', label: 'Müəllimlər', emoji: '🎓', resource: 'teachers', view: 'crud:teachers', group: 'İnsanlar' },
    { key: 'links', label: 'Bağlantılar', emoji: '🔗', resource: 'student-guardians', view: 'crud:links', group: 'İnsanlar' },

    // --- Tədris ---
    { key: 'groups', label: 'Qruplar', emoji: '📚', resource: 'groups', view: 'crud:groups', group: 'Tədris' },
    { key: 'enrollments', label: 'Qrupa yazılma', emoji: '📝', resource: 'enrollments', view: 'crud:enrollments', group: 'Tədris' },
    { key: 'schedule', label: 'Cədvəl', emoji: '📅', resource: 'schedule-slots', view: 'schedule', group: 'Tədris' },
    { key: 'schedule-slots', label: 'Cədvəl sətirləri', emoji: '🧩', resource: 'schedule-slots', view: 'crud:schedule-slots', group: 'Tədris' },
    { key: 'lessons', label: 'Dərslər', emoji: '📗', resource: 'lessons', view: 'crud:lessons', group: 'Tədris' },
    { key: 'attendance', label: 'Davamiyyət', emoji: '🗓️', resource: 'attendance', view: 'crud:attendance', group: 'Tədris' },

    // --- Qiymətləndirmə ---
    { key: 'placement', label: 'Level imtahanları', emoji: '✅', resource: 'placement-results', view: 'crud:placement-results', group: 'Qiymətləndirmə' },
    { key: 'exams', label: 'İmtahanlar', emoji: '🧪', resource: 'exams', view: 'crud:exams', group: 'Qiymətləndirmə' },
    { key: 'grading', label: 'İmtahan işləri', emoji: '📄', resource: 'exam-submissions', view: 'crud:exam-submissions', group: 'Qiymətləndirmə' },
    { key: 'skills', label: 'Bacarıqlar', emoji: '🎯', resource: 'skills', view: 'crud:skills', group: 'Qiymətləndirmə' },

    // --- Kurs məzmunu ---
    { key: 'syllabus', label: 'Sillabus', emoji: '📘', resource: 'syllabus-weeks', view: 'crud:syllabus-weeks', group: 'Kurs məzmunu' },
    { key: 'materials', label: 'Materiallar', emoji: '📁', resource: 'materials', view: 'crud:materials', group: 'Kurs məzmunu' },
    { key: 'assignments', label: 'Tapşırıqlar', emoji: '📋', resource: 'assignments', view: 'crud:assignments', group: 'Kurs məzmunu' },

    // --- Maliyyə ---
    { key: 'tuition-plans', label: 'Tariflər', emoji: '🏷️', resource: 'tuition-plans', view: 'crud:tuition-plans', group: 'Maliyyə' },
    { key: 'student-tuitions', label: 'Şagird tarifləri', emoji: '🧾', resource: 'student-tuitions', view: 'crud:student-tuitions', group: 'Maliyyə' },
    { key: 'invoices', label: 'Ödənişlər', emoji: '💳', resource: 'invoices', view: 'crud:invoices', group: 'Maliyyə' },
    { key: 'payments', label: 'Ödəniş tarixçəsi', emoji: '🧾', resource: 'invoices', view: 'crud:payments', group: 'Maliyyə' },

    // --- Mərkəzin quruluşu ---
    { key: 'branches', label: 'Filiallar', emoji: '🏢', resource: 'branches', view: 'crud:branches', group: 'Quruluş' },
    { key: 'rooms', label: 'Otaqlar', emoji: '🚪', resource: 'rooms', view: 'crud:rooms', group: 'Quruluş' },
    { key: 'subjects', label: 'Fənlər', emoji: '📖', resource: 'subjects', view: 'crud:subjects', group: 'Quruluş' },
    { key: 'levels', label: 'Səviyyələr', emoji: '📊', resource: 'levels', view: 'crud:levels', group: 'Quruluş' },

    // --- Sistem ---
    { key: 'reports', label: 'Hesabatlar', emoji: '📈', resource: 'reports', view: 'reports', group: 'Sistem' },
    { key: 'announcements', label: 'Elanlar', emoji: '📢', resource: 'announcements', view: 'crud:announcements', group: 'Sistem' },
    { key: 'messages', label: 'İsmarıclar', emoji: '💬', resource: 'messages', view: 'crud:messages', group: 'Sistem' },
    { key: 'users', label: 'İstifadəçilər', emoji: '🔑', resource: 'users', view: 'users', group: 'Sistem' },
    { key: 'sub-roles', label: 'Alt rollar', emoji: '🛡️', resource: 'sub-roles', view: 'crud:sub-roles', group: 'Sistem' },
    { key: 'settings', label: 'Tənzimləmələr', emoji: '⚙️', resource: 'settings', view: 'crud:settings', group: 'Sistem' },
    { key: 'email', label: 'E-poçt', emoji: '✉️', resource: 'settings', view: 'email', group: 'Sistem' },
    { key: 'audit', label: 'Audit jurnalı', emoji: '📜', resource: 'users', view: 'audit', group: 'Sistem' },
  ],

  teacher: [
    { key: 'dashboard', label: 'Panelim', emoji: '📊', resource: '', view: 'dashboard' },

    { key: 'groups', label: 'Qruplarım', emoji: '👥', resource: 'groups', view: 'crud:groups', group: 'Tədris' },
    { key: 'students', label: 'Şagirdlərim', emoji: '🎓', resource: 'students', view: 'crud:students', group: 'Tədris' },
    { key: 'links', label: 'Bağlantılar', emoji: '🔗', resource: 'students', view: 'crud:links', group: 'Tədris' },
    { key: 'schedule', label: 'Dərslər', emoji: '📅', resource: 'schedule-slots', view: 'schedule', group: 'Tədris' },
    { key: 'lessons', label: 'Dərs yazıları', emoji: '📗', resource: 'lessons', view: 'crud:lessons', group: 'Tədris' },
    { key: 'attendance', label: 'Davamiyyət', emoji: '🗓️', resource: 'attendance', view: 'crud:attendance', group: 'Tədris' },
    { key: 'availability', label: 'Boş saatlarım', emoji: '⏰', resource: 'teacher-availability', view: 'crud:teacher-availability', group: 'Tədris' },

    { key: 'exams', label: 'İmtahanlar', emoji: '📝', resource: 'exams', view: 'crud:exams', group: 'Qiymətləndirmə' },
    { key: 'questions', label: 'Suallar', emoji: '❓', resource: 'questions', view: 'crud:questions', group: 'Qiymətləndirmə' },
    { key: 'grading', label: 'Yoxlama', emoji: '✅', resource: 'exam-submissions', view: 'crud:exam-submissions', group: 'Qiymətləndirmə' },

    { key: 'syllabus', label: 'Sillabus', emoji: '📘', resource: 'syllabus-weeks', view: 'crud:syllabus-weeks', group: 'Kurs məzmunu' },
    { key: 'materials', label: 'Materiallar', emoji: '📁', resource: 'materials', view: 'crud:materials', group: 'Kurs məzmunu' },
    { key: 'assignments', label: 'Tapşırıqlar', emoji: '📋', resource: 'assignments', view: 'crud:assignments', group: 'Kurs məzmunu' },
    { key: 'assignment-submissions', label: 'Təhvillər', emoji: '📥', resource: 'assignment-submissions', view: 'crud:assignment-submissions', group: 'Kurs məzmunu' },

    { key: 'messages', label: 'İsmarıclar', emoji: '💬', resource: 'messages', view: 'crud:messages', group: 'Ünsiyyət' },
    { key: 'announcements', label: 'Elanlar', emoji: '📢', resource: 'announcements', view: 'crud:announcements', group: 'Ünsiyyət' },
  ],

  student: [
    { key: 'dashboard', label: 'Panelim', emoji: '📊', resource: '', view: 'dashboard' },
    { key: 'schedule', label: 'Gündəliyim', emoji: '📅', resource: 'schedule-slots', view: 'schedule' },
    { key: 'exams', label: 'İmtahanlarım', emoji: '📝', resource: 'exams', view: 'crud:exams' },
    { key: 'materials', label: 'Materiallar', emoji: '📁', resource: 'materials', view: 'crud:materials' },
    { key: 'assignments', label: 'Tapşırıqlarım', emoji: '📋', resource: 'assignments', view: 'crud:assignments' },
    { key: 'assignment-submissions', label: 'Təhvillərim', emoji: '📤', resource: 'assignment-submissions', view: 'crud:assignment-submissions' },
    { key: 'results', label: 'Nəticələrim', emoji: '📈', resource: 'exam-submissions', view: 'crud:exam-submissions' },
    { key: 'attendance', label: 'Davamiyyətim', emoji: '🗓️', resource: 'attendance', view: 'crud:attendance' },
    { key: 'achievements', label: 'Nailiyyətlər', emoji: '🏅', resource: 'student-achievements', view: 'crud:student-achievements' },
    { key: 'invoices', label: 'Ödənişlər', emoji: '💳', resource: 'invoices', view: 'crud:invoices' },
    { key: 'messages', label: 'İsmarıclar', emoji: '💬', resource: 'messages', view: 'crud:messages' },
    { key: 'announcements', label: 'Elanlar', emoji: '📢', resource: 'announcements', view: 'crud:announcements' },
  ],

  guardian: [
    { key: 'dashboard', label: 'Övladım', emoji: '❤️', resource: '', view: 'dashboard' },
    { key: 'students', label: 'Övladlarım', emoji: '👥', resource: 'students', view: 'crud:students' },
    { key: 'schedule', label: 'Cədvəl', emoji: '📅', resource: 'schedule-slots', view: 'schedule' },
    { key: 'attendance', label: 'Davamiyyət', emoji: '✅', resource: 'attendance', view: 'crud:attendance' },
    { key: 'results', label: 'İmtahan nəticələri', emoji: '📝', resource: 'exam-submissions', view: 'crud:exam-submissions' },
    { key: 'skills', label: 'Güclü / Zəif tərəflər', emoji: '🎯', resource: 'skill-scores', view: 'crud:skill-scores' },
    { key: 'assignments', label: 'Tapşırıqlar', emoji: '📋', resource: 'assignment-submissions', view: 'crud:assignment-submissions' },
    { key: 'materials', label: 'Materiallar', emoji: '📁', resource: 'materials', view: 'crud:materials' },
    { key: 'invoices', label: 'Ödənişlər', emoji: '💳', resource: 'invoices', view: 'crud:invoices' },
    { key: 'messages', label: 'İsmarıclar', emoji: '💬', resource: 'messages', view: 'crud:messages' },
    { key: 'announcements', label: 'Elanlar', emoji: '📢', resource: 'announcements', view: 'crud:announcements' },
  ],
};

export function visibleNav(role: Role, permissions: Record<string, string[]>): NavItem[] {
  const items = NAV[role] || [];
  return items.filter((item) => {
    if (!item.resource) return true;
    const acts = permissions && permissions[item.resource];
    return Array.isArray(acts) && acts.length > 0;
  });
}

// groupedNav - menyunu bölmələrə ayırır. Bölməsiz bəndlər üstdə qalır.
export function groupedNav(items: NavItem[]): { group: string; items: NavItem[] }[] {
  const out: { group: string; items: NavItem[] }[] = [];
  items.forEach((item) => {
    const g = item.group || '';
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last && last.group === g) {
      last.items.push(item);
      return;
    }
    out.push({ group: g, items: [item] });
  });
  return out;
}
