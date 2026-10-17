package educationcenter

import (
	"fmt"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ============================================================
// BASE
// Butun modellerde tekrarlanan sahelerin vahid yeri.
// Yeni model elave edende sadece BaseModel-i embed et.
// ============================================================

type BaseModel struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Archivable - silmek evezine arxivlemek ucun (soft delete deyil, ayri bayraq)
type Archivable struct {
	IsArchived bool       `json:"is_archived" gorm:"default:false;index"`
	ArchivedAt *time.Time `json:"archived_at"`
}

// ============================================================
// 1. TESKILAT (Filial / Otaq / Fenn / Seviyye)
// ============================================================

type Branch struct {
	BaseModel
	Name      string `json:"name" gorm:"size:255;not null"`
	Code      string `json:"code" gorm:"size:50;index"`
	Address   string `json:"address" gorm:"type:text"`
	Phone     string `json:"phone" gorm:"size:50"`
	Email     string `json:"email" gorm:"size:255"`
	WorkHours string `json:"work_hours" gorm:"size:100"`
	IsActive  bool   `json:"is_active" gorm:"default:true"`
	SortOrder int    `json:"sort_order" gorm:"default:0"`
}

func (Branch) TableName() string { return "edu_branches" }

type Room struct {
	BaseModel
	BranchID uint   `json:"branch_id" gorm:"index;not null"`
	Name     string `json:"name" gorm:"size:100;not null"`
	Capacity int    `json:"capacity" gorm:"default:0"`
	Floor    string `json:"floor" gorm:"size:50"`
	Notes    string `json:"notes" gorm:"type:text"`
	IsActive bool   `json:"is_active" gorm:"default:true"`
}

func (Room) TableName() string { return "edu_rooms" }

type Subject struct {
	BaseModel
	Name      string `json:"name" gorm:"size:150;not null"`
	Code      string `json:"code" gorm:"size:50;index"`
	Color     string `json:"color" gorm:"size:20"`
	Icon      string `json:"icon" gorm:"size:50"`
	IsActive  bool   `json:"is_active" gorm:"default:true"`
	SortOrder int    `json:"sort_order" gorm:"default:0"`
}

func (Subject) TableName() string { return "edu_subjects" }

// Level - CEFR (A1..C1) ve ya istenilen basqa seviyye sistemi.
// Fenne baglidir ki, her fennin oz seviyye skalasi ola bilsin.
type Level struct {
	BaseModel
	SubjectID *uint  `json:"subject_id" gorm:"index"`
	Name      string `json:"name" gorm:"size:50;not null"`
	Title     string `json:"title" gorm:"size:255"`
	MinScore  int    `json:"min_score" gorm:"default:0"`
	MaxScore  int    `json:"max_score" gorm:"default:100"`
	SortOrder int    `json:"sort_order" gorm:"default:0"`
	IsActive  bool   `json:"is_active" gorm:"default:true"`
}

func (Level) TableName() string { return "edu_levels" }

// ============================================================
// 2. ISTIFADECILER VE SEXSLER
// ============================================================

// EduUser - merkezin istifadecisi (admin, muellim, sagird, valideyn)
type EduUser struct {
	BaseModel
	Email        string `json:"email" gorm:"size:255;uniqueIndex;not null"`
	PasswordHash string `json:"-" gorm:"column:password_hash;not null"`
	Role         string `json:"role" gorm:"size:50;not null;index"` // admin | teacher | student | guardian
	SubRoleID    *uint  `json:"sub_role_id" gorm:"index"`
	Name         string `json:"name" gorm:"size:255;not null"`
	DisplayName  string `json:"display_name" gorm:"size:255"`
	Phone        string `json:"phone" gorm:"size:50"`
	Avatar       string `json:"avatar" gorm:"size:500"`
	Locale       string `json:"locale" gorm:"size:10;default:az"`

	// Rola gore elaqe (yalniz biri dolu olur)
	TeacherID  *uint `json:"teacher_id" gorm:"index"`
	StudentID  *uint `json:"student_id" gorm:"index"`
	GuardianID *uint `json:"guardian_id" gorm:"index"`
	BranchID   *uint `json:"branch_id" gorm:"index"`

	IsActive         bool       `json:"is_active" gorm:"default:true"`
	LastLogin        *time.Time `json:"last_login"`
	TenantID         uint       `json:"tenant_id" gorm:"not null;index"`
	SetupToken       string     `json:"-" gorm:"size:128;index"`
	SetupTokenExpiry *time.Time `json:"-"`

	// Qeydiyyat / qosulma
	Code       *string `json:"code" gorm:"size:6;uniqueIndex"`             // 6 reqemli unikal kod
	Status     string  `json:"status" gorm:"size:20;default:active;index"` // active | pending
	Provider   string  `json:"provider" gorm:"size:20;default:password"`   // password | google
	GoogleSub  string  `json:"-" gorm:"size:64;index"`
	RoleChosen bool    `json:"role_chosen" gorm:"default:true"`

	// Təhlükəsizlik və seçimlər
	SessionsValidFrom  *time.Time `json:"-"`                                       // bundan əvvəl verilmiş tokenlər keçərsizdir (parol dəyişdi, "hər yerdən çıx")
	EmailNotifications bool       `json:"email_notifications" gorm:"default:true"` // bildirişlər e-poçtla da gəlsin
}

// TeacherStudent - muellim ↔ sagird birbasa elaqesi (qrupdan asili olmayaraq).
type TeacherStudent struct {
	BaseModel
	TeacherID uint   `json:"teacher_id" gorm:"uniqueIndex:uq_edu_teacher_student;not null"`
	StudentID uint   `json:"student_id" gorm:"uniqueIndex:uq_edu_teacher_student;not null"`
	SubjectID *uint  `json:"subject_id" gorm:"index"`
	Note      string `json:"note" gorm:"size:255"`
}

func (TeacherStudent) TableName() string { return "edu_teacher_students" }

func (EduUser) TableName() string { return "edu_users" }

// SubRole - baza rolun icinde daralmis icaze desti.
// Permissions formati: {"students":["read","create"],"payments":["read"]}
type SubRole struct {
	BaseModel
	Name        string         `json:"name" gorm:"size:100;not null"`
	BaseRole    string         `json:"base_role" gorm:"size:50;not null;index"`
	Description string         `json:"description" gorm:"type:text"`
	Permissions datatypes.JSON `json:"permissions" gorm:"type:jsonb"`
	IsActive    bool           `json:"is_active" gorm:"default:true"`
}

func (SubRole) TableName() string { return "edu_sub_roles" }

type Teacher struct {
	BaseModel
	Archivable
	UserID         *uint          `json:"user_id" gorm:"index"`
	Name           string         `json:"name" gorm:"size:255;not null"`
	Email          string         `json:"email" gorm:"size:255;index"`
	Phone          string         `json:"phone" gorm:"size:50"`
	Avatar         string         `json:"avatar" gorm:"size:500"`
	BranchID       *uint          `json:"branch_id" gorm:"index"`
	Bio            string         `json:"bio" gorm:"type:text"`
	Specialization string         `json:"specialization" gorm:"size:255"`
	Education      datatypes.JSON `json:"education" gorm:"type:jsonb"`
	Certifications datatypes.JSON `json:"certifications" gorm:"type:jsonb"`
	Languages      datatypes.JSON `json:"languages" gorm:"type:jsonb"`
	HireDate       *time.Time     `json:"hire_date"`
	WeeklyLoadMax  int            `json:"weekly_load_max" gorm:"default:0"`
	Rating         float32        `json:"rating" gorm:"default:0"`
	Status         string         `json:"status" gorm:"size:50;default:active"`
}

func (Teacher) TableName() string { return "edu_teachers" }

// TeacherSubject - muellim <-> fenn (coxdan-coxa)
type TeacherSubject struct {
	BaseModel
	TeacherID uint `json:"teacher_id" gorm:"uniqueIndex:uq_edu_teacher_subject;not null"`
	SubjectID uint `json:"subject_id" gorm:"uniqueIndex:uq_edu_teacher_subject;not null"`
}

func (TeacherSubject) TableName() string { return "edu_teacher_subjects" }

type Student struct {
	BaseModel
	Archivable
	UserID     *uint      `json:"user_id" gorm:"index"`
	Code       string     `json:"code" gorm:"size:50;index"`
	Name       string     `json:"name" gorm:"size:255;not null"`
	Email      string     `json:"email" gorm:"size:255;index"`
	Phone      string     `json:"phone" gorm:"size:50"`
	BirthDate  *time.Time `json:"birth_date"`
	Gender     string     `json:"gender" gorm:"size:20"`
	Avatar     string     `json:"avatar" gorm:"size:500"`
	BranchID   *uint      `json:"branch_id" gorm:"index"`
	Address    string     `json:"address" gorm:"type:text"`
	Notes      string     `json:"notes" gorm:"type:text"`
	Status     string     `json:"status" gorm:"size:50;default:active"` // active | paused | left
	EnrolledAt *time.Time `json:"enrolled_at"`
	LeftAt     *time.Time `json:"left_at"`
}

func (Student) TableName() string { return "edu_students" }

type Guardian struct {
	BaseModel
	Archivable
	UserID     *uint  `json:"user_id" gorm:"index"`
	Name       string `json:"name" gorm:"size:255;not null"`
	Email      string `json:"email" gorm:"size:255;index"`
	Phone      string `json:"phone" gorm:"size:50"`
	Address    string `json:"address" gorm:"type:text"`
	Notes      string `json:"notes" gorm:"type:text"`
	Occupation string `json:"occupation" gorm:"size:255"`
}

func (Guardian) TableName() string { return "edu_guardians" }

// StudentGuardian - sagird <-> valideyn (coxdan-coxa).
// Bir sagirdin bir nece qeyyumu, bir valideynin bir nece ovladi ola biler.
type StudentGuardian struct {
	BaseModel
	StudentID  uint   `json:"student_id" gorm:"uniqueIndex:uq_edu_student_guardian;not null"`
	GuardianID uint   `json:"guardian_id" gorm:"uniqueIndex:uq_edu_student_guardian;not null"`
	Relation   string `json:"relation" gorm:"size:50"` // ana | ata | qeyyum
	IsPrimary  bool   `json:"is_primary" gorm:"default:false"`
	CanPickup  bool   `json:"can_pickup" gorm:"default:true"`
}

func (StudentGuardian) TableName() string { return "edu_student_guardians" }

// ============================================================
// 3. TEDRIS (Qrup / Qeydiyyat / Cedvel / Ders / Davamiyyet)
// ============================================================

type Group struct {
	BaseModel
	Archivable
	Name      string     `json:"name" gorm:"size:255;not null"`
	Code      string     `json:"code" gorm:"size:50;index"`
	SubjectID *uint      `json:"subject_id" gorm:"index"`
	LevelID   *uint      `json:"level_id" gorm:"index"`
	TeacherID *uint      `json:"teacher_id" gorm:"index"`
	BranchID  *uint      `json:"branch_id" gorm:"index"`
	RoomID    *uint      `json:"room_id" gorm:"index"`
	Capacity  int        `json:"capacity" gorm:"default:0"`
	StartDate *time.Time `json:"start_date"`
	EndDate   *time.Time `json:"end_date"`
	Status    string     `json:"status" gorm:"size:50;default:active"` // active | finished | planned
	Notes     string     `json:"notes" gorm:"type:text"`
}

func (Group) TableName() string { return "edu_groups" }

// Enrollment - sagirdin qrupa yazilmasi (tarixce ile)
type Enrollment struct {
	BaseModel
	StudentID uint       `json:"student_id" gorm:"index;not null"`
	GroupID   uint       `json:"group_id" gorm:"index;not null"`
	JoinedAt  time.Time  `json:"joined_at"`
	LeftAt    *time.Time `json:"left_at"`
	Status    string     `json:"status" gorm:"size:50;default:active"` // active | left | transferred
	Note      string     `json:"note" gorm:"type:text"`
}

func (Enrollment) TableName() string { return "edu_enrollments" }

// ScheduleSlot - heftelik tekrarlanan ders yeri (sablon)
type ScheduleSlot struct {
	BaseModel
	GroupID       uint       `json:"group_id" gorm:"index;not null"`
	TeacherID     *uint      `json:"teacher_id" gorm:"index"`
	RoomID        *uint      `json:"room_id" gorm:"index"`
	BranchID      *uint      `json:"branch_id" gorm:"index"`
	SubjectID     *uint      `json:"subject_id" gorm:"index"`
	Weekday       int        `json:"weekday" gorm:"not null;index"` // 1=B.e ... 7=Bazar
	StartTime     string     `json:"start_time" gorm:"size:5;not null"`
	EndTime       string     `json:"end_time" gorm:"size:5;not null"`
	EffectiveFrom *time.Time `json:"effective_from"`
	EffectiveTo   *time.Time `json:"effective_to"`
	IsActive      bool       `json:"is_active" gorm:"default:true"`
}

func (ScheduleSlot) TableName() string { return "edu_schedule_slots" }

// TeacherAvailability - muellimin bos saatlari
type TeacherAvailability struct {
	BaseModel
	TeacherID uint   `json:"teacher_id" gorm:"index;not null"`
	Weekday   int    `json:"weekday" gorm:"not null"`
	StartTime string `json:"start_time" gorm:"size:5;not null"`
	EndTime   string `json:"end_time" gorm:"size:5;not null"`
	Note      string `json:"note" gorm:"size:255"`
}

func (TeacherAvailability) TableName() string { return "edu_teacher_availability" }

// Lesson - konkret tarixdeki ders (cedvelden dogur, amma legv/tehir oluna biler)
type Lesson struct {
	BaseModel
	GroupID        uint      `json:"group_id" gorm:"index;not null"`
	ScheduleSlotID *uint     `json:"schedule_slot_id" gorm:"index"`
	SubjectID      *uint     `json:"subject_id" gorm:"index"`
	TeacherID      *uint     `json:"teacher_id" gorm:"index"`
	RoomID         *uint     `json:"room_id" gorm:"index"`
	Date           time.Time `json:"date" gorm:"index;not null"`
	StartTime      string    `json:"start_time" gorm:"size:5"`
	EndTime        string    `json:"end_time" gorm:"size:5"`
	Topic          string    `json:"topic" gorm:"size:500"`
	Homework       string    `json:"homework" gorm:"type:text"`               // gunun ev tapshirigi
	Status         string    `json:"status" gorm:"size:50;default:scheduled"` // scheduled | held | cancelled | postponed
	Note           string    `json:"note" gorm:"type:text"`
}

func (Lesson) TableName() string { return "edu_lessons" }

type Attendance struct {
	BaseModel
	LessonID  uint   `json:"lesson_id" gorm:"uniqueIndex:uq_edu_attendance;not null"`
	StudentID uint   `json:"student_id" gorm:"uniqueIndex:uq_edu_attendance;not null"`
	Status    string `json:"status" gorm:"size:50;default:present"` // present | late | excused | absent
	LateMin   int    `json:"late_min" gorm:"default:0"`
	Grade     *int   `json:"grade"` // 1-10; yazilibsa sagird avtomatik iştirak edir
	Note      string `json:"note" gorm:"size:500"`
	MarkedBy  *uint  `json:"marked_by"`
}

func (Attendance) TableName() string { return "edu_attendance" }

// BeforeSave - qiymet yazilibsa sagird "iştirak edir" sayilir (CRUD ve lovhe ucun ortaq qayda).
func (a *Attendance) BeforeSave(tx *gorm.DB) error {
	if a.Grade != nil {
		if *a.Grade < 1 || *a.Grade > 10 {
			return fmt.Errorf("Qiymet 1-10 araliginda olmalidir")
		}
		if a.Status == "" || a.Status == "absent" || a.Status == "excused" {
			a.Status = "present"
		}
	}
	return nil
}

// ============================================================
// 4. QIYMETLENDIRME (Imtahan / Sual / Cavab / Bacariq)
// ============================================================

// Skill - dinleme / oxu / yazi / danisiq (fenne gore deyise biler)
type Skill struct {
	BaseModel
	SubjectID *uint  `json:"subject_id" gorm:"index"`
	Name      string `json:"name" gorm:"size:100;not null"`
	Code      string `json:"code" gorm:"size:50;index"`
	SortOrder int    `json:"sort_order" gorm:"default:0"`
	IsActive  bool   `json:"is_active" gorm:"default:true"`
}

func (Skill) TableName() string { return "edu_skills" }

type Exam struct {
	BaseModel
	Archivable
	Title        string     `json:"title" gorm:"size:255;not null"`
	Kind         string     `json:"kind" gorm:"size:50;default:quiz;index"` // quiz | midterm | final | placement
	GroupID      *uint      `json:"group_id" gorm:"index"`
	SubjectID    *uint      `json:"subject_id" gorm:"index"`
	LevelID      *uint      `json:"level_id" gorm:"index"`
	TeacherID    *uint      `json:"teacher_id" gorm:"index"`
	DurationMin  int        `json:"duration_min" gorm:"default:0"`
	TotalPoints  int        `json:"total_points" gorm:"default:0"`
	PassPercent  int        `json:"pass_percent" gorm:"default:0"`
	ExamDate     *time.Time `json:"exam_date"`
	Instructions string     `json:"instructions" gorm:"type:text"`
	ShuffleQ     bool       `json:"shuffle_questions" gorm:"default:false"`
	Status       string     `json:"status" gorm:"size:50;default:draft;index"` // draft | published | closed
}

func (Exam) TableName() string { return "edu_exams" }

type Question struct {
	BaseModel
	ExamID        uint           `json:"exam_id" gorm:"index;not null"`
	SkillID       *uint          `json:"skill_id" gorm:"index"`
	Type          string         `json:"type" gorm:"size:50;not null"` // mcq | multi | truefalse | gap | open | match
	Text          string         `json:"text" gorm:"type:text;not null"`
	MediaURL      string         `json:"media_url" gorm:"size:500"`
	Media         datatypes.JSON `json:"media" gorm:"type:jsonb"` // [{"type":"image|audio","token":"...","name":"..."}]
	Options       datatypes.JSON `json:"options" gorm:"type:jsonb"`
	CorrectAnswer datatypes.JSON `json:"correct_answer" gorm:"type:jsonb"`
	Points        int            `json:"points" gorm:"default:1"`
	Explanation   string         `json:"explanation" gorm:"type:text"`
	SortOrder     int            `json:"sort_order" gorm:"default:0"`
}

func (Question) TableName() string { return "edu_questions" }

type ExamSubmission struct {
	BaseModel
	ExamID      uint       `json:"exam_id" gorm:"index;not null"`
	StudentID   uint       `json:"student_id" gorm:"index;not null"`
	StartedAt   *time.Time `json:"started_at"`
	SubmittedAt *time.Time `json:"submitted_at"`
	AutoScore   float32    `json:"auto_score" gorm:"default:0"`
	ManualScore float32    `json:"manual_score" gorm:"default:0"`
	TotalScore  float32    `json:"total_score" gorm:"default:0"`
	Percentage  float32    `json:"percentage" gorm:"default:0"`
	Status      string     `json:"status" gorm:"size:50;default:in_progress;index"` // in_progress | submitted | grading | graded
	Feedback    string     `json:"feedback" gorm:"type:text"`
	GradedBy    *uint      `json:"graded_by"`
	GradedAt    *time.Time `json:"graded_at"`
}

func (ExamSubmission) TableName() string { return "edu_exam_submissions" }

type Answer struct {
	BaseModel
	SubmissionID   uint           `json:"submission_id" gorm:"uniqueIndex:uq_edu_answer;not null"`
	QuestionID     uint           `json:"question_id" gorm:"uniqueIndex:uq_edu_answer;not null"`
	Value          datatypes.JSON `json:"value" gorm:"type:jsonb"`
	IsCorrect      *bool          `json:"is_correct"`
	Score          float32        `json:"score" gorm:"default:0"`
	TeacherComment string         `json:"teacher_comment" gorm:"type:text"`
}

func (Answer) TableName() string { return "edu_answers" }

// SubmissionSkillScore - bacariq uzre bolgu (hesabatlar SQL ile cixsin deye ayri cedvel)
type SubmissionSkillScore struct {
	BaseModel
	SubmissionID uint    `json:"submission_id" gorm:"uniqueIndex:uq_edu_skill_score;not null"`
	StudentID    uint    `json:"student_id" gorm:"index;not null"`
	SkillID      uint    `json:"skill_id" gorm:"uniqueIndex:uq_edu_skill_score;not null"`
	Score        float32 `json:"score" gorm:"default:0"`
	MaxScore     float32 `json:"max_score" gorm:"default:0"`
	Percentage   float32 `json:"percentage" gorm:"default:0"`
}

func (SubmissionSkillScore) TableName() string { return "edu_submission_skill_scores" }

// PlacementResult - level imtahaninin neticesi ve qrupa yerlesdirme tovsiyesi
type PlacementResult struct {
	BaseModel
	SubmissionID       *uint  `json:"submission_id" gorm:"index"`
	StudentID          *uint  `json:"student_id" gorm:"index"`
	ApplicantName      string `json:"applicant_name" gorm:"size:255"`
	ApplicantPhone     string `json:"applicant_phone" gorm:"size:50"`
	ApplicantEmail     string `json:"applicant_email" gorm:"size:255"`
	BranchID           *uint  `json:"branch_id" gorm:"index"`
	RecommendedLevelID *uint  `json:"recommended_level_id" gorm:"index"`
	AssignedGroupID    *uint  `json:"assigned_group_id" gorm:"index"`
	Status             string `json:"status" gorm:"size:50;default:pending"` // pending | placed | rejected
	Note               string `json:"note" gorm:"type:text"`
}

func (PlacementResult) TableName() string { return "edu_placement_results" }

// ============================================================
// 5. KURS MATERIALI (Sillabus / Material / Tapsiriq)
// ============================================================

type SyllabusWeek struct {
	BaseModel
	GroupID     uint       `json:"group_id" gorm:"index;not null"`
	WeekNo      int        `json:"week_no" gorm:"not null"`
	Topic       string     `json:"topic" gorm:"size:500"`
	Description string     `json:"description" gorm:"type:text"`
	StartDate   *time.Time `json:"start_date"`
	IsPublished bool       `json:"is_published" gorm:"default:true"`
}

func (SyllabusWeek) TableName() string { return "edu_syllabus_weeks" }

type Material struct {
	BaseModel
	GroupID        *uint  `json:"group_id" gorm:"index"`
	SyllabusWeekID *uint  `json:"syllabus_week_id" gorm:"index"`
	SubjectID      *uint  `json:"subject_id" gorm:"index"`
	LevelID        *uint  `json:"level_id" gorm:"index"`
	Title          string `json:"title" gorm:"size:255;not null"`
	Type           string `json:"type" gorm:"size:50;default:file"` // file | link | video | text
	FileURL        string `json:"file_url" gorm:"size:500"`
	LinkURL        string `json:"link_url" gorm:"size:500"`
	Description    string `json:"description" gorm:"type:text"`
	UploadedBy     *uint  `json:"uploaded_by"`
	IsPublished    bool   `json:"is_published" gorm:"default:true"`
	SortOrder      int    `json:"sort_order" gorm:"default:0"`
}

func (Material) TableName() string { return "edu_materials" }

type Assignment struct {
	BaseModel
	Archivable
	GroupID        uint           `json:"group_id" gorm:"index;not null"`
	TeacherID      *uint          `json:"teacher_id" gorm:"index"`
	SyllabusWeekID *uint          `json:"syllabus_week_id" gorm:"index"`
	Title          string         `json:"title" gorm:"size:255;not null"`
	Description    string         `json:"description" gorm:"type:text"`
	DueDate        *time.Time     `json:"due_date" gorm:"index"`
	MaxPoints      int            `json:"max_points" gorm:"default:100"`
	Attachments    datatypes.JSON `json:"attachments" gorm:"type:jsonb"`
	AllowLate      bool           `json:"allow_late" gorm:"default:true"`
	IsPublished    bool           `json:"is_published" gorm:"default:false"`
	LessonID       *uint          `json:"lesson_id" gorm:"index"`
	StudentIDs     datatypes.JSON `json:"student_ids" gorm:"type:jsonb"` // boş = bütün qrup
}

func (Assignment) TableName() string { return "edu_assignments" }

type AssignmentSubmission struct {
	BaseModel
	AssignmentID uint           `json:"assignment_id" gorm:"index;not null"`
	StudentID    uint           `json:"student_id" gorm:"index;not null"`
	Content      string         `json:"content" gorm:"type:text"`
	Files        datatypes.JSON `json:"files" gorm:"type:jsonb"`
	SubmittedAt  *time.Time     `json:"submitted_at"`
	Status       string         `json:"status" gorm:"size:50;default:pending;index"` // pending | submitted | late | graded
	Grade        float32        `json:"grade" gorm:"default:0"`
	Feedback     string         `json:"feedback" gorm:"type:text"`
	GradedBy     *uint          `json:"graded_by"`
	GradedAt     *time.Time     `json:"graded_at"`
}

func (AssignmentSubmission) TableName() string { return "edu_assignment_submissions" }

// ============================================================
// 6. KOMMUNIKASIYA (Ismaric / Elan / Bildiris)
// ============================================================

type Message struct {
	BaseModel
	FromUserID uint           `json:"from_user_id" gorm:"index;not null"`
	ToUserID   uint           `json:"to_user_id" gorm:"index;not null"`
	ThreadID   *uint          `json:"thread_id" gorm:"index"`
	StudentID  *uint          `json:"student_id" gorm:"index"` // hansi sagird haqqinda
	Subject    string         `json:"subject" gorm:"size:255"`
	Body       string         `json:"body" gorm:"type:text;not null"`
	Files      datatypes.JSON `json:"files" gorm:"type:jsonb"`
	IsRead     bool           `json:"is_read" gorm:"default:false;index"`
	ReadAt     *time.Time     `json:"read_at"`
}

func (Message) TableName() string { return "edu_messages" }

type Announcement struct {
	BaseModel
	Title           string         `json:"title" gorm:"size:255;not null"`
	Body            string         `json:"body" gorm:"type:text"`
	TargetRoles     datatypes.JSON `json:"target_roles" gorm:"type:jsonb"`
	TargetGroupIDs  datatypes.JSON `json:"target_group_ids" gorm:"type:jsonb"`
	TargetBranchIDs datatypes.JSON `json:"target_branch_ids" gorm:"type:jsonb"`
	Status          string         `json:"status" gorm:"size:50;default:draft;index"` // draft | published
	PublishedAt     *time.Time     `json:"published_at"`
	ExpiresAt       *time.Time     `json:"expires_at"`
	CreatedBy       *uint          `json:"created_by"`
	NotifiedAt      *time.Time     `json:"notified_at"` // dərc olunanda hədəf istifadəçilərə bildiriş getdi
}

func (Announcement) TableName() string { return "edu_announcements" }

type Notification struct {
	BaseModel
	UserID   uint       `json:"user_id" gorm:"index;not null"`
	Type     string     `json:"type" gorm:"size:50;index"`
	Title    string     `json:"title" gorm:"size:255"`
	Body     string     `json:"body" gorm:"type:text"`
	Link     string     `json:"link" gorm:"size:500"`
	RefType  string     `json:"ref_type" gorm:"size:50"`
	RefID    *uint      `json:"ref_id"`
	IsRead   bool       `json:"is_read" gorm:"default:false;index"`
	ReadAt   *time.Time `json:"read_at"`
	Priority string     `json:"priority" gorm:"size:20;default:normal"`
}

func (Notification) TableName() string { return "edu_notifications" }

// ============================================================
// 7. MALIYYE (Tarif / Sagird tarifi / Qaime)
// ============================================================

// TuitionPlan - tehsil haqqi sablonu (qrup ve ya seviyye uzre)
type TuitionPlan struct {
	BaseModel
	Name             string  `json:"name" gorm:"size:255;not null"`
	GroupID          *uint   `json:"group_id" gorm:"index"`
	LevelID          *uint   `json:"level_id" gorm:"index"`
	SubjectID        *uint   `json:"subject_id" gorm:"index"`
	BranchID         *uint   `json:"branch_id" gorm:"index"`
	Amount           float64 `json:"amount" gorm:"default:0"`
	Currency         string  `json:"currency" gorm:"size:10;default:AZN"`
	Period           string  `json:"period" gorm:"size:50;default:monthly"` // monthly | course | lesson
	InstallmentCount int     `json:"installment_count" gorm:"default:0"`
	DueDayOfMonth    int     `json:"due_day_of_month" gorm:"default:1"`
	IsActive         bool    `json:"is_active" gorm:"default:true"`
}

func (TuitionPlan) TableName() string { return "edu_tuition_plans" }

// StudentTuition - konkret sagirdle baglanan tarif (endirimle birlikde)
type StudentTuition struct {
	BaseModel
	StudentID     uint       `json:"student_id" gorm:"index;not null"`
	TuitionPlanID *uint      `json:"tuition_plan_id" gorm:"index"`
	GroupID       *uint      `json:"group_id" gorm:"index"`
	Amount        float64    `json:"amount" gorm:"default:0"`
	DiscountPct   float32    `json:"discount_pct" gorm:"default:0"`
	FinalAmount   float64    `json:"final_amount" gorm:"default:0"`
	Currency      string     `json:"currency" gorm:"size:10;default:AZN"`
	StartDate     *time.Time `json:"start_date"`
	EndDate       *time.Time `json:"end_date"`
	Status        string     `json:"status" gorm:"size:50;default:active"` // active | paused | ended
	Note          string     `json:"note" gorm:"type:text"`
}

func (StudentTuition) TableName() string { return "edu_student_tuitions" }

type Invoice struct {
	BaseModel
	StudentID        uint       `json:"student_id" gorm:"index;not null"`
	StudentTuitionID *uint      `json:"student_tuition_id" gorm:"index"`
	GroupID          *uint      `json:"group_id" gorm:"index"`
	BranchID         *uint      `json:"branch_id" gorm:"index"`
	Number           string     `json:"number" gorm:"size:50;index"`
	PeriodLabel      string     `json:"period_label" gorm:"size:50"` // 2026-07
	Amount           float64    `json:"amount" gorm:"default:0"`
	PaidAmount       float64    `json:"paid_amount" gorm:"default:0"`
	Currency         string     `json:"currency" gorm:"size:10;default:AZN"`
	DueDate          *time.Time `json:"due_date" gorm:"index"`
	PaidAt           *time.Time `json:"paid_at"`
	Status           string     `json:"status" gorm:"size:50;default:pending;index"` // pending | paid | partial | overdue | cancelled
	Method           string     `json:"method" gorm:"size:50"`                       // cash | card | transfer | online
	Reference        string     `json:"reference" gorm:"size:255"`
	Note             string     `json:"note" gorm:"type:text"`
}

func (Invoice) TableName() string { return "edu_invoices" }

// ============================================================
// 8. MOTIVASIYA (XP / Nailiyyet)
// ============================================================

// XPEvent - XP ledger. Balans hemise buradan hesablanir, sahede saxlanmir.
type XPEvent struct {
	BaseModel
	StudentID uint   `json:"student_id" gorm:"index;not null"`
	Source    string `json:"source" gorm:"size:50;index"` // exam | assignment | attendance | streak | manual
	RefType   string `json:"ref_type" gorm:"size:50"`
	RefID     *uint  `json:"ref_id"`
	Points    int    `json:"points" gorm:"not null"`
	Note      string `json:"note" gorm:"size:255"`
}

func (XPEvent) TableName() string { return "edu_xp_events" }

type Achievement struct {
	BaseModel
	Code        string         `json:"code" gorm:"size:50;uniqueIndex;not null"`
	Title       string         `json:"title" gorm:"size:255;not null"`
	Description string         `json:"description" gorm:"type:text"`
	Icon        string         `json:"icon" gorm:"size:50"`
	Criteria    datatypes.JSON `json:"criteria" gorm:"type:jsonb"`
	XPReward    int            `json:"xp_reward" gorm:"default:0"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	IsActive    bool           `json:"is_active" gorm:"default:true"`
}

func (Achievement) TableName() string { return "edu_achievements" }

type StudentAchievement struct {
	BaseModel
	StudentID     uint       `json:"student_id" gorm:"uniqueIndex:uq_edu_student_achievement;not null"`
	AchievementID uint       `json:"achievement_id" gorm:"uniqueIndex:uq_edu_student_achievement;not null"`
	Progress      int        `json:"progress" gorm:"default:0"`
	EarnedAt      *time.Time `json:"earned_at"`
}

func (StudentAchievement) TableName() string { return "edu_student_achievements" }

// ============================================================
// 9. TENZIMLEMELER
// ============================================================

type Setting struct {
	BaseModel
	Key       string         `json:"key" gorm:"size:100;uniqueIndex;not null"`
	Value     datatypes.JSON `json:"value" gorm:"type:jsonb"`
	GroupName string         `json:"group" gorm:"column:group_name;size:50;index"`
	Label     string         `json:"label" gorm:"size:255"`
	IsPublic  bool           `json:"is_public" gorm:"default:false"`
}

func (Setting) TableName() string { return "edu_settings" }

// ============================================================
// MIGRASIYA SIYAHISI
// Yeni model elave edende MUTLEQ bura da elave et.
// ============================================================

func Models() []interface{} {
	return []interface{}{
		// 1. Teskilat
		&Branch{}, &Room{}, &Subject{}, &Level{},
		// 2. Istifadeciler
		&EduUser{}, &SubRole{}, &Teacher{}, &TeacherSubject{},
		&Student{}, &Guardian{}, &StudentGuardian{}, &TeacherStudent{}, &MediaFile{},
		// 3. Tedris
		&Group{}, &Enrollment{}, &ScheduleSlot{}, &TeacherAvailability{},
		&Lesson{}, &Attendance{},
		// 4. Qiymetlendirme
		&Skill{}, &Exam{}, &Question{}, &ExamSubmission{}, &Answer{},
		&SubmissionSkillScore{}, &PlacementResult{},
		// 5. Kurs materiali
		&SyllabusWeek{}, &Material{}, &Assignment{}, &AssignmentSubmission{},
		// 6. Kommunikasiya
		&Message{}, &Announcement{}, &Notification{},
		// 7. Maliyye
		&TuitionPlan{}, &StudentTuition{}, &Invoice{}, &Payment{},
		// 8. Motivasiya
		&XPEvent{}, &Achievement{}, &StudentAchievement{},
		// 9. Tenzimlemeler
		&Setting{},
		// 10. E-poct ve tehlukesizlik
		&EmailTemplate{}, &EmailLog{}, &PasswordReset{}, &AuditLog{},
	}
}

// MediaFile - sual sekilleri / audio. Baza daxilinde saxlanilir (fayl sistemi
// serverde yazila bilmeyebilir). Token tahmin edilmez; public GET ile oxunur.
type MediaFile struct {
	BaseModel
	Token   string `json:"token" gorm:"size:64;uniqueIndex;not null"`
	Name    string `json:"name" gorm:"size:255"`
	Mime    string `json:"mime" gorm:"size:100"`
	Size    int    `json:"size"`
	Data    []byte `json:"-" gorm:"type:bytea"`
	OwnerID uint   `json:"owner_id" gorm:"index"`
}

func (MediaFile) TableName() string { return "edu_media" }
