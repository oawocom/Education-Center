// ============================================================
// Education Center — resurs tərifi tipləri
//
// Bir resursu təsvir etmək üçün lazım olan hər şey burada.
// Ekran yazılmır — resurs təsvir olunur, ekran ondan qurulur.
// ============================================================

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'select'
  | 'relation'
  | 'checkbox'
  | 'color';

export interface SelectOption {
  value: string | number;
  label: string;
  color?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;

  // select üçün
  options?: SelectOption[];

  // relation üçün — başqa resursdan seçim
  resource?: string;
  labelKey?: string; // default: 'name'

  // yalnız oxunan (formada göstərilir, göndərilmir)
  readOnly?: boolean;

  // formada gizlət (yalnız cədvəldə göstərmək üçün sahə)
  hidden?: boolean;

  // sahənin form içindəki eni
  width?: 'full' | 'half';

  min?: number;
  max?: number;
  step?: number;
}

export interface ColumnDef {
  key: string;
  label: string;

  // dəyəri necə göstərmək
  type?: 'text' | 'number' | 'date' | 'time' | 'badge' | 'bool' | 'money' | 'relation';

  // badge üçün rəng xəritəsi: { active: '#16A34A', ... }
  badgeColors?: Record<string, string>;

  // dəyəri insan dilinə çevirmək: { active: 'Aktiv', ... }
  map?: Record<string, string>;

  // relation üçün — hansı resursdan ad çəkilsin
  resource?: string;
  labelKey?: string;

  align?: 'left' | 'right' | 'center';
}

export interface FilterDef {
  key: string;
  label: string;
  type: 'select' | 'relation';
  options?: SelectOption[];
  resource?: string;
  labelKey?: string;
}

// ============================================================
// Sətir əməliyyatları
//
// `link` — çoxdan-çoxa bağlantı idarəçisi (şagird ↔ valideyn,
//   qrup ↔ şagird, müəllim ↔ fənn). Ara cədvəl bir modaldan
//   idarə olunur; ayrıca ekrana ehtiyac qalmır.
//
// `endpoint` — sətir üzərində serverdə bir əməliyyat işə salır
//   (məs. level nəticəsini şagirdə çevirmək).
// ============================================================

export interface LinkActionDef {
  // formanın içində göstərilən başlıq (inline seçimdə)
  label?: string;

  // ara cədvəlin resurs açarı, məs. 'student-guardians'
  resource: string;

  // ara cədvəldə cari sətri göstərən sütun, məs. 'student_id'
  selfKey: string;

  // ara cədvəldə qarşı tərəfi göstərən sütun, məs. 'guardian_id'
  targetKey: string;

  // qarşı tərəfin resursu, məs. 'guardians'
  targetResource: string;

  // modalda istifadə olunan adlar
  targetTitle: string; // 'Valideyn'
  targetPlural: string; // 'Valideynlər'

  // bağlantının öz sahələri (qohumluq, əsas əlaqə və s.)
  linkFields?: FieldDef[];

  // cədvəldə göstəriləcək bağlantı sütunları
  linkColumns?: ColumnDef[];

  // modal içindən yeni qarşı tərəf yaratmaq üçün sahələr
  // (məs. sistemdə olmayan valideyni elə burada yaratmaq)
  quickCreateFields?: FieldDef[];

  // boş siyahı üçün izah
  emptyText?: string;
}

export interface EndpointActionDef {
  // /sf altındakı yol, məs. '/ops/place-applicant'
  path: string;
  method?: 'POST' | 'PUT';

  // sətrin id-si hansı açarla göndərilsin
  idKey?: string;

  // əlavə sahələr (modalda soruşulur)
  fields?: FieldDef[];

  confirmText?: string;
  successText?: string;
}

export interface RowActionDef {
  key: string;
  label: string;
  icon?: 'link' | 'heart' | 'users' | 'book' | 'check' | 'wand';
  kind: 'link' | 'endpoint';
  link?: LinkActionDef;
  endpoint?: EndpointActionDef;

  // düymənin görünməsi üçün lazım olan icazə
  perm?: { resource: string; action: string };

  // yalnız sətir bu şərtə uyğun gələndə göstər, məs. { status: 'pending' }
  when?: Record<string, string | number | boolean>;
}

// Cədvəlin üstündəki toplu əməliyyat düymələri
export interface ToolbarActionDef {
  key: string;
  label: string;
  description?: string;

  // /sf altındakı yol, məs. '/ops/generate-lessons'
  path: string;
  method?: 'POST' | 'PUT';

  // modalda soruşulan parametrlər
  fields?: FieldDef[];

  perm?: { resource: string; action: string };
  successText?: string;
}

export interface ResourceDef {
  // API resurs açarı — backend routes.go-dakı Name ilə eyni olmalıdır
  key: string;

  title: string;
  titleSingular: string;
  icon?: string;
  description?: string;

  columns: ColumnDef[];
  fields: FieldDef[];
  filters?: FilterDef[];

  // sətir və toolbar əməliyyatları
  rowActions?: RowActionDef[];
  toolbarActions?: ToolbarActionDef[];

  // formanın İÇİNDƏ göstərilən çoxdan-çoxa seçimlər.
  // Məs. şagird formasında valideynləri seçmək — qeyd saxlananda
  // ara cədvəl (student-guardians) avtomatik uyğunlaşdırılır.
  // Ətraflı idarə (qohumluq, əsas əlaqə) yenə də sətir düyməsindədir.
  inlineLinks?: LinkActionDef[];

  // axtarış qutusu göstərilsinmi (backend Searchable ilə uyğun olmalıdır)
  searchable?: boolean;

  // arxivləmə düymələri (backend Archivable ilə uyğun olmalıdır)
  archivable?: boolean;

  // yalnız oxu — əlavə/redaktə/silmə düymələri gizlədilir
  readOnly?: boolean;

  defaultSort?: string;
  perPage?: number;
}
