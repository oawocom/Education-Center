package educationcenter

import (
	"github.com/gin-gonic/gin"
)

// ============================================================
// RESURS QEYDIYYATI
//
// Butun CRUD burada, bir yerde, deklarativ sekilde teyin olunur.
// Yeni resurs elave etmek ucun:
//   1) models.go-da model + Models() siyahisi
//   2) permissions.go-da AllResources + rol icazeleri
//   3) burada bir RegisterCRUD blocku
//
// Ayrica handler yazmaga ehtiyac yoxdur.
// ============================================================

func RegisterResources(sf *gin.RouterGroup, h *Handler) {

	// ---------- 1. TESKILAT (sorgu kitabcalari) ----------

	RegisterCRUD(sf, h, Resource[Branch]{
		Name:         "branches",
		Searchable:   []string{"name", "code", "address"},
		Filters:      []string{"is_active"},
		Sortable:     []string{"name", "sort_order", "created_at"},
		DefaultOrder: "sort_order ASC, name ASC",
		Scope:        scopeLookupActive,
	})

	RegisterCRUD(sf, h, Resource[Room]{
		Name:         "rooms",
		Searchable:   []string{"name", "floor"},
		Filters:      []string{"branch_id", "is_active"},
		Sortable:     []string{"name", "capacity"},
		DefaultOrder: "name ASC",
		Scope:        scopeLookupActive,
	})

	RegisterCRUD(sf, h, Resource[Subject]{
		Name:         "subjects",
		Searchable:   []string{"name", "code"},
		Filters:      []string{"is_active"},
		Sortable:     []string{"name", "sort_order"},
		DefaultOrder: "sort_order ASC, name ASC",
		Scope:        scopeLookupActive,
	})

	RegisterCRUD(sf, h, Resource[Level]{
		Name:         "levels",
		Searchable:   []string{"name", "title"},
		Filters:      []string{"subject_id", "is_active"},
		Sortable:     []string{"sort_order", "name"},
		DefaultOrder: "sort_order ASC, name ASC",
		Scope:        scopeLookupActive,
	})

	RegisterCRUD(sf, h, Resource[Skill]{
		Name:         "skills",
		Searchable:   []string{"name", "code"},
		Filters:      []string{"subject_id", "is_active"},
		Sortable:     []string{"sort_order", "name"},
		DefaultOrder: "sort_order ASC, id ASC",
		Scope:        scopeLookupActive,
	})

	// ---------- 2. INSANLAR ----------

	RegisterCRUD(sf, h, Resource[Teacher]{
		Name:         "teachers",
		Searchable:   []string{"name", "email", "phone", "specialization"},
		Filters:      []string{"branch_id", "status"},
		Sortable:     []string{"name", "created_at", "rating"},
		DefaultOrder: "name ASC",
		Archivable:   true,
		Scope:        scopeTeachers,
	})

	RegisterCRUD(sf, h, Resource[TeacherSubject]{
		Name:         "teacher-subjects",
		Filters:      []string{"teacher_id", "subject_id"},
		BeforeCreate: beforeCreateTeacherSubject,
	})

	RegisterCRUD(sf, h, Resource[Student]{
		Name:         "students",
		Searchable:   []string{"name", "email", "phone", "code"},
		Filters:      []string{"branch_id", "status"},
		Sortable:     []string{"name", "created_at", "enrolled_at"},
		DefaultOrder: "name ASC",
		Archivable:   true,
		Scope:        scopeStudents,
		DateField:    "enrolled_at",
		BeforeCreate: beforeCreateStudent,
	})

	RegisterCRUD(sf, h, Resource[Guardian]{
		Name:         "guardians",
		Searchable:   []string{"name", "email", "phone"},
		Sortable:     []string{"name", "created_at"},
		DefaultOrder: "name ASC",
		Archivable:   true,
		Scope:        scopeGuardians,
	})

	RegisterCRUD(sf, h, Resource[StudentGuardian]{
		Name:         "student-guardians",
		Filters:      []string{"student_id", "guardian_id", "is_primary"},
		Scope:        scopeStudentGuardians,
		BeforeCreate: beforeCreateStudentGuardian,
		AfterCreate:  afterCreateStudentGuardian,
		AfterUpdate:  afterUpdateStudentGuardian,
	})

	// ---------- 3. TEDRIS ----------

	RegisterCRUD(sf, h, Resource[Group]{
		Name:         "groups",
		Searchable:   []string{"name", "code"},
		Filters:      []string{"subject_id", "level_id", "teacher_id", "branch_id", "room_id", "status"},
		Sortable:     []string{"name", "created_at", "start_date"},
		DefaultOrder: "name ASC",
		Archivable:   true,
		Scope:        scopeGroups,
	})

	RegisterCRUD(sf, h, Resource[Enrollment]{
		Name:         "enrollments",
		Filters:      []string{"student_id", "group_id", "status"},
		Sortable:     []string{"joined_at", "created_at"},
		DefaultOrder: "joined_at DESC",
		Scope:        scopeEnrollments,
		DateField:    "joined_at",
		BeforeCreate: beforeCreateEnrollment,
	})

	RegisterCRUD(sf, h, Resource[ScheduleSlot]{
		Name:         "schedule-slots",
		Filters:      []string{"group_id", "teacher_id", "room_id", "branch_id", "weekday", "is_active"},
		Sortable:     []string{"weekday", "start_time"},
		DefaultOrder: "weekday ASC, start_time ASC",
		Scope:        scopeScheduleSlots,
		BeforeCreate: beforeCreateScheduleSlot,
		BeforeUpdate: beforeUpdateScheduleSlot,
	})

	RegisterCRUD(sf, h, Resource[TeacherAvailability]{
		Name:         "teacher-availability",
		Filters:      []string{"teacher_id", "weekday"},
		Sortable:     []string{"weekday", "start_time"},
		DefaultOrder: "weekday ASC, start_time ASC",
		Scope:        scopeTeacherAvailability,
		BeforeCreate: beforeCreateAvailability,
	})

	RegisterCRUD(sf, h, Resource[Lesson]{
		Name:         "lessons",
		Searchable:   []string{"topic"},
		Filters:      []string{"group_id", "teacher_id", "room_id", "status", "schedule_slot_id"},
		Sortable:     []string{"date", "start_time", "created_at"},
		DefaultOrder: "date DESC, start_time ASC",
		Scope:        scopeLessons,
		DateField:    "date",
	})

	RegisterCRUD(sf, h, Resource[Attendance]{
		Name:         "attendance",
		Filters:      []string{"lesson_id", "student_id", "status"},
		Sortable:     []string{"created_at"},
		DefaultOrder: "id ASC",
		Scope:        scopeAttendance,
	})

	// ---------- 4. QIYMETLENDIRME ----------

	RegisterCRUD(sf, h, Resource[Exam]{
		Name:         "exams",
		Searchable:   []string{"title"},
		Filters:      []string{"group_id", "teacher_id", "subject_id", "level_id", "kind", "status"},
		Sortable:     []string{"exam_date", "created_at", "title"},
		DefaultOrder: "created_at DESC",
		Archivable:   true,
		Scope:        scopeExams,
		DateField:    "exam_date",
		BeforeCreate: beforeCreateExam,
		BeforeUpdate: beforeUpdateExam,
	})

	RegisterCRUD(sf, h, Resource[Question]{
		Name:         "questions",
		Searchable:   []string{"text"},
		Filters:      []string{"exam_id", "skill_id", "type"},
		Sortable:     []string{"sort_order", "id"},
		DefaultOrder: "sort_order ASC, id ASC",
		Scope:        scopeQuestions,
	})

	RegisterCRUD(sf, h, Resource[ExamSubmission]{
		Name:         "exam-submissions",
		Filters:      []string{"exam_id", "student_id", "status"},
		Sortable:     []string{"submitted_at", "total_score", "created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeExamSubmissions,
	})

	RegisterCRUD(sf, h, Resource[Answer]{
		Name:         "answers",
		Filters:      []string{"submission_id", "question_id", "is_correct"},
		DefaultOrder: "id ASC",
		Scope:        scopeAnswers,
	})

	RegisterCRUD(sf, h, Resource[SubmissionSkillScore]{
		Name:         "skill-scores",
		Filters:      []string{"submission_id", "student_id", "skill_id"},
		DefaultOrder: "id ASC",
		Scope:        scopeSkillScores,
	})

	RegisterCRUD(sf, h, Resource[PlacementResult]{
		Name:         "placement-results",
		Searchable:   []string{"applicant_name", "applicant_phone", "applicant_email"},
		Filters:      []string{"status", "branch_id", "recommended_level_id", "assigned_group_id", "student_id"},
		Sortable:     []string{"created_at"},
		DefaultOrder: "created_at DESC",
	})

	// ---------- 5. KURS MATERIALI ----------

	RegisterCRUD(sf, h, Resource[SyllabusWeek]{
		Name:         "syllabus-weeks",
		Searchable:   []string{"topic"},
		Filters:      []string{"group_id", "is_published"},
		Sortable:     []string{"week_no"},
		DefaultOrder: "week_no ASC",
		Scope:        scopeSyllabusWeeks,
	})

	RegisterCRUD(sf, h, Resource[Material]{
		Name:         "materials",
		Searchable:   []string{"title", "description"},
		Filters:      []string{"group_id", "syllabus_week_id", "subject_id", "level_id", "type", "is_published"},
		Sortable:     []string{"sort_order", "created_at", "title"},
		DefaultOrder: "sort_order ASC, id DESC",
		Scope:        scopeMaterials,
	})

	RegisterCRUD(sf, h, Resource[Assignment]{
		Name:         "assignments",
		Searchable:   []string{"title", "description"},
		Filters:      []string{"group_id", "teacher_id", "syllabus_week_id", "is_published"},
		Sortable:     []string{"due_date", "created_at", "title"},
		DefaultOrder: "due_date DESC",
		Archivable:   true,
		Scope:        scopeAssignments,
		DateField:    "due_date",
	})

	RegisterCRUD(sf, h, Resource[AssignmentSubmission]{
		Name:         "assignment-submissions",
		Filters:      []string{"assignment_id", "student_id", "status"},
		Sortable:     []string{"submitted_at", "grade", "created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeAssignmentSubmissions,
	})

	// ---------- 6. KOMMUNIKASIYA ----------

	RegisterCRUD(sf, h, Resource[Message]{
		Name:         "messages",
		Searchable:   []string{"subject", "body"},
		Filters:      []string{"student_id", "thread_id", "is_read", "from_user_id", "to_user_id"},
		Sortable:     []string{"created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeMessages,
		BeforeCreate: beforeCreateMessage,
		AfterCreate:  afterCreateMessage,
	})

	RegisterCRUD(sf, h, Resource[Announcement]{
		Name:         "announcements",
		Searchable:   []string{"title", "body"},
		Filters:      []string{"status"},
		Sortable:     []string{"published_at", "created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeAnnouncements,
	})

	RegisterCRUD(sf, h, Resource[Notification]{
		Name:         "notifications",
		Filters:      []string{"type", "is_read", "priority"},
		Sortable:     []string{"created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeNotifications,
	})

	// ---------- 7. MALIYYE ----------

	RegisterCRUD(sf, h, Resource[TuitionPlan]{
		Name:         "tuition-plans",
		Searchable:   []string{"name"},
		Filters:      []string{"group_id", "level_id", "subject_id", "branch_id", "is_active", "period"},
		Sortable:     []string{"name", "amount"},
		DefaultOrder: "name ASC",
	})

	RegisterCRUD(sf, h, Resource[StudentTuition]{
		Name:         "student-tuitions",
		Filters:      []string{"student_id", "group_id", "tuition_plan_id", "status"},
		Sortable:     []string{"start_date", "created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeStudentTuitions,
	})

	RegisterCRUD(sf, h, Resource[Invoice]{
		Name:         "invoices",
		Searchable:   []string{"number", "reference"},
		Filters:      []string{"student_id", "group_id", "branch_id", "status", "period_label", "method"},
		Sortable:     []string{"due_date", "paid_at", "amount", "created_at"},
		DefaultOrder: "due_date DESC",
		Scope:        scopeInvoices,
		DateField:    "due_date",
		BeforeCreate: beforeCreateInvoice,
		AfterUpdate:  afterUpdateInvoice,
	})

	// ---------- 8. MOTIVASIYA ----------

	RegisterCRUD(sf, h, Resource[XPEvent]{
		Name:         "xp-events",
		Filters:      []string{"student_id", "source"},
		Sortable:     []string{"created_at"},
		DefaultOrder: "created_at DESC",
		Scope:        scopeStudentOwned,
		BeforeCreate: beforeCreateXP,
	})

	RegisterCRUD(sf, h, Resource[Achievement]{
		Name:         "achievements",
		Searchable:   []string{"title", "code"},
		Filters:      []string{"is_active"},
		Sortable:     []string{"sort_order", "title"},
		DefaultOrder: "sort_order ASC, id ASC",
		Scope:        scopeLookupActive,
	})

	RegisterCRUD(sf, h, Resource[StudentAchievement]{
		Name:         "student-achievements",
		Filters:      []string{"student_id", "achievement_id"},
		Sortable:     []string{"earned_at"},
		DefaultOrder: "earned_at DESC NULLS LAST",
		Scope:        scopeStudentOwned,
	})

	// ---------- 9. IDARE ----------

	RegisterCRUD(sf, h, Resource[SubRole]{
		Name:         "sub-roles",
		Searchable:   []string{"name", "description"},
		Filters:      []string{"base_role", "is_active"},
		DefaultOrder: "id ASC",
	})

	RegisterCRUD(sf, h, Resource[Setting]{
		Name:         "settings",
		Searchable:   []string{"key", "label"},
		Filters:      []string{"group_name", "is_public"},
		DefaultOrder: "group_name ASC, key ASC",
	})
}
