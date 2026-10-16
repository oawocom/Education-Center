// ============================================================
// Education Center — resurs tərifləri
//
// Hər resurs: hansı sütunlar cədvəldə, hansı sahələr formada,
// hansı filtrlər üstdə. CrudPage bunu oxuyub ekranı qurur.
//
// VACİB: `key` dəyəri backend routes.go-dakı Resource.Name ilə
// EYNİ olmalıdır. `fields[].key` isə models.go-dakı json tag ilə.
//
// Yeni sahə əlavə etmək = bu fayla bir sətir.
// ============================================================

import { ResourceDef, SelectOption, FieldDef, LinkActionDef } from './types';

// ---------- Ortaq seçim dəstləri ----------

const WEEKDAYS: SelectOption[] = [
  { value: '1', label: 'Bazar ertəsi' },
  { value: '2', label: 'Çərşənbə axşamı' },
  { value: '3', label: 'Çərşənbə' },
  { value: '4', label: 'Cümə axşamı' },
  { value: '5', label: 'Cümə' },
  { value: '6', label: 'Şənbə' },
  { value: '7', label: 'Bazar' },
];

const WEEKDAY_MAP: Record<string, string> = {
  '1': 'B.e', '2': 'Ç.a', '3': 'Çərşənbə', '4': 'C.a', '5': 'Cümə', '6': 'Şənbə', '7': 'Bazar',
};

const PERSON_STATUS: SelectOption[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Dayandırılıb' },
  { value: 'left', label: 'Ayrılıb' },
];

const PERSON_STATUS_MAP: Record<string, string> = {
  active: 'Aktiv', paused: 'Dayandırılıb', left: 'Ayrılıb',
};

const PERSON_STATUS_COLORS: Record<string, string> = {
  active: '#16A34A', paused: '#D97706', left: '#9AA3B2',
};

const ATTENDANCE_STATUS: SelectOption[] = [
  { value: 'present', label: 'İştirak' },
  { value: 'late', label: 'Gecikmə' },
  { value: 'excused', label: 'Üzrlü' },
  { value: 'absent', label: 'Qayıb' },
];

const ATTENDANCE_MAP: Record<string, string> = {
  present: 'İştirak', late: 'Gecikmə', excused: 'Üzrlü', absent: 'Qayıb',
};

const ATTENDANCE_COLORS: Record<string, string> = {
  present: '#16A34A', late: '#D97706', excused: '#0EA5E9', absent: '#DC2626',
};

const PUBLISH_STATUS: SelectOption[] = [
  { value: 'draft', label: 'Layihə' },
  { value: 'published', label: 'Dərc olunub' },
  { value: 'closed', label: 'Bağlanıb' },
];

const PUBLISH_MAP: Record<string, string> = {
  draft: 'Layihə', published: 'Dərc olunub', closed: 'Bağlanıb',
};

const PUBLISH_COLORS: Record<string, string> = {
  draft: '#9AA3B2', published: '#16A34A', closed: '#5B6577',
};

const INVOICE_STATUS: SelectOption[] = [
  { value: 'pending', label: 'Gözləyir' },
  { value: 'paid', label: 'Ödənilib' },
  { value: 'partial', label: 'Qismən' },
  { value: 'overdue', label: 'Gecikir' },
  { value: 'cancelled', label: 'Ləğv edilib' },
];

const INVOICE_MAP: Record<string, string> = {
  pending: 'Gözləyir', paid: 'Ödənilib', partial: 'Qismən',
  overdue: 'Gecikir', cancelled: 'Ləğv edilib',
};

const INVOICE_COLORS: Record<string, string> = {
  pending: '#D97706', paid: '#16A34A', partial: '#0EA5E9',
  overdue: '#DC2626', cancelled: '#9AA3B2',
};

const RELATION_KIND: SelectOption[] = [
  { value: 'ana', label: 'Ana' },
  { value: 'ata', label: 'Ata' },
  { value: 'qeyyum', label: 'Qəyyum' },
  { value: 'diger', label: 'Digər' },
];

const ENROLLMENT_STATUS: SelectOption[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'left', label: 'Ayrılıb' },
  { value: 'transferred', label: 'Köçürülüb' },
];

// ---------- Bağlantı təsvirləri ----------
// Ara cədvəllər ayrıca ekran tələb etmir: hər biri əsas qeydin
// sətrindəki düymədən idarə olunur (şagirdin valideyni, qrupun
// şagirdi, müəllimin fənni). Bir təsvir — iki istiqamət.

const GUARDIAN_LINK_FIELDS: FieldDef[] = [
  { key: 'relation', label: 'Qohumluq', type: 'select', options: RELATION_KIND, width: 'half' },
  { key: 'is_primary', label: 'Əsas əlaqə', type: 'checkbox', placeholder: 'Bəli', width: 'half' },
  { key: 'can_pickup', label: 'Uşağı götürə bilər', type: 'checkbox', placeholder: 'Bəli', width: 'half' },
];

// Şagird → valideynləri
const STUDENT_GUARDIANS_LINK: LinkActionDef = {
  label: 'Valideynlər',
  resource: 'student-guardians',
  selfKey: 'student_id',
  targetKey: 'guardian_id',
  targetResource: 'guardians',
  targetTitle: 'Valideyn',
  targetPlural: 'Valideynlər',
  linkFields: GUARDIAN_LINK_FIELDS,
  emptyText: 'Bu şagirdə hələ valideyn təyin olunmayıb',
  quickCreateFields: [
    { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
    { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
    { key: 'email', label: 'E-poçt', type: 'email', width: 'half' },
    { key: 'occupation', label: 'Peşə', type: 'text', width: 'half' },
  ],
};

// Valideyn → övladları
const GUARDIAN_STUDENTS_LINK: LinkActionDef = {
  label: 'Övladlar',
  resource: 'student-guardians',
  selfKey: 'guardian_id',
  targetKey: 'student_id',
  targetResource: 'students',
  targetTitle: 'Şagird',
  targetPlural: 'Övladlar',
  linkFields: GUARDIAN_LINK_FIELDS,
  emptyText: 'Bu valideynə hələ şagird bağlanmayıb',
};

// Şagird → qrupları
const STUDENT_GROUPS_LINK: LinkActionDef = {
  resource: 'enrollments',
  selfKey: 'student_id',
  targetKey: 'group_id',
  targetResource: 'groups',
  targetTitle: 'Qrup',
  targetPlural: 'Qruplar',
  linkFields: [
    { key: 'joined_at', label: 'Qoşulma tarixi', type: 'date', width: 'half' },
    { key: 'status', label: 'Status', type: 'select', options: ENROLLMENT_STATUS, width: 'half' },
  ],
  emptyText: 'Bu şagird hələ heç bir qrupa yazılmayıb',
};

// Qrup → şagirdləri
const GROUP_STUDENTS_LINK: LinkActionDef = {
  resource: 'enrollments',
  selfKey: 'group_id',
  targetKey: 'student_id',
  targetResource: 'students',
  targetTitle: 'Şagird',
  targetPlural: 'Şagirdlər',
  linkFields: [
    { key: 'joined_at', label: 'Qoşulma tarixi', type: 'date', width: 'half' },
    { key: 'status', label: 'Status', type: 'select', options: ENROLLMENT_STATUS, width: 'half' },
  ],
  emptyText: 'Bu qrupda hələ şagird yoxdur',
};

// Müəllim → fənləri
const TEACHER_SUBJECTS_LINK: LinkActionDef = {
  resource: 'teacher-subjects',
  selfKey: 'teacher_id',
  targetKey: 'subject_id',
  targetResource: 'subjects',
  targetTitle: 'Fənn',
  targetPlural: 'Fənlər',
  emptyText: 'Bu müəllimə hələ fənn təyin olunmayıb',
};

// ---------- Resurs tərifləri ----------

export const RESOURCES: Record<string, ResourceDef> = {

  // ==================== 1. TƏŞKİLAT ====================

  branches: {
    key: 'branches',
    title: 'Filiallar',
    titleSingular: 'Filial',
    description: 'Mərkəzin filialları və əlaqə məlumatları.',
    searchable: true,
    columns: [
      { key: 'name', label: 'Ad' },
      { key: 'code', label: 'Kod' },
      { key: 'address', label: 'Ünvan' },
      { key: 'phone', label: 'Telefon' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Ad', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Kod', type: 'text', width: 'half', placeholder: 'NRM' },
      { key: 'address', label: 'Ünvan', type: 'textarea' },
      { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
      { key: 'email', label: 'E-poçt', type: 'email', width: 'half' },
      { key: 'work_hours', label: 'İş saatları', type: 'text', width: 'half', placeholder: 'B.e-Ş: 09:00-21:00' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  rooms: {
    key: 'rooms',
    title: 'Otaqlar',
    titleSingular: 'Otaq',
    description: 'Filiallar üzrə dərs otaqları və tutumları.',
    searchable: true,
    filters: [{ key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' }],
    columns: [
      { key: 'name', label: 'Otaq' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'capacity', label: 'Tutum', type: 'number', align: 'center' },
      { key: 'floor', label: 'Mərtəbə' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Otaq adı', type: 'text', required: true, width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', required: true, width: 'half' },
      { key: 'capacity', label: 'Tutum', type: 'number', width: 'half' },
      { key: 'floor', label: 'Mərtəbə', type: 'text', width: 'half' },
      { key: 'notes', label: 'Qeyd', type: 'textarea' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  subjects: {
    key: 'subjects',
    title: 'Fənlər',
    titleSingular: 'Fənn',
    description: 'Tədris olunan fənlər.',
    searchable: true,
    columns: [
      { key: 'name', label: 'Fənn' },
      { key: 'code', label: 'Kod' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Fənn adı', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Kod', type: 'text', width: 'half' },
      { key: 'color', label: 'Rəng', type: 'color', width: 'half' },
      { key: 'icon', label: 'İkon', type: 'text', width: 'half', help: 'lucide-react ikon adı' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  levels: {
    key: 'levels',
    title: 'Səviyyələr',
    titleSingular: 'Səviyyə',
    description: 'CEFR və ya digər səviyyə skalası. Bal aralığı level imtahanında istifadə olunur.',
    searchable: true,
    filters: [{ key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' }],
    columns: [
      { key: 'name', label: 'Səviyyə' },
      { key: 'title', label: 'Təsvir' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
      { key: 'min_score', label: 'Min bal', type: 'number', align: 'center' },
      { key: 'max_score', label: 'Maks bal', type: 'number', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Səviyyə', type: 'text', required: true, width: 'half', placeholder: 'A1' },
      { key: 'title', label: 'Təsvir', type: 'text', width: 'half', placeholder: 'Başlanğıc' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects', width: 'half', help: 'Boş buraxılsa bütün fənlərə aiddir' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'min_score', label: 'Minimal bal', type: 'number', width: 'half' },
      { key: 'max_score', label: 'Maksimal bal', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  skills: {
    key: 'skills',
    title: 'Bacarıqlar',
    titleSingular: 'Bacarıq',
    description: 'İmtahanların bacarıq üzrə bölgüsü (dinləmə, oxu, yazı, danışıq).',
    searchable: true,
    filters: [{ key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' }],
    columns: [
      { key: 'name', label: 'Bacarıq' },
      { key: 'code', label: 'Kod' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Ad', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Kod', type: 'text', width: 'half', placeholder: 'listening' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects', width: 'half' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  // ==================== 2. İNSANLAR ====================

  teachers: {
    key: 'teachers',
    title: 'Müəllimlər',
    titleSingular: 'Müəllim',
    description: 'Müəllim heyəti, ixtisas və həftəlik yük.',
    searchable: true,
    archivable: true,
    rowActions: [
      {
        key: 'subjects',
        label: 'Fənlər',
        icon: 'book',
        kind: 'link',
        link: TEACHER_SUBJECTS_LINK,
        perm: { resource: 'teacher-subjects', action: 'read' },
      },
    ],
    filters: [
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'status', label: 'Status', type: 'select', options: PERSON_STATUS },
    ],
    columns: [
      { key: 'name', label: 'Ad Soyad' },
      { key: 'phone', label: 'Telefon' },
      { key: 'specialization', label: 'İxtisas' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'weekly_load_max', label: 'Həftəlik yük', type: 'number', align: 'center' },
      { key: 'status', label: 'Status', type: 'badge', map: PERSON_STATUS_MAP, badgeColors: PERSON_STATUS_COLORS },
    ],
    fields: [
      { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
      { key: 'email', label: 'E-poçt', type: 'email', width: 'half' },
      { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'specialization', label: 'İxtisas', type: 'text', width: 'half' },
      { key: 'hire_date', label: 'İşə qəbul tarixi', type: 'date', width: 'half' },
      { key: 'weekly_load_max', label: 'Maksimal həftəlik yük', type: 'number', width: 'half', help: 'Dərs sayı' },
      { key: 'status', label: 'Status', type: 'select', options: PERSON_STATUS, width: 'half' },
      { key: 'bio', label: 'Haqqında', type: 'textarea' },
    ],
  },

  'teacher-subjects': {
    key: 'teacher-subjects',
    title: 'Müəllim–fənn təyinatı',
    titleSingular: 'Təyinat',
    description: 'Hansı müəllimin hansı fənləri tədris etdiyi.',
    filters: [
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
    ],
    columns: [
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
    ],
    fields: [
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', required: true, width: 'half' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects', required: true, width: 'half' },
    ],
  },

  students: {
    key: 'students',
    title: 'Şagirdlər',
    titleSingular: 'Şagird',
    description: 'Şagird qeydiyyatı, filial və status.',
    searchable: true,
    archivable: true,
    inlineLinks: [STUDENT_GUARDIANS_LINK],
    rowActions: [
      {
        key: 'guardians',
        label: 'Valideynlər',
        icon: 'heart',
        kind: 'link',
        link: STUDENT_GUARDIANS_LINK,
        perm: { resource: 'student-guardians', action: 'read' },
      },
      {
        key: 'groups',
        label: 'Qruplar',
        icon: 'users',
        kind: 'link',
        link: STUDENT_GROUPS_LINK,
        perm: { resource: 'enrollments', action: 'read' },
      },
    ],
    filters: [
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'status', label: 'Status', type: 'select', options: PERSON_STATUS },
    ],
    columns: [
      { key: 'name', label: 'Ad Soyad' },
      { key: 'code', label: 'Kod' },
      { key: 'phone', label: 'Telefon' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'enrolled_at', label: 'Qeydiyyat', type: 'date' },
      { key: 'status', label: 'Status', type: 'badge', map: PERSON_STATUS_MAP, badgeColors: PERSON_STATUS_COLORS },
    ],
    fields: [
      { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Şagird kodu', type: 'text', width: 'half' },
      { key: 'email', label: 'E-poçt', type: 'email', width: 'half' },
      { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
      { key: 'birth_date', label: 'Doğum tarixi', type: 'date', width: 'half' },
      {
        key: 'gender', label: 'Cins', type: 'select', width: 'half',
        options: [{ value: 'male', label: 'Kişi' }, { value: 'female', label: 'Qadın' }],
      },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'status', label: 'Status', type: 'select', options: PERSON_STATUS, width: 'half' },
      { key: 'enrolled_at', label: 'Qeydiyyat tarixi', type: 'date', width: 'half' },
      { key: 'address', label: 'Ünvan', type: 'textarea' },
      { key: 'notes', label: 'Qeyd', type: 'textarea' },
    ],
  },

  guardians: {
    key: 'guardians',
    title: 'Valideynlər',
    titleSingular: 'Valideyn',
    description: 'Valideyn və qəyyum məlumatları.',
    searchable: true,
    archivable: true,
    inlineLinks: [GUARDIAN_STUDENTS_LINK],
    rowActions: [
      {
        key: 'students',
        label: 'Övladlar',
        icon: 'users',
        kind: 'link',
        link: GUARDIAN_STUDENTS_LINK,
        perm: { resource: 'student-guardians', action: 'read' },
      },
    ],
    columns: [
      { key: 'name', label: 'Ad Soyad' },
      { key: 'phone', label: 'Telefon' },
      { key: 'email', label: 'E-poçt' },
      { key: 'occupation', label: 'Peşə' },
    ],
    fields: [
      { key: 'name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
      { key: 'phone', label: 'Telefon', type: 'phone', width: 'half' },
      { key: 'email', label: 'E-poçt', type: 'email', width: 'half' },
      { key: 'occupation', label: 'Peşə', type: 'text', width: 'half' },
      { key: 'address', label: 'Ünvan', type: 'textarea' },
      { key: 'notes', label: 'Qeyd', type: 'textarea' },
    ],
  },

  // Sadə bağlantı ekranı (LinksScreen) — CrudPage 'links' açarını ona yönləndirir
  links: {
    key: 'links',
    title: 'Bağlantılar',
    titleSingular: 'Bağlantı',
    description: 'Şagirdləri valideyn və müəllimlərlə bağlayın.',
    readOnly: true,
    columns: [],
    fields: [],
  },

  'student-guardians': {
    key: 'student-guardians',
    title: 'Şagird–valideyn bağlantısı',
    titleSingular: 'Bağlantı',
    description: 'Bir şagirdin bir neçə qəyyumu, bir valideynin bir neçə övladı ola bilər.',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'guardian_id', label: 'Valideyn', type: 'relation', resource: 'guardians' },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'guardian_id', label: 'Valideyn', type: 'relation', resource: 'guardians' },
      { key: 'relation', label: 'Qohumluq' },
      { key: 'is_primary', label: 'Əsas', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'guardian_id', label: 'Valideyn', type: 'relation', resource: 'guardians', required: true, width: 'half' },
      {
        key: 'relation', label: 'Qohumluq', type: 'select', width: 'half',
        options: [
          { value: 'ana', label: 'Ana' }, { value: 'ata', label: 'Ata' },
          { value: 'qeyyum', label: 'Qəyyum' }, { value: 'diger', label: 'Digər' },
        ],
      },
      { key: 'is_primary', label: 'Əsas əlaqə', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'can_pickup', label: 'Uşağı götürə bilər', type: 'checkbox', placeholder: 'Bəli' },
    ],
  },

  // ==================== 3. TƏDRİS ====================

  groups: {
    key: 'groups',
    title: 'Qruplar',
    titleSingular: 'Qrup',
    description: 'Səviyyə qrupları, tutum və təyin olunmuş müəllim.',
    searchable: true,
    archivable: true,
    rowActions: [
      {
        key: 'students',
        label: 'Şagirdlər',
        icon: 'users',
        kind: 'link',
        link: GROUP_STUDENTS_LINK,
        perm: { resource: 'enrollments', action: 'read' },
      },
    ],
    filters: [
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
      { key: 'level_id', label: 'Səviyyə', type: 'relation', resource: 'levels' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
    ],
    columns: [
      { key: 'name', label: 'Qrup' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects' },
      { key: 'level_id', label: 'Səviyyə', type: 'relation', resource: 'levels' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms' },
      { key: 'capacity', label: 'Tutum', type: 'number', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Qrup adı', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Kod', type: 'text', width: 'half' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects', width: 'half' },
      { key: 'level_id', label: 'Səviyyə', type: 'relation', resource: 'levels', width: 'half' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms', width: 'half' },
      { key: 'capacity', label: 'Tutum', type: 'number', width: 'half' },
      { key: 'start_date', label: 'Başlama', type: 'date', width: 'half' },
      { key: 'end_date', label: 'Bitmə', type: 'date', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'planned', label: 'Planlaşdırılıb' },
          { value: 'active', label: 'Aktiv' },
          { value: 'finished', label: 'Bitib' },
        ],
      },
      { key: 'notes', label: 'Qeyd', type: 'textarea' },
    ],
  },

  enrollments: {
    key: 'enrollments',
    title: 'Qrup qeydiyyatı',
    titleSingular: 'Qeydiyyat',
    description: 'Şagirdlərin qruplara yazılması və tarixçəsi.',
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'joined_at', label: 'Qoşulub', type: 'date' },
      { key: 'left_at', label: 'Ayrılıb', type: 'date' },
      { key: 'status', label: 'Status', type: 'badge', map: { active: 'Aktiv', left: 'Ayrılıb', transferred: 'Köçürülüb' }, badgeColors: { active: '#16A34A', left: '#9AA3B2', transferred: '#0EA5E9' } },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', required: true, width: 'half' },
      { key: 'joined_at', label: 'Qoşulma tarixi', type: 'date', width: 'half' },
      { key: 'left_at', label: 'Ayrılma tarixi', type: 'date', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'active', label: 'Aktiv' },
          { value: 'left', label: 'Ayrılıb' },
          { value: 'transferred', label: 'Köçürülüb' },
        ],
      },
      { key: 'note', label: 'Qeyd', type: 'textarea' },
    ],
  },

  'schedule-slots': {
    key: 'schedule-slots',
    title: 'Dərs cədvəli',
    titleSingular: 'Cədvəl sətri',
    description: 'Həftəlik təkrarlanan dərs saatları.',
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms' },
      { key: 'weekday', label: 'Gün', type: 'select', options: WEEKDAYS },
    ],
    columns: [
      { key: 'weekday', label: 'Gün', type: 'badge', map: WEEKDAY_MAP },
      { key: 'start_time', label: 'Başlama' },
      { key: 'end_time', label: 'Bitmə' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms' },
    ],
    fields: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', required: true, width: 'half' },
      { key: 'weekday', label: 'Həftənin günü', type: 'select', options: WEEKDAYS, required: true, width: 'half' },
      { key: 'start_time', label: 'Başlama saatı', type: 'time', required: true, width: 'half' },
      { key: 'end_time', label: 'Bitmə saatı', type: 'time', required: true, width: 'half' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', width: 'half' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms', width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  'teacher-availability': {
    key: 'teacher-availability',
    title: 'Boş saatlar',
    titleSingular: 'Boş saat',
    description: 'Dərs təyin edilə bilən vaxt aralıqları.',
    filters: [
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'weekday', label: 'Gün', type: 'select', options: WEEKDAYS },
    ],
    columns: [
      { key: 'weekday', label: 'Gün', type: 'badge', map: WEEKDAY_MAP },
      { key: 'start_time', label: 'Başlama' },
      { key: 'end_time', label: 'Bitmə' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      { key: 'note', label: 'Qeyd' },
    ],
    fields: [
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', required: true, width: 'half' },
      { key: 'weekday', label: 'Həftənin günü', type: 'select', options: WEEKDAYS, required: true, width: 'half' },
      { key: 'start_time', label: 'Başlama saatı', type: 'time', required: true, width: 'half' },
      { key: 'end_time', label: 'Bitmə saatı', type: 'time', required: true, width: 'half' },
      { key: 'note', label: 'Qeyd', type: 'text' },
    ],
  },

  lessons: {
    key: 'lessons',
    title: 'Dərslər',
    titleSingular: 'Dərs',
    description: 'Konkret tarixdəki dərslər. Davamiyyət bunlara bağlanır.',
    searchable: true,
    toolbarActions: [
      {
        key: 'generate',
        label: 'Cədvəldən dərs yarat',
        description:
          'Həftəlik dərs cədvəlindəki sətirlərə əsasən seçilmiş tarix aralığı üçün dərslər yaradılır. Artıq mövcud olan dərslər təkrarlanmır.',
        path: '/ops/generate-lessons',
        perm: { resource: 'lessons', action: 'create' },
        successText: 'Dərslər yaradıldı',
        fields: [
          { key: 'date_from', label: 'Başlanğıc tarix', type: 'date', required: true, width: 'half' },
          { key: 'date_to', label: 'Son tarix', type: 'date', required: true, width: 'half' },
          { key: 'group_id', label: 'Yalnız bu qrup üçün', type: 'relation', resource: 'groups', width: 'half' },
        ],
      },
    ],
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'scheduled', label: 'Planlaşdırılıb' },
          { value: 'held', label: 'Keçirilib' },
          { value: 'cancelled', label: 'Ləğv edilib' },
          { value: 'postponed', label: 'Təxirə salınıb' },
        ],
      },
    ],
    columns: [
      { key: 'date', label: 'Tarix', type: 'date' },
      { key: 'start_time', label: 'Saat' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'topic', label: 'Mövzu' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms' },
      {
        key: 'status', label: 'Status', type: 'badge',
        map: { scheduled: 'Planlaşdırılıb', held: 'Keçirilib', cancelled: 'Ləğv edilib', postponed: 'Təxirə salınıb' },
        badgeColors: { scheduled: '#0EA5E9', held: '#16A34A', cancelled: '#DC2626', postponed: '#D97706' },
      },
    ],
    fields: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', required: true, width: 'half' },
      { key: 'date', label: 'Tarix', type: 'date', required: true, width: 'half' },
      { key: 'start_time', label: 'Başlama', type: 'time', width: 'half' },
      { key: 'end_time', label: 'Bitmə', type: 'time', width: 'half' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', width: 'half' },
      { key: 'room_id', label: 'Otaq', type: 'relation', resource: 'rooms', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'scheduled', label: 'Planlaşdırılıb' },
          { value: 'held', label: 'Keçirilib' },
          { value: 'cancelled', label: 'Ləğv edilib' },
          { value: 'postponed', label: 'Təxirə salınıb' },
        ],
      },
      { key: 'topic', label: 'Mövzu', type: 'text' },
      { key: 'note', label: 'Qeyd', type: 'textarea' },
    ],
  },

  attendance: {
    key: 'attendance',
    title: 'Davamiyyət',
    titleSingular: 'Davamiyyət qeydi',
    description: 'Şagirdlərin dərsə iştirakı.',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'status', label: 'Status', type: 'select', options: ATTENDANCE_STATUS },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'lesson_id', label: 'Dərs', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge', map: ATTENDANCE_MAP, badgeColors: ATTENDANCE_COLORS },
      { key: 'late_min', label: 'Gecikmə (dəq)', type: 'number', align: 'center' },
      { key: 'note', label: 'Qeyd' },
    ],
    fields: [
      { key: 'lesson_id', label: 'Dərs ID', type: 'number', required: true, width: 'half' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'status', label: 'Status', type: 'select', options: ATTENDANCE_STATUS, required: true, width: 'half' },
      { key: 'late_min', label: 'Gecikmə (dəqiqə)', type: 'number', width: 'half' },
      { key: 'note', label: 'Qeyd', type: 'text' },
    ],
  },

  // ==================== 4. QİYMƏTLƏNDİRMƏ ====================

  exams: {
    key: 'exams',
    title: 'İmtahanlar',
    titleSingular: 'İmtahan',
    description: 'İmtahan yaradın, sual əlavə edin və dərc edin.',
    searchable: true,
    archivable: true,
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      {
        key: 'kind', label: 'Növ', type: 'select',
        options: [
          { value: 'quiz', label: 'Quiz' },
          { value: 'midterm', label: 'Aralıq' },
          { value: 'final', label: 'Final' },
          { value: 'placement', label: 'Level imtahanı' },
        ],
      },
      { key: 'status', label: 'Status', type: 'select', options: PUBLISH_STATUS },
    ],
    columns: [
      { key: 'title', label: 'Başlıq' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'kind', label: 'Növ', type: 'badge', map: { quiz: 'Quiz', midterm: 'Aralıq', final: 'Final', placement: 'Level' } },
      { key: 'duration_min', label: 'Müddət', type: 'number', align: 'center' },
      { key: 'total_points', label: 'Bal', type: 'number', align: 'center' },
      { key: 'exam_date', label: 'Tarix', type: 'date' },
      { key: 'status', label: 'Status', type: 'badge', map: PUBLISH_MAP, badgeColors: PUBLISH_COLORS },
    ],
    fields: [
      { key: 'title', label: 'Başlıq', type: 'text', required: true, width: 'half' },
      {
        key: 'kind', label: 'Növ', type: 'select', width: 'half',
        options: [
          { value: 'quiz', label: 'Quiz' },
          { value: 'midterm', label: 'Aralıq' },
          { value: 'final', label: 'Final' },
          { value: 'placement', label: 'Level imtahanı' },
        ],
      },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', width: 'half' },
      { key: 'subject_id', label: 'Fənn', type: 'relation', resource: 'subjects', width: 'half' },
      { key: 'level_id', label: 'Səviyyə', type: 'relation', resource: 'levels', width: 'half' },
      { key: 'exam_date', label: 'İmtahan tarixi', type: 'date', width: 'half' },
      { key: 'duration_min', label: 'Müddət (dəqiqə)', type: 'number', width: 'half' },
      { key: 'total_points', label: 'Ümumi bal', type: 'number', width: 'half' },
      { key: 'pass_percent', label: 'Keçid faizi', type: 'number', width: 'half', min: 0, max: 100 },
      { key: 'status', label: 'Status', type: 'select', options: PUBLISH_STATUS, width: 'half' },
      { key: 'shuffle_questions', label: 'Sualları qarışdır', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'instructions', label: 'Təlimat', type: 'textarea' },
    ],
  },

  questions: {
    key: 'questions',
    title: 'Suallar',
    titleSingular: 'Sual',
    description: 'İmtahan sualları. Sual növünü seçəndən sonra variantlar və düzgün cavab aşağıda görünəcək.',
    searchable: true,
    filters: [
      { key: 'exam_id', label: 'İmtahan', type: 'relation', resource: 'exams', labelKey: 'title' },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills' },
    ],
    columns: [
      { key: 'sort_order', label: '#', type: 'number', align: 'center' },
      { key: 'text', label: 'Sual' },
      { key: 'type', label: 'Növ', type: 'badge', map: { mcq: 'Çoxvariantlı', multi: 'Çoxseçimli', truefalse: 'Doğru/Yanlış', gap: 'Boşluq', open: 'Açıq', match: 'Uyğunlaşdırma', numeric: 'Ədədi' } },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills' },
      { key: 'points', label: 'Bal', type: 'number', align: 'center' },
    ],
    fields: [
      { key: 'exam_id', label: 'İmtahan', type: 'relation', resource: 'exams', required: true, width: 'half' },
      {
        key: 'type', label: 'Sual növü', type: 'select', required: true, width: 'half',
        options: [
          { value: 'mcq', label: 'Çoxvariantlı (bir cavab)' },
          { value: 'multi', label: 'Çoxseçimli' },
          { value: 'truefalse', label: 'Doğru / Yanlış' },
          { value: 'gap', label: 'Boşluq doldurma' },
          { value: 'open', label: 'Açıq sual' },
          { value: 'match', label: 'Uyğunlaşdırma' },
          { value: 'numeric', label: 'Ədədi cavab' },
        ],
      },
      { key: 'text', label: 'Sual mətni', type: 'textarea', required: true },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills', width: 'half' },
      { key: 'points', label: 'Bal', type: 'number', width: 'half' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      {
        key: 'media_url', label: 'Səs və ya şəkil linki', type: 'text', width: 'half',
        help: 'Dinləmə sualı üçün səs faylı linki (.mp3/.wav), "Şəkli təsvir et" sualı üçün şəkil linki (.jpg/.png) qoyun. Boş buraxsanız adi mətn sualı olacaq.',
      },
      // Variantlar və düzgün cavab — sual növünə görə dəyişən xüsusi
      // redaktordur (bax QuestionAnswerEditor.tsx). Adi formada
      // göstərilmir (hidden: true), CrudPage onu sual növündən asılı
      // olaraq ayrıca çəkir — dəyər yenə də yüklənir/göndərilir.
      { key: 'options', label: 'Variantlar', type: 'textarea', hidden: true },
      { key: 'correct_answer', label: 'Düzgün cavab', type: 'textarea', hidden: true },
      { key: 'explanation', label: 'İzah (cavab göstəriləndə şagirdə görünür)', type: 'textarea' },
    ],
  },

  'exam-submissions': {
    key: 'exam-submissions',
    title: 'İmtahan işləri',
    titleSingular: 'İmtahan işi',
    description: 'Şagird işləri və qiymətləndirmə.',
    toolbarActions: [
      {
        key: 'grade-pending',
        label: 'Gözləyənləri yoxla',
        description:
          'Göndərilmiş bütün işlərdə bağlı tipli suallar (çoxvariantlı, doğru/yanlış, boşluq, uyğunlaşdırma) avtomatik yoxlanır, bacarıq üzrə bölgü hesablanır və nəticə şagirdə bildirilir. Açıq sualların balı toxunulmaz qalır.',
        path: '/ops/grade-pending',
        perm: { resource: 'exam-submissions', action: 'update' },
        successText: 'Yoxlanıldı',
        fields: [
          { key: 'exam_id', label: 'Yalnız bu imtahan üçün', type: 'relation', resource: 'exams', width: 'half' },
        ],
      },
    ],
    rowActions: [
      {
        key: 'grade',
        label: 'Avtomatik yoxla',
        icon: 'check',
        kind: 'endpoint',
        perm: { resource: 'exam-submissions', action: 'update' },
        endpoint: {
          path: '/ops/grade-submission',
          idKey: 'submission_id',
          confirmText:
            'Bağlı tipli suallar avtomatik yoxlanacaq, bacarıq bölgüsü yenidən hesablanacaq və iş "Qiymətləndirilib" statusuna keçəcək.',
          successText: 'Yoxlanıldı',
        },
      },
    ],
    filters: [
      { key: 'exam_id', label: 'İmtahan', type: 'relation', resource: 'exams' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'in_progress', label: 'Davam edir' },
          { value: 'submitted', label: 'Göndərilib' },
          { value: 'grading', label: 'Yoxlanılır' },
          { value: 'graded', label: 'Qiymətləndirilib' },
        ],
      },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'exam_id', label: 'İmtahan', type: 'relation', resource: 'exams' },
      { key: 'submitted_at', label: 'Göndərilib', type: 'date' },
      { key: 'total_score', label: 'Bal', type: 'number', align: 'center' },
      { key: 'percentage', label: '%', type: 'number', align: 'center' },
      {
        key: 'status', label: 'Status', type: 'badge',
        map: { in_progress: 'Davam edir', submitted: 'Göndərilib', grading: 'Yoxlanılır', graded: 'Qiymətləndirilib' },
        badgeColors: { in_progress: '#0EA5E9', submitted: '#D97706', grading: '#8B5CF6', graded: '#16A34A' },
      },
    ],
    fields: [
      { key: 'exam_id', label: 'İmtahan', type: 'relation', resource: 'exams', required: true, width: 'half' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'manual_score', label: 'Əl ilə verilən bal', type: 'number', width: 'half' },
      { key: 'total_score', label: 'Ümumi bal', type: 'number', width: 'half' },
      { key: 'percentage', label: 'Faiz', type: 'number', width: 'half', min: 0, max: 100 },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'in_progress', label: 'Davam edir' },
          { value: 'submitted', label: 'Göndərilib' },
          { value: 'grading', label: 'Yoxlanılır' },
          { value: 'graded', label: 'Qiymətləndirilib' },
        ],
      },
      { key: 'feedback', label: 'Rəy', type: 'textarea' },
    ],
  },

  answers: {
    key: 'answers',
    title: 'Cavablar',
    titleSingular: 'Cavab',
    description: 'Açıq sualların əl ilə qiymətləndirilməsi.',
    filters: [{ key: 'submission_id', label: 'İş', type: 'select', options: [] }],
    columns: [
      { key: 'question_id', label: 'Sual', type: 'number' },
      { key: 'is_correct', label: 'Düzgün', type: 'bool', align: 'center' },
      { key: 'score', label: 'Bal', type: 'number', align: 'center' },
      { key: 'teacher_comment', label: 'Şərh' },
    ],
    fields: [
      { key: 'score', label: 'Bal', type: 'number', width: 'half' },
      { key: 'is_correct', label: 'Düzgün sayılsın', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'teacher_comment', label: 'Müəllim şərhi', type: 'textarea' },
    ],
  },

  'skill-scores': {
    key: 'skill-scores',
    title: 'Bacarıq balları',
    titleSingular: 'Bacarıq balı',
    description: 'Dinləmə / oxu / yazı / danışıq üzrə bölgü.',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills' },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills' },
      { key: 'score', label: 'Bal', type: 'number', align: 'center' },
      { key: 'max_score', label: 'Maks', type: 'number', align: 'center' },
      { key: 'percentage', label: '%', type: 'number', align: 'center' },
    ],
    fields: [
      { key: 'submission_id', label: 'İş ID', type: 'number', required: true, width: 'half' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'skill_id', label: 'Bacarıq', type: 'relation', resource: 'skills', required: true, width: 'half' },
      { key: 'score', label: 'Bal', type: 'number', width: 'half' },
      { key: 'max_score', label: 'Maksimal bal', type: 'number', width: 'half' },
      { key: 'percentage', label: 'Faiz', type: 'number', width: 'half' },
    ],
  },

  'placement-results': {
    key: 'placement-results',
    title: 'Level imtahanları',
    titleSingular: 'Level nəticəsi',
    description: 'Yeni şagirdlərin səviyyə qiymətləndirməsi və qrup tövsiyəsi.',
    searchable: true,
    rowActions: [
      {
        key: 'place',
        label: 'Şagirdə çevir',
        icon: 'check',
        kind: 'endpoint',
        perm: { resource: 'students', action: 'create' },
        when: { status: 'pending' },
        endpoint: {
          path: '/ops/place-applicant',
          idKey: 'placement_id',
          confirmText:
            'Müraciətçi şagird kimi qeydiyyata alınacaq. Qrup seçsəniz, həmin qrupa da yazılacaq və nəticə "Yerləşdirilib" olaraq işarələnəcək.',
          successText: 'Şagird yaradıldı',
          fields: [
            { key: 'group_id', label: 'Qrupa yaz', type: 'relation', resource: 'groups', width: 'half' },
            { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
          ],
        },
      },
    ],
    filters: [
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'pending', label: 'Gözləyir' },
          { value: 'placed', label: 'Yerləşdirilib' },
          { value: 'rejected', label: 'Rədd edilib' },
        ],
      },
    ],
    columns: [
      { key: 'applicant_name', label: 'Ad Soyad' },
      { key: 'applicant_phone', label: 'Telefon' },
      { key: 'recommended_level_id', label: 'Tövsiyə', type: 'relation', resource: 'levels' },
      { key: 'assigned_group_id', label: 'Təyin olunan qrup', type: 'relation', resource: 'groups' },
      {
        key: 'status', label: 'Status', type: 'badge',
        map: { pending: 'Gözləyir', placed: 'Yerləşdirilib', rejected: 'Rədd edilib' },
        badgeColors: { pending: '#D97706', placed: '#16A34A', rejected: '#9AA3B2' },
      },
    ],
    fields: [
      { key: 'applicant_name', label: 'Ad Soyad', type: 'text', required: true, width: 'half' },
      { key: 'applicant_phone', label: 'Telefon', type: 'phone', width: 'half' },
      { key: 'applicant_email', label: 'E-poçt', type: 'email', width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'recommended_level_id', label: 'Tövsiyə edilən səviyyə', type: 'relation', resource: 'levels', width: 'half' },
      { key: 'assigned_group_id', label: 'Təyin olunan qrup', type: 'relation', resource: 'groups', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'pending', label: 'Gözləyir' },
          { value: 'placed', label: 'Yerləşdirilib' },
          { value: 'rejected', label: 'Rədd edilib' },
        ],
      },
      { key: 'note', label: 'Qeyd', type: 'textarea' },
    ],
  },

  // ==================== 5. KURS MATERİALI ====================

  'syllabus-weeks': {
    key: 'syllabus-weeks',
    title: 'Sillabus',
    titleSingular: 'Həftə',
    description: 'Həftəlik kurs planı və mövzular.',
    searchable: true,
    filters: [{ key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' }],
    columns: [
      { key: 'week_no', label: 'Həftə', type: 'number', align: 'center' },
      { key: 'topic', label: 'Mövzu' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'start_date', label: 'Başlama', type: 'date' },
      { key: 'is_published', label: 'Dərc', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', required: true, width: 'half' },
      { key: 'week_no', label: 'Həftə nömrəsi', type: 'number', required: true, width: 'half' },
      { key: 'topic', label: 'Mövzu', type: 'text', required: true },
      { key: 'start_date', label: 'Başlama tarixi', type: 'date', width: 'half' },
      { key: 'is_published', label: 'Dərc olunsun', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'description', label: 'Təsvir', type: 'textarea' },
    ],
  },

  materials: {
    key: 'materials',
    title: 'Materiallar',
    titleSingular: 'Material',
    description: 'Dərs materialları, fayllar və linklər.',
    searchable: true,
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      {
        key: 'type', label: 'Növ', type: 'select',
        options: [
          { value: 'file', label: 'Fayl' },
          { value: 'link', label: 'Link' },
          { value: 'video', label: 'Video' },
          { value: 'text', label: 'Mətn' },
        ],
      },
    ],
    columns: [
      { key: 'title', label: 'Başlıq' },
      { key: 'type', label: 'Növ', type: 'badge', map: { file: 'Fayl', link: 'Link', video: 'Video', text: 'Mətn' } },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'is_published', label: 'Dərc', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'title', label: 'Başlıq', type: 'text', required: true, width: 'half' },
      {
        key: 'type', label: 'Növ', type: 'select', width: 'half',
        options: [
          { value: 'file', label: 'Fayl' },
          { value: 'link', label: 'Link' },
          { value: 'video', label: 'Video' },
          { value: 'text', label: 'Mətn' },
        ],
      },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', width: 'half' },
      { key: 'syllabus_week_id', label: 'Sillabus həftəsi', type: 'relation', resource: 'syllabus-weeks', labelKey: 'topic', width: 'half' },
      { key: 'file_url', label: 'Fayl linki', type: 'text', width: 'half' },
      { key: 'link_url', label: 'Xarici link', type: 'text', width: 'half' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'is_published', label: 'Dərc olunsun', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'description', label: 'Təsvir', type: 'textarea' },
    ],
  },

  assignments: {
    key: 'assignments',
    title: 'Tapşırıqlar',
    titleSingular: 'Tapşırıq',
    description: 'Ev tapşırıqları və son tarixlər.',
    searchable: true,
    archivable: true,
    filters: [
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers' },
    ],
    columns: [
      { key: 'title', label: 'Başlıq' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'due_date', label: 'Son tarix', type: 'date' },
      { key: 'max_points', label: 'Maks bal', type: 'number', align: 'center' },
      { key: 'is_published', label: 'Dərc', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'title', label: 'Başlıq', type: 'text', required: true },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', required: true, width: 'half' },
      { key: 'teacher_id', label: 'Müəllim', type: 'relation', resource: 'teachers', width: 'half' },
      { key: 'due_date', label: 'Son tarix', type: 'date', width: 'half' },
      { key: 'max_points', label: 'Maksimal bal', type: 'number', width: 'half' },
      { key: 'syllabus_week_id', label: 'Sillabus həftəsi', type: 'relation', resource: 'syllabus-weeks', labelKey: 'topic', width: 'half' },
      { key: 'allow_late', label: 'Gec təhvilə icazə', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'is_published', label: 'Dərc olunsun', type: 'checkbox', placeholder: 'Bəli' },
      { key: 'description', label: 'Tapşırıq mətni', type: 'textarea' },
    ],
  },

  'assignment-submissions': {
    key: 'assignment-submissions',
    title: 'Tapşırıq təhvilləri',
    titleSingular: 'Təhvil',
    description: 'Şagirdlərin təhvil verdiyi işlər.',
    filters: [
      { key: 'assignment_id', label: 'Tapşırıq', type: 'relation', resource: 'assignments', labelKey: 'title' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'pending', label: 'Gözlənilir' },
          { value: 'submitted', label: 'Göndərilib' },
          { value: 'late', label: 'Gec' },
          { value: 'graded', label: 'Qiymətləndirilib' },
        ],
      },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'assignment_id', label: 'Tapşırıq', type: 'relation', resource: 'assignments' },
      { key: 'submitted_at', label: 'Təhvil', type: 'date' },
      { key: 'grade', label: 'Qiymət', type: 'number', align: 'center' },
      {
        key: 'status', label: 'Status', type: 'badge',
        map: { pending: 'Gözlənilir', submitted: 'Göndərilib', late: 'Gec', graded: 'Qiymətləndirilib' },
        badgeColors: { pending: '#9AA3B2', submitted: '#0EA5E9', late: '#D97706', graded: '#16A34A' },
      },
    ],
    fields: [
      { key: 'assignment_id', label: 'Tapşırıq', type: 'relation', resource: 'assignments', required: true, width: 'half' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'grade', label: 'Qiymət', type: 'number', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'pending', label: 'Gözlənilir' },
          { value: 'submitted', label: 'Göndərilib' },
          { value: 'late', label: 'Gec' },
          { value: 'graded', label: 'Qiymətləndirilib' },
        ],
      },
      { key: 'content', label: 'Cavab mətni', type: 'textarea' },
      { key: 'feedback', label: 'Rəy', type: 'textarea' },
    ],
  },

  // ==================== 6. KOMMUNİKASİYA ====================

  messages: {
    key: 'messages',
    title: 'İsmarıclar',
    titleSingular: 'İsmarıc',
    description: 'Müəllim, şagird və valideynlər arasında yazışma.',
    searchable: true,
    columns: [
      { key: 'subject', label: 'Mövzu' },
      { key: 'body', label: 'Mətn' },
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'is_read', label: 'Oxunub', type: 'bool', align: 'center' },
      { key: 'created_at', label: 'Tarix', type: 'date' },
    ],
    fields: [
      { key: 'to_user_id', label: 'Alıcı (istifadəçi ID)', type: 'number', required: true, width: 'half' },
      { key: 'student_id', label: 'Hansı şagird haqqında', type: 'relation', resource: 'students', width: 'half' },
      { key: 'subject', label: 'Mövzu', type: 'text' },
      { key: 'body', label: 'Mətn', type: 'textarea', required: true },
    ],
  },

  announcements: {
    key: 'announcements',
    title: 'Elanlar',
    titleSingular: 'Elan',
    description: 'Rollara və qruplara hədəflənmiş bildirişlər.',
    searchable: true,
    filters: [
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'draft', label: 'Layihə' },
          { value: 'published', label: 'Dərc olunub' },
        ],
      },
    ],
    columns: [
      { key: 'title', label: 'Başlıq' },
      { key: 'status', label: 'Status', type: 'badge', map: PUBLISH_MAP, badgeColors: PUBLISH_COLORS },
      { key: 'published_at', label: 'Dərc tarixi', type: 'date' },
      { key: 'expires_at', label: 'Bitmə', type: 'date' },
    ],
    fields: [
      { key: 'title', label: 'Başlıq', type: 'text', required: true },
      { key: 'body', label: 'Mətn', type: 'textarea', required: true },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'draft', label: 'Layihə' },
          { value: 'published', label: 'Dərc olunub' },
        ],
      },
      { key: 'expires_at', label: 'Bitmə tarixi', type: 'date', width: 'half' },
    ],
  },

  notifications: {
    key: 'notifications',
    title: 'Bildirişlər',
    titleSingular: 'Bildiriş',
    readOnly: true,
    filters: [
      {
        key: 'is_read', label: 'Oxunub', type: 'select',
        options: [{ value: 'true', label: 'Bəli' }, { value: 'false', label: 'Xeyr' }],
      },
    ],
    columns: [
      { key: 'title', label: 'Başlıq' },
      { key: 'body', label: 'Mətn' },
      { key: 'type', label: 'Növ' },
      { key: 'is_read', label: 'Oxunub', type: 'bool', align: 'center' },
      { key: 'created_at', label: 'Tarix', type: 'date' },
    ],
    fields: [],
  },

  // ==================== 7. MALİYYƏ ====================

  'tuition-plans': {
    key: 'tuition-plans',
    title: 'Təhsil haqqı tarifləri',
    titleSingular: 'Tarif',
    description: 'Qrup və səviyyə üzrə qiymət şablonları.',
    searchable: true,
    filters: [
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
    ],
    columns: [
      { key: 'name', label: 'Tarif' },
      { key: 'amount', label: 'Məbləğ', type: 'money', align: 'right' },
      { key: 'currency', label: 'Valyuta' },
      { key: 'period', label: 'Dövr', type: 'badge', map: { monthly: 'Aylıq', course: 'Kurs', lesson: 'Dərs' } },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Tarif adı', type: 'text', required: true, width: 'half' },
      { key: 'amount', label: 'Məbləğ', type: 'number', required: true, width: 'half', step: 0.01 },
      { key: 'currency', label: 'Valyuta', type: 'text', width: 'half', placeholder: 'AZN' },
      {
        key: 'period', label: 'Dövr', type: 'select', width: 'half',
        options: [
          { value: 'monthly', label: 'Aylıq' },
          { value: 'course', label: 'Kurs üzrə' },
          { value: 'lesson', label: 'Dərs üzrə' },
        ],
      },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', width: 'half' },
      { key: 'level_id', label: 'Səviyyə', type: 'relation', resource: 'levels', width: 'half' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches', width: 'half' },
      { key: 'due_day_of_month', label: 'Ödəniş günü', type: 'number', width: 'half', min: 1, max: 31 },
      { key: 'installment_count', label: 'Hissə sayı', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  'student-tuitions': {
    key: 'student-tuitions',
    title: 'Şagird tarifləri',
    titleSingular: 'Şagird tarifi',
    description: 'Konkret şagirdlə bağlanan tarif və endirim.',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups' },
      { key: 'amount', label: 'Məbləğ', type: 'money', align: 'right' },
      { key: 'discount_pct', label: 'Endirim %', type: 'number', align: 'center' },
      { key: 'final_amount', label: 'Yekun', type: 'money', align: 'right' },
      { key: 'status', label: 'Status', type: 'badge', map: { active: 'Aktiv', paused: 'Dayandırılıb', ended: 'Bitib' }, badgeColors: PERSON_STATUS_COLORS },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'tuition_plan_id', label: 'Tarif', type: 'relation', resource: 'tuition-plans', width: 'half' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', width: 'half' },
      { key: 'amount', label: 'Məbləğ', type: 'number', width: 'half', step: 0.01 },
      { key: 'discount_pct', label: 'Endirim (%)', type: 'number', width: 'half', min: 0, max: 100 },
      { key: 'final_amount', label: 'Yekun məbləğ', type: 'number', width: 'half', step: 0.01 },
      { key: 'start_date', label: 'Başlama', type: 'date', width: 'half' },
      { key: 'end_date', label: 'Bitmə', type: 'date', width: 'half' },
      {
        key: 'status', label: 'Status', type: 'select', width: 'half',
        options: [
          { value: 'active', label: 'Aktiv' },
          { value: 'paused', label: 'Dayandırılıb' },
          { value: 'ended', label: 'Bitib' },
        ],
      },
      { key: 'note', label: 'Qeyd', type: 'textarea' },
    ],
  },

  invoices: {
    key: 'invoices',
    title: 'Ödənişlər',
    titleSingular: 'Ödəniş',
    description: 'Aylıq qaimələr, gecikmələr və ödəniş tarixçəsi.',
    searchable: true,
    toolbarActions: [
      {
        key: 'generate',
        label: 'Aylıq qaimələri kəs',
        description:
          'Aktiv şagird tarifləri üzrə seçilmiş dövr üçün qaimələr yaradılır. Həmin dövr üçün qaiməsi olan şagird təkrarlanmır.',
        path: '/ops/generate-invoices',
        perm: { resource: 'invoices', action: 'create' },
        successText: 'Qaimələr yaradıldı',
        fields: [
          { key: 'period', label: 'Dövr', type: 'text', required: true, width: 'half', placeholder: '2026-09', help: 'İl-ay formatında' },
          { key: 'due_day', label: 'Son ödəniş günü', type: 'number', width: 'half', min: 1, max: 31, placeholder: '5' },
        ],
      },
      {
        key: 'overdue',
        label: 'Gecikənləri işarələ',
        description:
          'Son ödəniş tarixi keçmiş və hələ ödənilməmiş qaimələr "Gecikir" statusuna keçirilir və valideynlərə bildiriş göndərilir.',
        path: '/ops/mark-overdue',
        perm: { resource: 'invoices', action: 'update' },
        successText: 'Statuslar yeniləndi',
      },
    ],
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'branch_id', label: 'Filial', type: 'relation', resource: 'branches' },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUS },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'period_label', label: 'Dövr' },
      { key: 'amount', label: 'Məbləğ', type: 'money', align: 'right' },
      { key: 'paid_amount', label: 'Ödənilib', type: 'money', align: 'right' },
      { key: 'due_date', label: 'Son tarix', type: 'date' },
      { key: 'status', label: 'Status', type: 'badge', map: INVOICE_MAP, badgeColors: INVOICE_COLORS },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'group_id', label: 'Qrup', type: 'relation', resource: 'groups', width: 'half' },
      { key: 'period_label', label: 'Dövr', type: 'text', width: 'half', placeholder: '2026-07' },
      { key: 'number', label: 'Qaimə nömrəsi', type: 'text', width: 'half' },
      { key: 'amount', label: 'Məbləğ', type: 'number', required: true, width: 'half', step: 0.01 },
      { key: 'paid_amount', label: 'Ödənilən məbləğ', type: 'number', width: 'half', step: 0.01 },
      { key: 'currency', label: 'Valyuta', type: 'text', width: 'half', placeholder: 'AZN' },
      { key: 'due_date', label: 'Son ödəniş tarixi', type: 'date', width: 'half' },
      { key: 'paid_at', label: 'Ödəniş tarixi', type: 'date', width: 'half' },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUS, width: 'half' },
      {
        key: 'method', label: 'Ödəniş üsulu', type: 'select', width: 'half',
        options: [
          { value: 'cash', label: 'Nağd' },
          { value: 'card', label: 'Kart' },
          { value: 'transfer', label: 'Köçürmə' },
          { value: 'online', label: 'Onlayn' },
        ],
      },
      { key: 'reference', label: 'İstinad', type: 'text', width: 'half' },
      { key: 'note', label: 'Qeyd', type: 'textarea' },
    ],
  },

  // ==================== 8. MOTİVASİYA ====================

  'xp-events': {
    key: 'xp-events',
    title: 'XP tarixçəsi',
    titleSingular: 'XP qeydi',
    description: 'Şagirdlərin qazandığı bal hərəkətləri.',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      {
        key: 'source', label: 'Mənbə', type: 'select',
        options: [
          { value: 'exam', label: 'İmtahan' },
          { value: 'assignment', label: 'Tapşırıq' },
          { value: 'attendance', label: 'Davamiyyət' },
          { value: 'streak', label: 'Ardıcıllıq' },
          { value: 'manual', label: 'Əl ilə' },
        ],
      },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'source', label: 'Mənbə', type: 'badge', map: { exam: 'İmtahan', assignment: 'Tapşırıq', attendance: 'Davamiyyət', streak: 'Ardıcıllıq', manual: 'Əl ilə' } },
      { key: 'points', label: 'Bal', type: 'number', align: 'center' },
      { key: 'note', label: 'Qeyd' },
      { key: 'created_at', label: 'Tarix', type: 'date' },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'points', label: 'Bal', type: 'number', required: true, width: 'half' },
      {
        key: 'source', label: 'Mənbə', type: 'select', width: 'half',
        options: [
          { value: 'manual', label: 'Əl ilə' },
          { value: 'exam', label: 'İmtahan' },
          { value: 'assignment', label: 'Tapşırıq' },
          { value: 'attendance', label: 'Davamiyyət' },
          { value: 'streak', label: 'Ardıcıllıq' },
        ],
      },
      { key: 'note', label: 'Qeyd', type: 'text' },
    ],
  },

  achievements: {
    key: 'achievements',
    title: 'Nailiyyətlər',
    titleSingular: 'Nailiyyət',
    description: 'Qazanıla bilən nişanlar və XP mükafatı.',
    searchable: true,
    columns: [
      { key: 'icon', label: '' },
      { key: 'title', label: 'Nailiyyət' },
      { key: 'code', label: 'Kod' },
      { key: 'xp_reward', label: 'XP', type: 'number', align: 'center' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'title', label: 'Başlıq', type: 'text', required: true, width: 'half' },
      { key: 'code', label: 'Kod', type: 'text', required: true, width: 'half', placeholder: 'first_exam' },
      { key: 'icon', label: 'İkon', type: 'text', width: 'half', placeholder: '🏆' },
      { key: 'xp_reward', label: 'XP mükafatı', type: 'number', width: 'half' },
      { key: 'sort_order', label: 'Sıra', type: 'number', width: 'half' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
      { key: 'description', label: 'Təsvir', type: 'textarea' },
    ],
  },

  'student-achievements': {
    key: 'student-achievements',
    title: 'Qazanılan nailiyyətlər',
    titleSingular: 'Nailiyyət',
    filters: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'achievement_id', label: 'Nailiyyət', type: 'relation', resource: 'achievements', labelKey: 'title' },
    ],
    columns: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students' },
      { key: 'achievement_id', label: 'Nailiyyət', type: 'relation', resource: 'achievements' },
      { key: 'progress', label: 'İrəliləyiş', type: 'number', align: 'center' },
      { key: 'earned_at', label: 'Qazanılıb', type: 'date' },
    ],
    fields: [
      { key: 'student_id', label: 'Şagird', type: 'relation', resource: 'students', required: true, width: 'half' },
      { key: 'achievement_id', label: 'Nailiyyət', type: 'relation', resource: 'achievements', required: true, width: 'half' },
      { key: 'progress', label: 'İrəliləyiş (%)', type: 'number', width: 'half', min: 0, max: 100 },
    ],
  },

  // ==================== 9. İDARƏ ====================

  'sub-roles': {
    key: 'sub-roles',
    title: 'Alt rollar',
    titleSingular: 'Alt rol',
    description: 'Baza rolun daraldılmış icazə dəsti. Alt rol icazəni yalnız azalda bilər.',
    searchable: true,
    filters: [
      {
        key: 'base_role', label: 'Baza rol', type: 'select',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'teacher', label: 'Müəllim' },
          { value: 'student', label: 'Şagird' },
          { value: 'guardian', label: 'Valideyn' },
        ],
      },
    ],
    columns: [
      { key: 'name', label: 'Ad' },
      { key: 'base_role', label: 'Baza rol', type: 'badge', map: { admin: 'Admin', teacher: 'Müəllim', student: 'Şagird', guardian: 'Valideyn' } },
      { key: 'description', label: 'Təsvir' },
      { key: 'is_active', label: 'Aktiv', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'name', label: 'Ad', type: 'text', required: true, width: 'half' },
      {
        key: 'base_role', label: 'Baza rol', type: 'select', required: true, width: 'half',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'teacher', label: 'Müəllim' },
          { value: 'student', label: 'Şagird' },
          { value: 'guardian', label: 'Valideyn' },
        ],
      },
      { key: 'description', label: 'Təsvir', type: 'textarea' },
      { key: 'is_active', label: 'Vəziyyət', type: 'checkbox', placeholder: 'Aktiv' },
    ],
  },

  settings: {
    key: 'settings',
    title: 'Tənzimləmələr',
    titleSingular: 'Parametr',
    description: 'Mərkəzin sistem parametrləri.',
    searchable: true,
    filters: [
      {
        key: 'group_name', label: 'Bölmə', type: 'select',
        options: [
          { value: 'general', label: 'Ümumi' },
          { value: 'academic', label: 'Tədris' },
          { value: 'finance', label: 'Maliyyə' },
        ],
      },
    ],
    columns: [
      { key: 'label', label: 'Parametr' },
      { key: 'key', label: 'Açar' },
      { key: 'group', label: 'Bölmə', type: 'badge', map: { general: 'Ümumi', academic: 'Tədris', finance: 'Maliyyə' } },
      { key: 'is_public', label: 'Açıq', type: 'bool', align: 'center' },
    ],
    fields: [
      { key: 'key', label: 'Açar', type: 'text', required: true, width: 'half' },
      { key: 'label', label: 'Ad', type: 'text', width: 'half' },
      {
        key: 'group', label: 'Bölmə', type: 'select', width: 'half',
        options: [
          { value: 'general', label: 'Ümumi' },
          { value: 'academic', label: 'Tədris' },
          { value: 'finance', label: 'Maliyyə' },
        ],
      },
      { key: 'is_public', label: 'Hamıya açıq', type: 'checkbox', placeholder: 'Bəli' },
    ],
  },
};

// getResource - açara görə resurs tərifi
export function getResource(key: string): ResourceDef | null {
  return RESOURCES[key] || null;
}
