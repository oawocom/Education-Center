// ============================================================
// Education Center — ekran meta məlumatları
//
// Hər ekranın başlığı, alt başlığı, statistika kartları və
// altındakı prinsip qeydi.
//
// Dizaynı dəyişmək = bu fayla toxunmaq. Komponentlər eynidir.
// ============================================================

import { Role } from './nav';

// Statistika kartı: dəyər API-dən hesablanır
export interface StatDef {
  emoji: string;
  label: string;
  kind: 'count' | 'ratio' | 'sum';
  resource: string;
  params?: Record<string, string | number>;
  // ratio üçün məxrəc
  ofResource?: string;
  ofParams?: Record<string, string | number>;
  // sum üçün sahə
  field?: string;
  suffix?: string;
}

export interface NoteDef {
  emoji: string;
  title: string;
  text: string;
}

export interface ScreenMeta {
  h1: string;
  sub: string;
  stats?: StatDef[];
  note?: NoteDef;
}

// Rol üzrə qeyd başlıqları — dizayndakı kimi
export const NOTE_STYLE: Record<Role, { emoji: string; title: string }> = {
  admin: { emoji: '🏛️', title: 'İdarəetmə prinsipi' },
  teacher: { emoji: '🎓', title: 'Pedaqoji yanaşma' },
  student: { emoji: '🌱', title: 'Öyrənmə tövsiyəsi' },
  guardian: { emoji: '❤️', title: 'Valideyn tövsiyəsi' },
};

const note = (role: Role, text: string): NoteDef => ({
  emoji: NOTE_STYLE[role].emoji,
  title: NOTE_STYLE[role].title,
  text,
});

// Rol panel adları — breadcrumb üçün
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin paneli',
  teacher: 'Müəllim paneli',
  student: 'Şagird paneli',
  guardian: 'Valideyn paneli',
};

// ============================================================
// ADMIN
// ============================================================

const ADMIN: Record<string, ScreenMeta> = {
  dashboard: {
    h1: 'Xoş gəldiniz 👋',
    sub: 'Mərkəzin ümumi vəziyyətinə baxın',
    stats: [
      { emoji: '👥', label: 'Aktiv şagird', kind: 'count', resource: 'students', params: { status: 'active' } },
      { emoji: '🎓', label: 'Müəllim sayı', kind: 'count', resource: 'teachers' },
      { emoji: '📚', label: 'Aktiv qrup', kind: 'count', resource: 'groups', params: { status: 'active' } },
      { emoji: '💰', label: 'Ödənilmiş (AZN)', kind: 'sum', resource: 'invoices', params: { status: 'paid' }, field: 'paid_amount' },
    ],
    note: note('admin', 'Mərkəzin gündəlik göstəricilərinin bir baxışda görünməsi operativ qərarların vaxtında qəbul edilməsini təmin edir.'),
  },

  students: {
    h1: 'Şagirdlər',
    sub: 'Bütün mərkəz üzrə şagird qeydiyyatı, qrup və valideyn təyinatı.',
    stats: [
      { emoji: '👥', label: 'Aktiv şagird', kind: 'count', resource: 'students', params: { status: 'active' } },
      { emoji: '🔗', label: 'Valideyn bağlantısı', kind: 'ratio', resource: 'student-guardians', ofResource: 'students', suffix: '%' },
      { emoji: '📚', label: 'Qrup qeydiyyatı', kind: 'count', resource: 'enrollments', params: { status: 'active' } },
    ],
    note: note('admin', 'Mərkəzləşdirilmiş şagird qeydiyyatı səviyyə təyinatını və valideyn əlaqələrini bir yerdə saxlayaraq inzibati xətaları minimuma endirir.'),
  },

  teachers: {
    h1: 'Müəllimlər',
    sub: 'Müəllim heyəti, fənn və həftəlik yük göstəriciləri.',
    stats: [
      { emoji: '🎓', label: 'Aktiv müəllim', kind: 'count', resource: 'teachers', params: { status: 'active' } },
      { emoji: '📚', label: 'Təyin olunmuş qrup', kind: 'count', resource: 'groups', params: { status: 'active' } },
    ],
    note: note('admin', 'Müəllim yükünün (weekly workload) izlənməsi tarazlı bölgü və tədris keyfiyyətinin qorunması üçün vacibdir.'),
  },

  guardians: {
    h1: 'Valideynlər',
    sub: 'Valideyn və qəyyum məlumatları, övladlarla bağlantı.',
    stats: [
      { emoji: '❤️', label: 'Valideyn', kind: 'count', resource: 'guardians' },
      { emoji: '🔗', label: 'Bağlantı', kind: 'count', resource: 'student-guardians' },
    ],
    note: note('admin', 'Valideyn əlaqələrinin mərkəzi qeydiyyatı şagirdin tərəqqisinə birgə dəstəyi asanlaşdırır.'),
  },

  groups: {
    h1: 'Qruplar',
    sub: 'Bütün səviyyə qrupları, tutum və təyin olunmuş müəllim.',
    stats: [
      { emoji: '📚', label: 'Aktiv qrup', kind: 'count', resource: 'groups', params: { status: 'active' } },
      { emoji: '👥', label: 'Qeydiyyat', kind: 'count', resource: 'enrollments', params: { status: 'active' } },
    ],
    note: note('admin', 'CEFR səviyyələrinə uyğun qruplaşdırma (A1–C1) fərdiləşdirilmiş tədrisin əsasını təşkil edir.'),
  },

  placement: {
    h1: 'Level imtahanları',
    sub: 'Yeni şagirdlərin səviyyə qiymətləndirməsi və qrupa avtomatik yerləşdirmə tövsiyəsi.',
    stats: [
      { emoji: '⏳', label: 'Gözləyən', kind: 'count', resource: 'placement-results', params: { status: 'pending' } },
      { emoji: '✅', label: 'Yerləşdirilib', kind: 'count', resource: 'placement-results', params: { status: 'placed' } },
    ],
    note: note('admin', 'Obyektiv giriş qiymətləndirməsi hər şagirdin düzgün səviyyəyə yerləşdirilməsini təmin edir və erkən uyğunsuzluğun (məyusluq və ya darıxma) qarşısını alır.'),
  },

  schedule: {
    h1: 'Dərs cədvəli',
    sub: 'Bütün mərkəz üzrə həftəlik cədvəl — otaq və vaxt münaqişələrini önləyir.',
    note: note('admin', 'Mərkəz səviyyəsində vahid cədvəl otaq və resurs münaqişələrinin qarşısını alır və şəffaf planlaşdırma təmin edir.'),
  },

  branches: {
    h1: 'Filiallar',
    sub: 'Filiallar üzrə şagird, müəllim və qrup statistikası.',
    stats: [
      { emoji: '🏢', label: 'Filial', kind: 'count', resource: 'branches' },
      { emoji: '🚪', label: 'Otaq', kind: 'count', resource: 'rooms' },
    ],
    note: note('admin', 'Filiallar üzrə statistika resursların bərabər bölüşdürülməsi qərarlarını dəstəkləyir.'),
  },

  rooms: {
    h1: 'Otaqlar',
    sub: 'Filiallar üzrə dərs otaqları və tutumları.',
    note: note('admin', 'Otaq tutumunun qrup ölçüsü ilə uzlaşdırılması rahat tədris mühiti üçün vacibdir.'),
  },

  subjects: {
    h1: 'Fənlər və səviyyələr',
    sub: 'Tədris olunan fənlər və onların səviyyə skalası.',
    stats: [
      { emoji: '📖', label: 'Fənn', kind: 'count', resource: 'subjects' },
      { emoji: '📊', label: 'Səviyyə', kind: 'count', resource: 'levels' },
      { emoji: '🎯', label: 'Bacarıq', kind: 'count', resource: 'skills' },
    ],
    note: note('admin', 'Fənn və səviyyə strukturu bütün tədris planlaşdırmasının təməlini təşkil edir.'),
  },

  invoices: {
    h1: 'Ödənişlər',
    sub: 'Ödəniş tarixçəsi, gecikmə xəbərdarlıqları və aylıq gəlir icmalı.',
    stats: [
      { emoji: '💰', label: 'Ödənilib (AZN)', kind: 'sum', resource: 'invoices', params: { status: 'paid' }, field: 'paid_amount' },
      { emoji: '⚠️', label: 'Gecikən ödəniş', kind: 'count', resource: 'invoices', params: { status: 'overdue' } },
      { emoji: '⏳', label: 'Gözləyən', kind: 'count', resource: 'invoices', params: { status: 'pending' } },
    ],
    note: note('admin', 'Şəffaf ödəniş izləmə valideyn etibarını artırır və maliyyə çətinliklərinin erkən aşkarlanmasına imkan verir.'),
  },

  reports: {
    h1: 'Hesabatlar',
    sub: 'Müəllim performansı və qrup davamiyyəti üzrə analitika.',
    note: note('admin', 'Müəllim performansı və davamiyyət analitikası keyfiyyətin davamlı yüksəldilməsi üçün məlumatlı qərar dəstəyi verir.'),
  },

  announcements: {
    h1: 'Elanlar',
    sub: 'Müəllim, şagird və valideynlərə mərkəzləşdirilmiş bildiriş göndərin.',
    stats: [
      { emoji: '📢', label: 'Dərc olunub', kind: 'count', resource: 'announcements', params: { status: 'published' } },
      { emoji: '📝', label: 'Layihə', kind: 'count', resource: 'announcements', params: { status: 'draft' } },
    ],
    note: note('admin', 'Mərkəzləşdirilmiş kommunikasiya bütün tərəflərin (müəllim/şagird/valideyn) vaxtında və dəqiq məlumatlandırılmasını təmin edir.'),
  },

  users: {
    h1: 'İstifadəçilər',
    sub: 'Panel hesabları və rollar.',
    note: note('admin', 'Rol əsaslı giriş nəzarəti hər istifadəçinin yalnız öz işi üçün lazım olan məlumata çıxışını təmin edir.'),
  },

  email: {
    h1: 'E-poçt',
    sub: 'Mərkəzin göndərdiyi məktubların şablonları və göndəriş jurnalı.',
  },

  audit: {
    h1: 'Audit jurnalı',
    sub: 'Kim, nə vaxt, nəyi etdi: girişlər, hesab dəyişiklikləri və bütün yazılar.',
  },

  settings: {
    h1: 'Tənzimləmələr',
    sub: 'Sistem parametrləri və mərkəzin əməliyyat siyasətləri.',
    note: note('admin', 'Standartlaşdırılmış sistem parametrləri mərkəzin əməliyyat siyasətlərinin ardıcıl tətbiqini təmin edir.'),
  },

  'student-guardians': {
    h1: 'Şagird–valideyn bağlantıları',
    sub: 'Bütün bağlantıların ümumi siyahısı. Tək şagird üçün bağlantını "Şagirdlər" ekranındakı “Valideynlər” düyməsindən idarə etmək daha rahatdır.',
    stats: [
      { emoji: '🔗', label: 'Bağlantı', kind: 'count', resource: 'student-guardians' },
      { emoji: '👥', label: 'Şagird', kind: 'count', resource: 'students' },
    ],
    note: note('admin', 'Hər şagirdin ən azı bir əsas əlaqə şəxsinin olması təcili hallarda operativ əlaqəni təmin edir.'),
  },

  enrollments: {
    h1: 'Qrupa yazılma',
    sub: 'Şagirdlərin qruplara yazılması və keçid tarixçəsi.',
    stats: [
      { emoji: '📚', label: 'Aktiv qeydiyyat', kind: 'count', resource: 'enrollments', params: { status: 'active' } },
      { emoji: '↔️', label: 'Köçürülüb', kind: 'count', resource: 'enrollments', params: { status: 'transferred' } },
    ],
    note: note('admin', 'Qeydiyyat tarixçəsinin saxlanması şagirdin səviyyələr üzrə irəliləyişini sonradan izləməyə imkan verir.'),
  },

  'schedule-slots': {
    h1: 'Cədvəl sətirləri',
    sub: 'Həftəlik təkrarlanan dərs saatları. Dərslər məhz bu sətirlərdən yaradılır.',
    stats: [{ emoji: '🧩', label: 'Cədvəl sətri', kind: 'count', resource: 'schedule-slots' }],
    note: note('admin', 'Sistem eyni otaq və eyni müəllim üçün vaxt üst-üstə düşməsini yazılma anında bloklayır — münaqişə cədvələ düşmür.'),
  },

  lessons: {
    h1: 'Dərslər',
    sub: 'Konkret tarixdəki dərslər. Cədvəldən avtomatik yaradıla bilər.',
    stats: [
      { emoji: '📅', label: 'Planlaşdırılıb', kind: 'count', resource: 'lessons', params: { status: 'scheduled' } },
      { emoji: '✅', label: 'Keçirilib', kind: 'count', resource: 'lessons', params: { status: 'held' } },
      { emoji: '🚫', label: 'Ləğv edilib', kind: 'count', resource: 'lessons', params: { status: 'cancelled' } },
    ],
    note: note('admin', 'Dərslərin cədvəldən toplu yaradılması inzibati yükü azaldır; ləğv və təxirə salma isə fərdi qeyd olaraq saxlanır.'),
  },

  attendance: {
    h1: 'Davamiyyət',
    sub: 'Bütün mərkəz üzrə davamiyyət qeydləri.',
    stats: [
      { emoji: '✅', label: 'İştirak', kind: 'count', resource: 'attendance', params: { status: 'present' } },
      { emoji: '🕒', label: 'Gecikmə', kind: 'count', resource: 'attendance', params: { status: 'late' } },
      { emoji: '❌', label: 'Qayıb', kind: 'count', resource: 'attendance', params: { status: 'absent' } },
    ],
    note: note('admin', 'Ardıcıl qayıblar avtomatik xəbərdarlıq yaradır — erkən müdaxilə şagird itkisinin qarşısını alır.'),
  },

  exams: {
    h1: 'İmtahanlar',
    sub: 'Bütün mərkəz üzrə imtahanlar və dərc vəziyyəti.',
    stats: [
      { emoji: '✅', label: 'Dərc olunmuş', kind: 'count', resource: 'exams', params: { status: 'published' } },
      { emoji: '📝', label: 'Layihə', kind: 'count', resource: 'exams', params: { status: 'draft' } },
    ],
    note: note('admin', 'İmtahan dərc olunmadan şagirdə görünmür — layihə mərhələsi məzmunun yoxlanması üçündür.'),
  },

  grading: {
    h1: 'İmtahan işləri',
    sub: 'Şagird işləri, ballar və qiymətləndirmə vəziyyəti.',
    stats: [
      { emoji: '⏳', label: 'Yoxlanılmamış', kind: 'count', resource: 'exam-submissions', params: { status: 'submitted' } },
      { emoji: '✅', label: 'Qiymətləndirilib', kind: 'count', resource: 'exam-submissions', params: { status: 'graded' } },
    ],
    note: note('admin', 'Yoxlama müddətinin izlənməsi (tövsiyə: 48 saat) qiymətləndirmənin tədris dəyərini qoruyur.'),
  },

  skills: {
    h1: 'Bacarıqlar',
    sub: 'İmtahanların bacarıq üzrə bölgüsü — dinləmə, oxu, yazı, danışıq.',
    stats: [{ emoji: '🎯', label: 'Bacarıq', kind: 'count', resource: 'skills' }],
    note: note('admin', 'Bacarıq üzrə bölgü ümumi bal əvəzinə konkret inkişaf sahəsini göstərir və fərdi tədris planına əsas verir.'),
  },

  syllabus: {
    h1: 'Sillabus',
    sub: 'Qruplar üzrə həftəlik kurs planı.',
    note: note('admin', 'Sənədləşdirilmiş sillabus müəllim dəyişikliyi halında tədrisin fasiləsiz davamını təmin edir.'),
  },

  materials: {
    h1: 'Materiallar',
    sub: 'Dərs materialları, fayllar və linklər.',
    note: note('admin', 'Mərkəzləşdirilmiş material bazası tədris keyfiyyətinin qruplar arasında bərabərliyini qoruyur.'),
  },

  assignments: {
    h1: 'Tapşırıqlar',
    sub: 'Bütün qruplar üzrə ev tapşırıqları və son tarixlər.',
    stats: [
      { emoji: '📋', label: 'Tapşırıq', kind: 'count', resource: 'assignments' },
      { emoji: '📥', label: 'Təhvil verilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'submitted' } },
    ],
    note: note('admin', 'Tapşırıq yükünün mərkəz səviyyəsində görünməsi qruplar arasında balansın qorunmasına kömək edir.'),
  },

  'tuition-plans': {
    h1: 'Təhsil haqqı tarifləri',
    sub: 'Qrup, səviyyə və filial üzrə qiymət şablonları.',
    stats: [{ emoji: '🏷️', label: 'Aktiv tarif', kind: 'count', resource: 'tuition-plans', params: { is_active: 'true' } }],
    note: note('admin', 'Şablon əsaslı qiymətləndirmə fərdi razılaşmalarda da şəffaflığı və müqayisə imkanını saxlayır.'),
  },

  'student-tuitions': {
    h1: 'Şagird tarifləri',
    sub: 'Konkret şagirdlə bağlanan tarif və endirim. Aylıq qaimələr buradan kəsilir.',
    stats: [
      { emoji: '🧾', label: 'Aktiv tarif', kind: 'count', resource: 'student-tuitions', params: { status: 'active' } },
    ],
    note: note('admin', 'Endirimin qeydə alınması maliyyə hesabatının real mənzərəni əks etdirməsini təmin edir.'),
  },

  levels: {
    h1: 'Səviyyələr',
    sub: 'CEFR və ya digər səviyyə skalası. Bal aralığı level imtahanında istifadə olunur.',
    stats: [{ emoji: '📊', label: 'Səviyyə', kind: 'count', resource: 'levels' }],
    note: note('admin', 'Aydın bal aralıqları yerləşdirmə qərarını subyektiv rəydən çıxarıb ölçülə bilən meyara bağlayır.'),
  },

  messages: {
    h1: 'İsmarıclar',
    sub: 'Mərkəz daxilindəki yazışmalar.',
    note: note('admin', 'Yazışmanın sistem daxilində qalması şagirdlə bağlı qərarların izlənə bilən qeydini yaradır.'),
  },

  'sub-roles': {
    h1: 'Alt rollar',
    sub: 'Baza rolun daraldılmış icazə dəsti — məsələn yalnız qeydiyyatla məşğul olan admin.',
    note: note('admin', 'Ən az icazə prinsipi (least privilege) məlumat təhlükəsizliyinin təməlidir: alt rol icazəni yalnız azalda bilər.'),
  },
};

// ============================================================
// MÜƏLLİM
// ============================================================

const TEACHER: Record<string, ScreenMeta> = {
  dashboard: {
    h1: 'Salam 👋',
    sub: 'Bugünkü işlərinizə baxın',
    stats: [
      { emoji: '👥', label: 'Qruplarım', kind: 'count', resource: 'groups' },
      { emoji: '🎓', label: 'Şagirdlərim', kind: 'count', resource: 'students' },
      { emoji: '✅', label: 'Yoxlanılmamış', kind: 'count', resource: 'exam-submissions', params: { status: 'submitted' } },
      { emoji: '📋', label: 'Aktiv tapşırıq', kind: 'count', resource: 'assignments' },
    ],
    note: note('teacher', 'Gündəlik iş yükünün bir baxışda görünməsi vaxt idarəetməsini asanlaşdırır və heç bir tapşırığın gözdən qaçmamasını təmin edir.'),
  },

  availability: {
    h1: 'Boş saatlarım',
    sub: 'Boş vaxtlarınızı işarələyin — qrup planlaşdırma sistemi bu qrafikə əsaslanır.',
    stats: [
      { emoji: '⏰', label: 'Boş saat / həftə', kind: 'count', resource: 'teacher-availability' },
    ],
    note: note('teacher', 'Müəllimin əlçatanlıq qrafiki avtomatik qrup planlaşdırma alqoritmi ilə inteqrasiya olunaraq tədris yükünün bərabər bölüşdürülməsinə və "burnout" riskinin azaldılmasına kömək edir.'),
  },

  groups: {
    h1: 'Qruplarım',
    sub: 'Sizə təyin olunmuş bütün qruplar, səviyyələri və tutumu.',
    stats: [
      { emoji: '👥', label: 'Aktiv qrup', kind: 'count', resource: 'groups', params: { status: 'active' } },
      { emoji: '🎓', label: 'Ümumi şagird', kind: 'count', resource: 'students' },
    ],
    note: note('teacher', 'Səviyyəyə uyğun kiçik qruplar (CEFR: A1–C1) fərdiləşdirilmiş yanaşmanı asanlaşdırır və hər şagirdin fəal iştirakını artırır.'),
  },

  schedule: {
    h1: 'Dərs cədvəlim',
    sub: 'Həftəlik dərs qrafikiniz — gün, saat və otaq üzrə.',
    note: note('teacher', 'Aydın və sabit həftəlik struktur şagirdlərdə öyrənmə rutini formalaşdırır və valideynlərin planlaşdırmasını asanlaşdırır.'),
  },

  lessons: {
    h1: 'Dərslər',
    sub: 'Konkret tarixdəki dərslər — mövzu, status və davamiyyət bağlantısı.',
    stats: [
      { emoji: '📅', label: 'Planlaşdırılıb', kind: 'count', resource: 'lessons', params: { status: 'scheduled' } },
      { emoji: '✅', label: 'Keçirilib', kind: 'count', resource: 'lessons', params: { status: 'held' } },
    ],
    note: note('teacher', 'Hər dərsin qeydə alınması davamiyyət və sillabus icrasının izlənməsini dəqiqləşdirir.'),
  },

  exams: {
    h1: 'İmtahanlar',
    sub: 'Qruplarınız üçün imtahan yaradın və nəticələri izləyin.',
    stats: [
      { emoji: '✅', label: 'Dərc olunmuş', kind: 'count', resource: 'exams', params: { status: 'published' } },
      { emoji: '📝', label: 'Layihə', kind: 'count', resource: 'exams', params: { status: 'draft' } },
    ],
    note: note('teacher', 'Formativ və summativ qiymətləndirmənin balanslaşdırılmış kombinasiyası (MCQ, Doğru/Yanlış, Boşluq, Açıq suallar) bacarıqların hərtərəfli ölçülməsini təmin edir.'),
  },

  grading: {
    h1: 'Yoxlama',
    sub: 'Yoxlanılmamış imtahan işləri — açıq suallar üçün əl ilə qiymətləndirmə.',
    stats: [
      { emoji: '⏳', label: 'Növbədə', kind: 'count', resource: 'exam-submissions', params: { status: 'submitted' } },
      { emoji: '✅', label: 'Qiymətləndirilib', kind: 'count', resource: 'exam-submissions', params: { status: 'graded' } },
    ],
    note: note('teacher', 'Sürətli və konkret rəy (feedback) tələbənin motivasiyasını gücləndirir — açıq suallar üçün 48 saat ərzində qiymətləndirmə tövsiyə olunur.'),
  },

  attendance: {
    h1: 'Davamiyyət',
    sub: 'Qrupunuz üzrə gündəlik davamiyyəti qeyd edin.',
    stats: [
      { emoji: '✅', label: 'İştirak', kind: 'count', resource: 'attendance', params: { status: 'present' } },
      { emoji: '🕒', label: 'Gecikmə', kind: 'count', resource: 'attendance', params: { status: 'late' } },
      { emoji: '❌', label: 'Qayıb', kind: 'count', resource: 'attendance', params: { status: 'absent' } },
    ],
    note: note('teacher', 'Davamiyyətin ardıcıl izlənməsi erkən risk siqnallarını aşkar etməyə imkan verir; 2 ardıcıl buraxılmış dərs avtomatik xəbərdarlıq yaratmalıdır.'),
  },

  assignments: {
    h1: 'Tapşırıqlar',
    sub: 'Qruplarınıza verilmiş tapşırıqlar və icra statusu.',
    stats: [
      { emoji: '📋', label: 'Tapşırıq', kind: 'count', resource: 'assignments' },
      { emoji: '📥', label: 'Təhvil verilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'submitted' } },
    ],
    note: note('teacher', 'Aydın son tarixli, ölçülə bilən tapşırıqlar müstəqil öyrənmə vərdişlərini formalaşdırır və dərsdənkənar təkrarı gücləndirir.'),
  },

  syllabus: {
    h1: 'Sillabus',
    sub: 'Həftəlik kurs planı və həftəlik materiallar.',
    note: note('teacher', '12 həftəlik struktur CEFR səviyyə tələblərinə uyğunlaşdırılıb; hər həftə üçün əvvəlcədən əlçatan material öyrənmə davamlılığını təmin edir.'),
  },

  materials: {
    h1: 'Materiallar',
    sub: 'Dərs materialları, fayllar və linklər.',
    note: note('teacher', 'Həftəlik strukturlaşdırılmış materiallar sistemli təkrarı asanlaşdırır — "spaced repetition" prinsipi öyrənməni möhkəmləndirir.'),
  },

  messages: {
    h1: 'İsmarıclar',
    sub: 'Valideynlərlə birbaşa yazışma.',
    note: note('teacher', 'Müəllim-valideyn birbaşa ünsiyyəti şəffaflığı artırır və şagirdin tərəqqisinə birgə dəstəyi gücləndirir.'),
  },

  students: {
    h1: 'Şagirdlərim',
    sub: 'Qruplarınızdakı şagirdlər.',
    stats: [{ emoji: '🎓', label: 'Şagird', kind: 'count', resource: 'students' }],
    note: note('teacher', 'Hər şagirdin adını, səviyyəsini və davamiyyətini bilmək fərdi yanaşmanın ilk şərtidir.'),
  },

  questions: {
    h1: 'Suallar',
    sub: 'İmtahan sualları — bacarıq və bal üzrə.',
    stats: [{ emoji: '❓', label: 'Sual', kind: 'count', resource: 'questions' }],
    note: note('teacher', 'Sualın bacarığa bağlanması nəticələrin “nə bilmir” səviyyəsində oxunmasına imkan verir.'),
  },

  'assignment-submissions': {
    h1: 'Təhvillər',
    sub: 'Şagirdlərin təhvil verdiyi işlər və qiymətlər.',
    stats: [
      { emoji: '📥', label: 'Göndərilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'submitted' } },
      { emoji: '✅', label: 'Qiymətləndirilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'graded' } },
    ],
    note: note('teacher', 'Vaxtında verilən rəy tapşırığın öyrənmə dəyərini bir neçə dəfə artırır.'),
  },

  announcements: {
    h1: 'Elanlar',
    sub: 'Mərkəzin elanları.',
    note: note('teacher', 'Ümumi elanların izlənməsi qrup daxilində eyni məlumatın paylaşılmasını təmin edir.'),
  },
};

// ============================================================
// ŞAGİRD
// ============================================================

const STUDENT: Record<string, ScreenMeta> = {
  dashboard: {
    h1: 'Salam 👋',
    sub: 'Bugünkü öyrənmə hədəflərinizə baxın',
    stats: [
      { emoji: '📝', label: 'Aktiv imtahan', kind: 'count', resource: 'exams', params: { status: 'published' } },
      { emoji: '📋', label: 'Aktiv tapşırıq', kind: 'count', resource: 'assignments' },
      { emoji: '🏅', label: 'Nailiyyət', kind: 'count', resource: 'student-achievements' },
      { emoji: '⭐', label: 'XP', kind: 'sum', resource: 'xp-events', field: 'points' },
    ],
    note: note('student', 'Gündəlik məqsədlərin (XP, ardıcıllıq) izlənməsi öyrənmə vərdişini davamlı və əyləncəli edir.'),
  },

  schedule: {
    h1: 'Dərs cədvəlim',
    sub: 'Qrupunuzun həftəlik dərs qrafiki.',
    note: note('student', 'Sabit cədvəl rutina və məsuliyyət hissi formalaşdırır — hər dərsdən əvvəl 10 dəqiqəlik hazırlıq öyrənməni gücləndirir.'),
  },

  exams: {
    h1: 'İmtahanlarım',
    sub: 'Aktiv və tamamlanmış imtahanlarınız.',
    stats: [
      { emoji: '📝', label: 'Aktiv imtahan', kind: 'count', resource: 'exams', params: { status: 'published' } },
      { emoji: '✅', label: 'Tamamlanmış', kind: 'count', resource: 'exam-submissions', params: { status: 'graded' } },
    ],
    note: note('student', 'Mütəmadi özünüqiymətləndirmə güclü və zəif tərəflərinizi vaxtında görməyə kömək edir.'),
  },

  materials: {
    h1: 'Materiallar',
    sub: 'Həftələr üzrə dərs materialları.',
    note: note('student', 'Həftəlik strukturlaşdırılmış materiallar sistemli təkrarı asanlaşdırır — "spaced repetition" prinsipi öyrənməni möhkəmləndirir.'),
  },

  assignments: {
    h1: 'Tapşırıqlarım',
    sub: 'Sizə verilmiş tapşırıqlar və son tarixlər.',
    stats: [
      { emoji: '📋', label: 'Tapşırıq', kind: 'count', resource: 'assignments' },
      { emoji: '📤', label: 'Göndərilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'submitted' } },
    ],
    note: note('student', 'Tapşırıqları vaxtında təhvil vermək müstəqil öyrənmə vərdişini gücləndirir və qısamüddətli biliyin uzunmüddətli yaddaşa keçidini asanlaşdırır.'),
  },

  results: {
    h1: 'Nəticələrim',
    sub: 'Bacarıq üzrə ətraflı bölgü — dinləmə, oxu, yazı, danışıq.',
    note: note('student', 'Bacarıq üzrə (dinləmə/oxu/yazı/danışıq) ətraflı analiz hansı sahəyə diqqət etməli olduğunuzu göstərir.'),
  },

  achievements: {
    h1: 'Nailiyyətlər',
    sub: 'XP, ardıcıllıq və qazandığınız nişanlar.',
    stats: [
      { emoji: '⭐', label: 'XP', kind: 'sum', resource: 'xp-events', field: 'points' },
      { emoji: '🏅', label: 'Nişan', kind: 'count', resource: 'student-achievements' },
    ],
    note: note('student', 'Kiçik nailiyyətlərin qeyd olunması (gamification) daxili motivasiyanı artırır və öyrənmədə ardıcıllığı gücləndirir.'),
  },

  messages: {
    h1: 'İsmarıclar',
    sub: 'Müəllimlə yazışma.',
    note: note('student', 'Sualı vaxtında vermək öyrənmədəki boşluqların böyüməsinin qarşısını alır.'),
  },

  'assignment-submissions': {
    h1: 'Təhvillərim',
    sub: 'Göndərdiyiniz işlər və aldığınız qiymətlər.',
    stats: [
      { emoji: '📤', label: 'Göndərilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'submitted' } },
      { emoji: '✅', label: 'Qiymətləndirilib', kind: 'count', resource: 'assignment-submissions', params: { status: 'graded' } },
    ],
    note: note('student', 'Müəllim rəyini oxumaq növbəti tapşırıqda eyni səhvi təkrarlamamağın ən qısa yoludur.'),
  },

  attendance: {
    h1: 'Davamiyyətim',
    sub: 'Dərslərə iştirakınız.',
    stats: [
      { emoji: '✅', label: 'İştirak', kind: 'count', resource: 'attendance', params: { status: 'present' } },
      { emoji: '🕒', label: 'Gecikmə', kind: 'count', resource: 'attendance', params: { status: 'late' } },
      { emoji: '❌', label: 'Qayıb', kind: 'count', resource: 'attendance', params: { status: 'absent' } },
    ],
    note: note('student', 'Davamiyyət nəticə ilə birbaşa bağlıdır — buraxılan hər dərs sonrakı mövzunu çətinləşdirir.'),
  },

  invoices: {
    h1: 'Ödənişlər',
    sub: 'Qaimələr və ödəniş vəziyyəti.',
    note: note('student', 'Ödəniş qrafikini bilmək təhsil planlaşdırmasının bir hissəsidir.'),
  },

  announcements: {
    h1: 'Elanlar',
    sub: 'Mərkəzin elanları.',
    note: note('student', 'Elanları izləmək imtahan və tədbir tarixlərini qaçırmamağın ən sadə yoludur.'),
  },
};

// ============================================================
// VALİDEYN
// ============================================================

const GUARDIAN: Record<string, ScreenMeta> = {
  dashboard: {
    h1: 'Övladım',
    sub: 'Övladınızın ümumi göstəriciləri',
    stats: [
      { emoji: '✅', label: 'İştirak', kind: 'count', resource: 'attendance', params: { status: 'present' } },
      { emoji: '❌', label: 'Qayıb', kind: 'count', resource: 'attendance', params: { status: 'absent' } },
      { emoji: '📝', label: 'İmtahan', kind: 'count', resource: 'exam-submissions' },
      { emoji: '📋', label: 'Tapşırıq', kind: 'count', resource: 'assignment-submissions' },
    ],
    note: note('guardian', 'Övladınızın göstəricilərini mütəmadi izləmək evdə dəstəkləyici mühit yaratmağa kömək edir — tənqiddən çox həvəsləndirici yanaşma tövsiyə olunur.'),
  },

  schedule: {
    h1: 'Dərs qrafiki',
    sub: 'Övladınızın həftəlik dərs qrafiki.',
    note: note('guardian', 'Cədvəli bilmək evdə dəstəkləyici mühit yaratmaq üçün lazımi vaxt planlaşdırılmasına imkan verir.'),
  },

  results: {
    h1: 'İmtahan nəticələri',
    sub: 'Övladınızın imtahan tarixçəsi və trendi.',
    note: note('guardian', 'Nəticələri mütəmadi izləmək erkən dəstək imkanı yaradır — tənqiddən çox həvəsləndirici yanaşma tövsiyə olunur.'),
  },

  attendance: {
    h1: 'Davamiyyət',
    sub: 'Övladınızın davamiyyət göstəriciləri.',
    stats: [
      { emoji: '✅', label: 'İştirak', kind: 'count', resource: 'attendance', params: { status: 'present' } },
      { emoji: '🕒', label: 'Gecikmə', kind: 'count', resource: 'attendance', params: { status: 'late' } },
      { emoji: '📄', label: 'Üzrlü', kind: 'count', resource: 'attendance', params: { status: 'excused' } },
      { emoji: '❌', label: 'Qayıb', kind: 'count', resource: 'attendance', params: { status: 'absent' } },
    ],
    note: note('guardian', 'Davamiyyət göstəriciləri akademik uğurla birbaşa əlaqəlidir; valideyn nəzarəti bunun davamlılığını gücləndirir.'),
  },

  assignments: {
    h1: 'Tapşırıqlar',
    sub: 'Övladınızın tapşırıq icra vəziyyəti.',
    note: note('guardian', 'Evdə tapşırıq icrasına dəstək (nəzarət deyil, təşviq) uşağın məsuliyyət hissini inkişaf etdirir.'),
  },

  skills: {
    h1: 'Güclü / Zəif tərəflər',
    sub: 'Bacarıq oxları üzrə göstəricilər.',
    note: note('guardian', 'Bacarıq profilini bilmək evdə hansı sahəyə əlavə vaxt ayırmaq lazım olduğunu göstərir.'),
  },

  messages: {
    h1: 'İsmarıclar',
    sub: 'Müəllimlə birbaşa yazışma.',
    note: note('guardian', 'Müəllimlə birbaşa və vaxtında ünsiyyət uşağın tərəqqisinə birgə dəstəyi gücləndirir.'),
  },

  invoices: {
    h1: 'Ödənişlər',
    sub: 'Ödəniş tarixçəsi və gözləyən qaimələr.',
    stats: [
      { emoji: '⏳', label: 'Gözləyən', kind: 'count', resource: 'invoices', params: { status: 'pending' } },
      { emoji: '✅', label: 'Ödənilib', kind: 'count', resource: 'invoices', params: { status: 'paid' } },
    ],
    note: note('guardian', 'Şəffaf ödəniş tarixçəsi planlaşdırmanı asanlaşdırır və anlaşılmazlıqların qarşısını alır.'),
  },

  students: {
    h1: 'Övladlarım',
    sub: 'Sizə bağlı şagirdlər və onların vəziyyəti.',
    stats: [{ emoji: '👥', label: 'Övlad', kind: 'count', resource: 'students' }],
    note: note('guardian', 'Bir neçə övladınız varsa, hər biri üçün göstəricilər ayrıca izlənir.'),
  },

  materials: {
    h1: 'Materiallar',
    sub: 'Övladınızın qrupu üçün dərc olunmuş materiallar.',
    note: note('guardian', 'Materialları görmək evdə təkrarı istiqamətləndirməyə imkan verir.'),
  },

  announcements: {
    h1: 'Elanlar',
    sub: 'Mərkəzin valideynlərə ünvanladığı elanlar.',
    note: note('guardian', 'Mərkəzlə vaxtında məlumat mübadiləsi anlaşılmazlıqların qarşısını alır.'),
  },
};

export const SCREENS: Record<Role, Record<string, ScreenMeta>> = {
  admin: ADMIN,
  teacher: TEACHER,
  student: STUDENT,
  guardian: GUARDIAN,
};

export function getScreen(role: Role, key: string): ScreenMeta | null {
  const r = SCREENS[role];
  return (r && r[key]) || null;
}
