package educationcenter

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// AQREQAT HESABATLAR
//
// Generic CRUD sətirləri qaytarır; bu fayl isə hesablanmış
// göstəriciləri qaytarır (filial statistikası, müəllim
// performansı, bacarıq profili, davamiyyət icmalı, nailiyyətlər).
//
// Rol məhdudiyyəti: hər handler öz scope-unu tətbiq edir —
// şagird yalnız özünü, valideyn yalnız övladlarını görür.
// ============================================================

// resolveStudentID - sorğudakı student_id-ni rola görə yoxlayır.
// Şagird üçün həmişə öz ID-si, valideyn üçün yalnız öz övladı.
func resolveStudentID(c *gin.Context, db *gorm.DB) (uint, bool) {
	role := currentRole(c)

	if role == RoleStudent {
		return currentStudentID(c), currentStudentID(c) != 0
	}

	requested, _ := strconv.ParseUint(c.Query("student_id"), 10, 64)

	if role == RoleGuardian {
		gid := currentGuardianID(c)
		if gid == 0 {
			return 0, false
		}

		var ids []uint
		db.Raw("SELECT student_id FROM edu_student_guardians WHERE guardian_id = ?", gid).Scan(&ids)
		if len(ids) == 0 {
			return 0, false
		}

		if requested == 0 {
			return ids[0], true
		}
		for _, id := range ids {
			if id == uint(requested) {
				return id, true
			}
		}
		return 0, false
	}

	// admin / müəllim
	if requested == 0 {
		return 0, false
	}
	return uint(requested), true
}

// ============================================================
// FILIAL STATISTIKASI
// GET /sf/stats/branches
// ============================================================

type BranchStat struct {
	BranchID uint   `json:"branch_id"`
	Name     string `json:"name"`
	Students int64  `json:"students"`
	Teachers int64  `json:"teachers"`
	Groups   int64  `json:"groups"`
	Rooms    int64  `json:"rooms"`
}

func (h *Handler) StatsBranches(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	rows := make([]BranchStat, 0)
	db.Raw(`
		SELECT b.id AS branch_id, b.name,
			(SELECT COUNT(*) FROM edu_students s WHERE s.branch_id = b.id AND s.is_archived = false) AS students,
			(SELECT COUNT(*) FROM edu_teachers t WHERE t.branch_id = b.id AND t.is_archived = false) AS teachers,
			(SELECT COUNT(*) FROM edu_groups g WHERE g.branch_id = b.id AND g.is_archived = false) AS groups,
			(SELECT COUNT(*) FROM edu_rooms r WHERE r.branch_id = b.id) AS rooms
		FROM edu_branches b
		ORDER BY b.sort_order ASC, b.name ASC
	`).Scan(&rows)

	c.JSON(200, gin.H{"data": rows})
}

// ============================================================
// MUELLIM PERFORMANSI
// GET /sf/stats/teacher-performance
// ============================================================

type TeacherStat struct {
	TeacherID   uint    `json:"teacher_id"`
	Name        string  `json:"name"`
	Groups      int64   `json:"groups"`
	Students    int64   `json:"students"`
	AvgScore    float64 `json:"avg_score"`
	Submissions int64   `json:"submissions"`
	Attendance  float64 `json:"attendance"`
}

func (h *Handler) StatsTeacherPerformance(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	rows := make([]TeacherStat, 0)
	db.Raw(`
		SELECT t.id AS teacher_id, t.name,
			(SELECT COUNT(*) FROM edu_groups g WHERE g.teacher_id = t.id AND g.is_archived = false) AS groups,
			(SELECT COUNT(*) FROM edu_enrollments e
				WHERE e.status = 'active'
				  AND e.group_id IN (SELECT id FROM edu_groups WHERE teacher_id = t.id)) AS students,
			COALESCE((SELECT AVG(es.percentage) FROM edu_exam_submissions es
				WHERE es.status = 'graded'
				  AND es.exam_id IN (SELECT id FROM edu_exams WHERE teacher_id = t.id)), 0) AS avg_score,
			(SELECT COUNT(*) FROM edu_exam_submissions es
				WHERE es.exam_id IN (SELECT id FROM edu_exams WHERE teacher_id = t.id)) AS submissions,
			COALESCE((SELECT 100.0 * COUNT(*) FILTER (WHERE a.status IN ('present','late')) / NULLIF(COUNT(*), 0)
				FROM edu_attendance a
				WHERE a.lesson_id IN (SELECT id FROM edu_lessons WHERE teacher_id = t.id)), 0) AS attendance
		FROM edu_teachers t
		WHERE t.is_archived = false
		ORDER BY t.name ASC
	`).Scan(&rows)

	c.JSON(200, gin.H{"data": rows})
}

// ============================================================
// BACARIQ PROFILI (guclu / zeif terefler)
// GET /sf/stats/skills?student_id=
// ============================================================

type SkillStat struct {
	SkillID    uint    `json:"skill_id"`
	Name       string  `json:"name"`
	Code       string  `json:"code"`
	Percentage float64 `json:"percentage"`
	Count      int64   `json:"count"`
}

func (h *Handler) StatsSkills(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	studentID, ok := resolveStudentID(c, db)
	if !ok {
		c.JSON(400, gin.H{"error": "Şagird seçilməyib"})
		return
	}

	rows := make([]SkillStat, 0)
	db.Raw(`
		SELECT sk.id AS skill_id, sk.name, sk.code,
			COALESCE(AVG(sc.percentage), 0) AS percentage,
			COUNT(sc.id) AS count
		FROM edu_skills sk
		LEFT JOIN edu_submission_skill_scores sc
			ON sc.skill_id = sk.id AND sc.student_id = ?
		WHERE sk.is_active = true
		GROUP BY sk.id, sk.name, sk.code, sk.sort_order
		ORDER BY sk.sort_order ASC, sk.id ASC
	`, studentID).Scan(&rows)

	c.JSON(200, gin.H{"data": rows, "student_id": studentID})
}

// ============================================================
// SAGIRD NETICELERI (bacariq sutunlari ile)
// GET /sf/stats/results?student_id=
// ============================================================

type ResultRow struct {
	SubmissionID uint    `json:"submission_id"`
	ExamID       uint    `json:"exam_id"`
	Title        string  `json:"title"`
	SubmittedAt  *string `json:"submitted_at"`
	Percentage   float64 `json:"percentage"`
	TotalScore   float64 `json:"total_score"`
	Status       string  `json:"status"`
}

func (h *Handler) StatsResults(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	studentID, ok := resolveStudentID(c, db)
	if !ok {
		c.JSON(400, gin.H{"error": "Şagird seçilməyib"})
		return
	}

	results := make([]ResultRow, 0)
	db.Raw(`
		SELECT es.id AS submission_id, es.exam_id, e.title,
			to_char(es.submitted_at, 'YYYY-MM-DD') AS submitted_at,
			es.percentage, es.total_score, es.status
		FROM edu_exam_submissions es
		JOIN edu_exams e ON e.id = es.exam_id
		WHERE es.student_id = ?
		ORDER BY es.submitted_at DESC NULLS LAST, es.id DESC
		LIMIT 50
	`, studentID).Scan(&results)

	// Hər iş üzrə bacarıq bölgüsü
	type skillCell struct {
		SubmissionID uint    `json:"submission_id"`
		Code         string  `json:"code"`
		Name         string  `json:"name"`
		Percentage   float64 `json:"percentage"`
	}
	cells := make([]skillCell, 0)
	db.Raw(`
		SELECT sc.submission_id, sk.code, sk.name, sc.percentage
		FROM edu_submission_skill_scores sc
		JOIN edu_skills sk ON sk.id = sc.skill_id
		WHERE sc.student_id = ?
	`, studentID).Scan(&cells)

	skills := make([]SkillStat, 0)
	db.Raw(`
		SELECT id AS skill_id, name, code FROM edu_skills
		WHERE is_active = true ORDER BY sort_order ASC, id ASC
	`).Scan(&skills)

	var avg float64
	db.Raw(`
		SELECT COALESCE(AVG(percentage), 0) FROM edu_exam_submissions
		WHERE student_id = ? AND status = 'graded'
	`, studentID).Scan(&avg)

	c.JSON(200, gin.H{
		"data":        results,
		"skill_cells": cells,
		"skills":      skills,
		"average":     avg,
		"student_id":  studentID,
	})
}

// ============================================================
// DAVAMIYYET ICMALI
// GET /sf/stats/attendance?student_id=&group_id=
// ============================================================

func (h *Handler) StatsAttendance(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	type bucket struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	}
	rows := make([]bucket, 0)

	role := currentRole(c)
	if role == RoleStudent || role == RoleGuardian {
		studentID, ok := resolveStudentID(c, db)
		if !ok {
			c.JSON(400, gin.H{"error": "Şagird seçilməyib"})
			return
		}
		db.Raw(`SELECT status, COUNT(*) AS count FROM edu_attendance WHERE student_id = ? GROUP BY status`, studentID).Scan(&rows)
		c.JSON(200, gin.H{"data": rows, "student_id": studentID})
		return
	}

	q := `SELECT a.status, COUNT(*) AS count FROM edu_attendance a`
	args := []interface{}{}

	if gid := c.Query("group_id"); gid != "" {
		q += ` JOIN edu_lessons l ON l.id = a.lesson_id WHERE l.group_id = ?`
		args = append(args, gid)
	} else if role == RoleTeacher {
		q += ` WHERE a.lesson_id IN (SELECT id FROM edu_lessons WHERE teacher_id = ?)`
		args = append(args, currentTeacherID(c))
	}

	q += ` GROUP BY a.status`
	db.Raw(q, args...).Scan(&rows)

	c.JSON(200, gin.H{"data": rows})
}

// ============================================================
// NAILIYYETLER (qazanilmis / kilidli)
// GET /sf/stats/achievements?student_id=
// ============================================================

type AchievementRow struct {
	ID          uint    `json:"id"`
	Code        string  `json:"code"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Icon        string  `json:"icon"`
	XPReward    int     `json:"xp_reward"`
	EarnedAt    *string `json:"earned_at"`
	Progress    int     `json:"progress"`
}

func (h *Handler) StatsAchievements(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	studentID, ok := resolveStudentID(c, db)
	if !ok {
		c.JSON(400, gin.H{"error": "Şagird seçilməyib"})
		return
	}

	rows := make([]AchievementRow, 0)
	db.Raw(`
		SELECT a.id, a.code, a.title, a.description, a.icon, a.xp_reward,
			to_char(sa.earned_at, 'YYYY-MM-DD') AS earned_at,
			COALESCE(sa.progress, 0) AS progress
		FROM edu_achievements a
		LEFT JOIN edu_student_achievements sa
			ON sa.achievement_id = a.id AND sa.student_id = ?
		WHERE a.is_active = true
		ORDER BY a.sort_order ASC, a.id ASC
	`, studentID).Scan(&rows)

	var xp int64
	db.Raw(`SELECT COALESCE(SUM(points), 0) FROM edu_xp_events WHERE student_id = ?`, studentID).Scan(&xp)

	c.JSON(200, gin.H{"data": rows, "xp": xp, "student_id": studentID})
}

// ============================================================
// QRUP DAVAMIYYET LOVHESI
// GET  /sf/attendance/board?lesson_id=
// POST /sf/attendance/board   {lesson_id, entries:[{student_id,status,late_min,note}]}
// ============================================================

type BoardStudent struct {
	StudentID uint   `json:"student_id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	LateMin   int    `json:"late_min"`
	Grade     *int   `json:"grade"`
	Note      string `json:"note"`
	MarkedID  *uint  `json:"marked_id"`
}

func (h *Handler) AttendanceBoard(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	lessonID := c.Query("lesson_id")
	if lessonID == "" {
		c.JSON(400, gin.H{"error": "lesson_id tələb olunur"})
		return
	}

	// Müəllim yalnız öz dərsini aça bilər
	var lesson Lesson
	q := db.Model(&Lesson{})
	q = scopeLessons(c, q)
	if err := q.Where("id = ?", lessonID).First(&lesson).Error; err != nil {
		c.JSON(404, gin.H{"error": "Dərs tapılmadı"})
		return
	}

	rows := make([]BoardStudent, 0)
	db.Raw(`
		SELECT s.id AS student_id, s.name,
			COALESCE(a.status, '') AS status,
			COALESCE(a.late_min, 0) AS late_min,
			a.grade AS grade,
			COALESCE(a.note, '') AS note,
			a.id AS marked_id
		FROM edu_enrollments e
		JOIN edu_students s ON s.id = e.student_id
		LEFT JOIN edu_attendance a ON a.student_id = s.id AND a.lesson_id = ?
		WHERE e.group_id = ? AND e.status = 'active' AND s.is_archived = false
		ORDER BY s.name ASC
	`, lesson.ID, lesson.GroupID).Scan(&rows)

	c.JSON(200, gin.H{"data": rows, "lesson": lesson})
}

func (h *Handler) SaveAttendanceBoard(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		LessonID uint `json:"lesson_id" binding:"required"`
		Entries  []struct {
			StudentID uint   `json:"student_id"`
			Status    string `json:"status"`
			LateMin   int    `json:"late_min"`
			Grade     *int   `json:"grade"`
			Note      string `json:"note"`
		} `json:"entries" binding:"required"`
		Topic    *string `json:"topic"`
		Homework *string `json:"homework"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Dərsə çıxış hüququ
	var lesson Lesson
	lq := scopeLessons(c, db.Model(&Lesson{}))
	if err := lq.Where("id = ?", req.LessonID).First(&lesson).Error; err != nil {
		c.JSON(404, gin.H{"error": "Dərs tapılmadı"})
		return
	}

	valid := map[string]bool{"present": true, "late": true, "excused": true, "absent": true}
	marker := currentUserID(c)

	// Hamısı bir tranzaksiyada — yarımçıq qeyd qalmasın
	err = db.Transaction(func(tx *gorm.DB) error {
		for i := range req.Entries {
			e := &req.Entries[i]
			if e.Grade != nil && (*e.Grade < 1 || *e.Grade > 10) {
				return fmt.Errorf("Qiymet 1-10 araliginda olmalidir")
			}
			// Qiymet yazilibsa — avtomatik iştirak edir
			if e.Grade != nil && (e.Status == "" || e.Status == "absent" || e.Status == "excused") {
				e.Status = "present"
			}
			if !valid[e.Status] {
				continue
			}
			rec := Attendance{
				LessonID:  req.LessonID,
				StudentID: e.StudentID,
				Status:    e.Status,
				Grade:     e.Grade,
				LateMin:   e.LateMin,
				Note:      e.Note,
			}
			if marker != 0 {
				m := marker
				rec.MarkedBy = &m
			}

			var existing Attendance
			if tx.Where("lesson_id = ? AND student_id = ?", req.LessonID, e.StudentID).First(&existing).Error == nil {
				if err := tx.Model(&existing).Updates(map[string]interface{}{
					"status":    e.Status,
					"late_min":  e.LateMin,
					"grade":     e.Grade,
					"note":      e.Note,
					"marked_by": rec.MarkedBy,
				}).Error; err != nil {
					return err
				}
				continue
			}

			if err := tx.Create(&rec).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	patch := map[string]interface{}{}
	if req.Topic != nil {
		patch["topic"] = *req.Topic
	}
	if req.Homework != nil {
		patch["homework"] = *req.Homework
	}
	if len(patch) > 0 {
		db.Model(&Lesson{}).Where("id = ?", lesson.ID).Updates(patch)
	}

	// Dərs keçirilmiş sayılsın — davamiyyət qeyd olunubsa dərs baş tutub
	if lesson.Status == "scheduled" {
		db.Model(&Lesson{}).Where("id = ?", lesson.ID).Update("status", "held")
	}

	// Ardıcıl qayıb xəbərdarlığı (operations.go)
	absent := make([]uint, 0)
	for _, e := range req.Entries {
		if e.Status == "absent" {
			absent = append(absent, e.StudentID)
		}
	}
	if len(absent) > 0 {
		checkAttendanceAlerts(db, &lesson, absent)
	}

	c.JSON(200, gin.H{"success": true, "count": len(req.Entries)})
}
