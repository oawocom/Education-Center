package educationcenter

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// SCOPE-LAR (setir seviyyesinde tehlukesizlik)
//
// permissions.go -> "hansi EMELIYYAT" (read/create/update/delete)
// scopes.go      -> "hansi SETIRLER"  (muellim yalniz oz qruplari ve s.)
//
// Bu funksiyalar RegisterCRUD-a verilir, handler-lerin icinde
// "if role == ..." yazilmir.
//
// Qayda: taninmayan rol ucun hemise "1 = 0" (hec ne gormesin).
// ============================================================

// --- Tez-tez isledilen alt sorgular ---

const (
	// Muellimin qruplari
	sqlTeacherGroups = "SELECT x.gid FROM (SELECT id AS gid, teacher_id AS tid FROM edu_groups UNION ALL SELECT group_id AS gid, teacher_id AS tid FROM edu_schedule_slots WHERE is_active = true) x WHERE x.tid = ?"

	// Valideynin ovladlari
	sqlGuardianStudents = "SELECT student_id FROM edu_student_guardians WHERE guardian_id = ?"

	// Sagirdin aktiv qruplari
	sqlStudentGroups = "SELECT group_id FROM edu_enrollments WHERE student_id = ? AND status = 'active'"

	// Valideyn ovladlarinin qruplari
	sqlGuardianGroups = "SELECT group_id FROM edu_enrollments WHERE status = 'active' AND student_id IN (" + sqlGuardianStudents + ")"

	// Muellimin qruplarindaki sagirdler
	sqlTeacherStudents = "SELECT student_id FROM edu_enrollments WHERE status = 'active' AND group_id IN (" + sqlTeacherGroups + ")"

	// Muellimin dersleri
	sqlTeacherLessons = "SELECT id FROM edu_lessons WHERE teacher_id = ? OR (teacher_id IS NULL AND group_id IN (SELECT id FROM edu_groups WHERE teacher_id = ?))"

	// Muellimin imtahanlari
	sqlTeacherExams = "SELECT id FROM edu_exams WHERE teacher_id = ? OR group_id IN (" + sqlTeacherGroups + ")"

	// Muellimin tapsiriqlari
	sqlTeacherAssignments = "SELECT id FROM edu_assignments WHERE group_id IN (" + sqlTeacherGroups + ")"
)

func denyAll(db *gorm.DB) *gorm.DB { return db.Where("1 = 0") }

// ============================================================
// INSANLAR
// ============================================================

func scopeStudents(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("id IN ("+sqlTeacherStudents+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeGuardians(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("id IN (SELECT guardian_id FROM edu_student_guardians WHERE student_id IN ("+sqlTeacherStudents+"))", currentTeacherID(c))
	case RoleGuardian:
		return db.Where("id = ?", currentGuardianID(c))
	case RoleStudent:
		return db.Where("id IN (SELECT guardian_id FROM edu_student_guardians WHERE student_id = ?)", currentStudentID(c))
	}
	return denyAll(db)
}

func scopeStudentGuardians(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("student_id IN ("+sqlTeacherStudents+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("guardian_id = ?", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// TEDRIS
// ============================================================

func scopeGroups(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("id IN ("+sqlTeacherGroups+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("id IN ("+sqlStudentGroups+")", currentStudentID(c))
	case RoleGuardian:
		return db.Where("id IN ("+sqlGuardianGroups+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeEnrollments(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeScheduleSlots(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("teacher_id = ? OR group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		return db.Where("group_id IN ("+sqlStudentGroups+")", currentStudentID(c))
	case RoleGuardian:
		return db.Where("group_id IN ("+sqlGuardianGroups+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeTeacherAvailability(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("teacher_id = ?", currentTeacherID(c))
	}
	return denyAll(db)
}

func scopeLessons(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("edu_lessons.teacher_id = ? OR (edu_lessons.teacher_id IS NULL AND edu_lessons.group_id IN (SELECT id FROM edu_groups WHERE teacher_id = ?))", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		return db.Where("edu_lessons.group_id IN ("+sqlStudentGroups+")", currentStudentID(c))
	case RoleGuardian:
		return db.Where("edu_lessons.group_id IN ("+sqlGuardianGroups+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeAttendance(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("lesson_id IN ("+sqlTeacherLessons+")", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// QIYMETLENDIRME
// ============================================================

func scopeExams(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("teacher_id = ? OR group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		// Sagird yalniz DERC OLUNMUS imtahanlari gorur (qaralama halindakilari yox)
		return db.Where("status = ? AND group_id IN ("+sqlStudentGroups+")", "published", currentStudentID(c))
	case RoleGuardian:
		return db.Where("status = ? AND group_id IN ("+sqlGuardianGroups+")", "published", currentGuardianID(c))
	}
	return denyAll(db)
}

// Qeyd: questions resursu icaze matrisinde yalniz admin/muellime aciqdir.
// Sagird suallari "imtahani basla" endpoint-i vasitesile alir — orada
// correct_answer sahesi cavabdan cixarilir.
func scopeQuestions(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("exam_id IN ("+sqlTeacherExams+")", currentTeacherID(c), currentTeacherID(c))
	}
	return denyAll(db)
}

func scopeExamSubmissions(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("exam_id IN ("+sqlTeacherExams+")", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeAnswers(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("submission_id IN (SELECT id FROM edu_exam_submissions WHERE exam_id IN ("+sqlTeacherExams+"))", currentTeacherID(c), currentTeacherID(c))
	case RoleStudent:
		return db.Where("submission_id IN (SELECT id FROM edu_exam_submissions WHERE student_id = ?)", currentStudentID(c))
	}
	return denyAll(db)
}

func scopeSkillScores(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("student_id IN ("+sqlTeacherStudents+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// KURS MATERIALI
// ============================================================

func scopeSyllabusWeeks(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("is_published = true AND group_id IN ("+sqlStudentGroups+")", currentStudentID(c))
	case RoleGuardian:
		return db.Where("is_published = true AND group_id IN ("+sqlGuardianGroups+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeMaterials(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("group_id IS NULL OR group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("is_published = true AND (group_id IS NULL OR group_id IN ("+sqlStudentGroups+"))", currentStudentID(c))
	case RoleGuardian:
		return db.Where("is_published = true AND (group_id IS NULL OR group_id IN ("+sqlGuardianGroups+"))", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeAssignments(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("group_id IN ("+sqlTeacherGroups+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("is_published = true AND group_id IN ("+sqlStudentGroups+") AND (student_ids IS NULL OR jsonb_array_length(student_ids) = 0 OR student_ids @> to_jsonb(?::bigint))", currentStudentID(c), currentStudentID(c))
	case RoleGuardian:
		return db.Where("is_published = true AND group_id IN ("+sqlGuardianGroups+") AND (student_ids IS NULL OR jsonb_array_length(student_ids) = 0 OR EXISTS (SELECT 1 FROM edu_student_guardians sg WHERE sg.guardian_id = ? AND student_ids @> to_jsonb(sg.student_id)))", currentGuardianID(c), currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeAssignmentSubmissions(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("assignment_id IN ("+sqlTeacherAssignments+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// KOMMUNIKASIYA
// ============================================================

func scopeMessages(c *gin.Context, db *gorm.DB) *gorm.DB {
	if currentRole(c) == RoleAdmin {
		return db
	}
	uid := currentUserID(c)
	if uid == 0 {
		return denyAll(db)
	}
	return db.Where("from_user_id = ? OR to_user_id = ?", uid, uid)
}

func scopeNotifications(c *gin.Context, db *gorm.DB) *gorm.DB {
	uid := currentUserID(c)
	if uid == 0 {
		return denyAll(db)
	}
	return db.Where("user_id = ?", uid)
}

func scopeAnnouncements(c *gin.Context, db *gorm.DB) *gorm.DB {
	if currentRole(c) == RoleAdmin {
		return db
	}
	// Qeyri-admin yalniz derc olunmus ve oz roluna hedeflenmisleri gorur.
	// target_roles bos olsa — hamiya aiddir.
	return db.Where(
		"status = ? AND (target_roles IS NULL OR target_roles = '[]'::jsonb OR target_roles @> ?::jsonb)",
		"published", `"`+currentRole(c)+`"`,
	)
}

// ============================================================
// MALIYYE
// ============================================================

func scopeInvoices(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

func scopeStudentTuitions(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// MOTIVASIYA
// ============================================================

func scopeStudentOwned(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("student_id IN ("+sqlTeacherStudents+")", currentTeacherID(c))
	case RoleStudent:
		return db.Where("student_id = ?", currentStudentID(c))
	case RoleGuardian:
		return db.Where("student_id IN ("+sqlGuardianStudents+")", currentGuardianID(c))
	}
	return denyAll(db)
}

// ============================================================
// SORGU KITABCALARI (branch/room/subject/level/skill/teacher)
// Butun rollar oxuya biler — yazma icazesi matris ile idare olunur.
// Aktiv olmayanlar qeyri-adminden gizledilir.
// ============================================================

func scopeLookupActive(c *gin.Context, db *gorm.DB) *gorm.DB {
	if currentRole(c) == RoleAdmin {
		return db
	}
	return db.Where("is_active = ?", true)
}

func scopeTeachers(c *gin.Context, db *gorm.DB) *gorm.DB {
	switch currentRole(c) {
	case RoleAdmin:
		return db
	case RoleTeacher:
		return db.Where("is_archived = ?", false)
	case RoleStudent:
		return db.Where("is_archived = false AND id IN (SELECT teacher_id FROM edu_groups WHERE teacher_id IS NOT NULL AND id IN ("+sqlStudentGroups+"))", currentStudentID(c))
	case RoleGuardian:
		return db.Where("is_archived = false AND id IN (SELECT teacher_id FROM edu_groups WHERE teacher_id IS NOT NULL AND id IN ("+sqlGuardianGroups+"))", currentGuardianID(c))
	}
	return denyAll(db)
}
