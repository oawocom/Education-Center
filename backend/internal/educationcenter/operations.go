package educationcenter

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// ƏMƏLİYYATLAR
//
// CRUD "bir qeyd" səviyyəsində işləyir. Tədris mərkəzinin
// gündəlik işi isə təkrarlanan toplu əməliyyatlardan ibarətdir:
//
//   · həftəlik cədvəldən konkret dərslərin yaradılması
//   · ayın əvvəlində qaimələrin kəsilməsi
//   · gecikən ödənişlərin işarələnməsi və valideynə bildiriş
//   · level imtahanı verən müraciətçinin şagirdə çevrilməsi
//   · ardıcıl qayıb halında avtomatik xəbərdarlıq
//
// Bunlar əl ilə görüləndə mərkəz "sistem" olmaqdan çıxıb
// cədvəl proqramına çevrilir. Ona görə hamısı serverdədir.
// ============================================================

// ---------- Ümumi köməkçilər ----------

func trimTo(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// parseDate - həm "2006-01-02", həm də RFC3339 qəbul edir
// (interfeys tarixi "2026-09-01T00:00:00Z" formatında göndərir).
func parseDate(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if len(s) >= 10 {
		if t, err := time.Parse("2006-01-02", s[:10]); err == nil {
			return t, true
		}
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, true
	}
	return time.Time{}, false
}

// isoWeekday - 1=Bazar ertəsi ... 7=Bazar (models.go-dakı ilə eyni)
func isoWeekday(t time.Time) int {
	wd := int(t.Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

// settingValue - edu_settings-dən bir parametri oxuyur.
func settingValue(db *gorm.DB, key string) []byte {
	var s Setting
	if db.Where("key = ?", key).First(&s).Error != nil {
		return nil
	}
	return s.Value
}

func settingInt(db *gorm.DB, key string, def int) int {
	raw := settingValue(db, key)
	if len(raw) == 0 {
		return def
	}
	var n int
	if json.Unmarshal(raw, &n) == nil {
		return n
	}
	return def
}

func defaultCurrency(db *gorm.DB) string {
	raw := settingValue(db, "default_currency")
	if len(raw) == 0 {
		return "AZN"
	}
	var s string
	if json.Unmarshal(raw, &s) == nil && s != "" {
		return s
	}
	return "AZN"
}

// nextInvoiceNumber - INV-2026-000123 formatında ardıcıl nömrə.
func nextInvoiceNumber(db *gorm.DB) string {
	var n int64
	db.Model(&Invoice{}).Count(&n)
	return fmt.Sprintf("INV-%d-%06d", time.Now().Year(), n+1)
}

// nextStudentCode - ST-000123
func nextStudentCode(db *gorm.DB) string {
	var n int64
	db.Model(&Student{}).Count(&n)
	return fmt.Sprintf("ST-%06d", n+1)
}

// pushNotification - bildiriş yazır. Səssizcə uğursuz olur:
// bildiriş çatmasa da əsas əməliyyat pozulmamalıdır.
func pushNotification(db *gorm.DB, userID uint, kind, title, body, link, refType string, refID *uint, priority string) {
	createNotification(db, Notification{
		UserID: userID, Type: kind, Title: title, Body: body, Link: link,
		RefType: refType, RefID: refID, Priority: priority,
	}, true)
}

// notifyAboutStudent - şagirdlə bağlı xəbəri həm şagirdin özünə,
// həm də bütün valideynlərinə çatdırır.
func notifyAboutStudent(db *gorm.DB, studentID uint, kind, title, body, priority string) {
	var users []EduUser
	db.Where("is_active = ? AND (student_id = ? OR guardian_id IN (SELECT guardian_id FROM edu_student_guardians WHERE student_id = ?))",
		true, studentID, studentID).Find(&users)

	sid := studentID
	for i := range users {
		pushNotification(db, users[i].ID, kind, title, body, "", "student", &sid, priority)
	}
}

// ============================================================
// 1. CƏDVƏLDƏN DƏRS YARATMA
// POST /sf/ops/generate-lessons {date_from, date_to, group_id?}
// ============================================================

func (h *Handler) GenerateLessons(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
		GroupID  *uint  `json:"group_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Tarix aralığı tələb olunur"})
		return
	}

	from, ok1 := parseDate(req.DateFrom)
	to, ok2 := parseDate(req.DateTo)
	if !ok1 || !ok2 {
		c.JSON(400, gin.H{"error": "Tarix formatı düzgün deyil"})
		return
	}
	if to.Before(from) {
		c.JSON(400, gin.H{"error": "Son tarix başlanğıcdan əvvəl ola bilməz"})
		return
	}
	if to.Sub(from) > 190*24*time.Hour {
		c.JSON(400, gin.H{"error": "Aralıq 6 aydan uzun ola bilməz"})
		return
	}

	// Müəllim yalnız öz qrupları üçün yarada bilər
	slotQ := scopeScheduleSlots(c, db.Model(&ScheduleSlot{})).Where("is_active = ?", true)
	if req.GroupID != nil && *req.GroupID > 0 {
		slotQ = slotQ.Where("group_id = ?", *req.GroupID)
	}

	var slots []ScheduleSlot
	slotQ.Find(&slots)
	if len(slots) == 0 {
		c.JSON(200, gin.H{"success": true, "created": 0, "message": "Uyğun cədvəl sətri tapılmadı"})
		return
	}

	created := 0
	skipped := 0

	err = db.Transaction(func(tx *gorm.DB) error {
		for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
			wd := isoWeekday(d)
			for i := range slots {
				s := slots[i]
				if s.Weekday != wd {
					continue
				}
				if s.EffectiveFrom != nil && d.Before(*s.EffectiveFrom) {
					continue
				}
				if s.EffectiveTo != nil && d.After(*s.EffectiveTo) {
					continue
				}

				// Təkrar yaratma
				var dup int64
				tx.Model(&Lesson{}).
					Where("group_id = ? AND date = ? AND start_time = ?", s.GroupID, d, s.StartTime).
					Count(&dup)
				if dup > 0 {
					skipped++
					continue
				}

				slotID := s.ID
				lesson := Lesson{
					GroupID:        s.GroupID,
					ScheduleSlotID: &slotID,
					TeacherID:      s.TeacherID,
					RoomID:         s.RoomID,
					Date:           d,
					StartTime:      s.StartTime,
					EndTime:        s.EndTime,
					Status:         "scheduled",
				}
				if err := tx.Create(&lesson).Error; err != nil {
					return err
				}
				created++
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "created": created, "skipped": skipped})
}

// ============================================================
// 2. AYLIQ QAİMƏLƏRİN KƏSİLMƏSİ
// POST /sf/ops/generate-invoices {period:"2026-09", due_day?}
// ============================================================

func (h *Handler) GenerateInvoices(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		Period string `json:"period"`
		DueDay int    `json:"due_day"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Dövr tələb olunur"})
		return
	}

	period := strings.TrimSpace(req.Period)
	start, err := time.Parse("2006-01", period)
	if err != nil {
		c.JSON(400, gin.H{"error": "Dövr formatı: 2026-09"})
		return
	}
	end := start.AddDate(0, 1, -1)

	dueDay := req.DueDay
	if dueDay <= 0 {
		dueDay = settingInt(db, "invoice_due_day", 5)
	}
	if dueDay < 1 || dueDay > 28 {
		dueDay = 5
	}
	dueDate := time.Date(start.Year(), start.Month(), dueDay, 0, 0, 0, 0, time.UTC)
	currency := defaultCurrency(db)

	var tuitions []StudentTuition
	db.Where("status = ?", "active").
		Where("(start_date IS NULL OR start_date <= ?)", end).
		Where("(end_date IS NULL OR end_date >= ?)", start).
		Find(&tuitions)

	created := 0
	skipped := 0

	type invoiceNote struct {
		studentID uint
		body      string
	}
	var notes []invoiceNote
	err = db.Transaction(func(tx *gorm.DB) error {
		for i := range tuitions {
			t := tuitions[i]

			var dup int64
			tx.Model(&Invoice{}).
				Where("student_id = ? AND period_label = ?", t.StudentID, period).
				Count(&dup)
			if dup > 0 {
				skipped++
				continue
			}

			amount := t.FinalAmount
			if amount <= 0 {
				amount = t.Amount
				if t.DiscountPct > 0 {
					amount = amount * float64(100-t.DiscountPct) / 100
				}
			}
			if amount <= 0 {
				skipped++
				continue
			}

			cur := t.Currency
			if cur == "" {
				cur = currency
			}

			var branchID *uint
			var student Student
			if tx.First(&student, t.StudentID).Error == nil {
				branchID = student.BranchID
			}

			tuitionID := t.ID
			due := dueDate
			inv := Invoice{
				StudentID:        t.StudentID,
				StudentTuitionID: &tuitionID,
				GroupID:          t.GroupID,
				BranchID:         branchID,
				Number:           nextInvoiceNumber(tx),
				PeriodLabel:      period,
				Amount:           amount,
				Currency:         cur,
				DueDate:          &due,
				Status:           "pending",
			}
			if err := tx.Create(&inv).Error; err != nil {
				return err
			}
			created++

			// bildiriş (və məktub) tranzaksiya uğurla bitəndən sonra gedir
			notes = append(notes, invoiceNote{t.StudentID, fmt.Sprintf("Məbləğ: %.2f %s · Son ödəniş: %s", amount, cur, due.Format("02.01.2006"))})
		}
		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	for _, n := range notes {
		notifyAboutStudent(db, n.studentID, "invoice", period+" dövrü üçün qaimə", n.body, "normal")
	}

	c.JSON(200, gin.H{"success": true, "created": created, "skipped": skipped, "period": period})
}

// ============================================================
// 3. GECİKƏN ÖDƏNİŞLƏR
// POST /sf/ops/mark-overdue
// ============================================================

func (h *Handler) MarkOverdueInvoices(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	today := time.Now()

	var due []Invoice
	db.Where("status IN ? AND due_date IS NOT NULL AND due_date < ?",
		[]string{"pending", "partial"}, today).Find(&due)

	for i := range due {
		inv := due[i]
		db.Model(&Invoice{}).Where("id = ?", inv.ID).Update("status", "overdue")
		notifyAboutStudent(db, inv.StudentID, "invoice_overdue",
			"Ödəniş gecikir",
			fmt.Sprintf("%s dövrü üzrə %.2f %s məbləğində ödəniş gecikib.", inv.PeriodLabel, inv.Amount-inv.PaidAmount, inv.Currency),
			"high")
	}

	c.JSON(200, gin.H{"success": true, "count": len(due)})
}

// ============================================================
// 4. MÜRACİƏTÇİNİ ŞAGİRDƏ ÇEVİRMƏK
// POST /sf/ops/place-applicant {placement_id, group_id?, branch_id?}
// ============================================================

func (h *Handler) PlaceApplicant(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		PlacementID uint  `json:"placement_id" binding:"required"`
		GroupID     *uint `json:"group_id"`
		BranchID    *uint `json:"branch_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Level nəticəsi seçilməlidir"})
		return
	}

	var pr PlacementResult
	if err := db.First(&pr, req.PlacementID).Error; err != nil {
		c.JSON(404, gin.H{"error": "Level nəticəsi tapılmadı"})
		return
	}
	if pr.StudentID != nil && *pr.StudentID > 0 {
		c.JSON(400, gin.H{"error": "Bu müraciətçi artıq şagird kimi qeydiyyatdadır"})
		return
	}
	if strings.TrimSpace(pr.ApplicantName) == "" {
		c.JSON(400, gin.H{"error": "Müraciətçinin adı boşdur"})
		return
	}

	branchID := req.BranchID
	if branchID == nil {
		branchID = pr.BranchID
	}
	groupID := req.GroupID
	if groupID == nil {
		groupID = pr.AssignedGroupID
	}

	var student Student
	err = db.Transaction(func(tx *gorm.DB) error {
		student = Student{
			Name:       pr.ApplicantName,
			Email:      pr.ApplicantEmail,
			Phone:      pr.ApplicantPhone,
			BranchID:   branchID,
			Status:     "active",
			EnrolledAt: nowPtr(),
			Code:       nextStudentCode(tx),
			Notes:      "Level imtahanı nəticəsində qeydiyyata alınıb",
		}
		if err := tx.Create(&student).Error; err != nil {
			return err
		}

		if groupID != nil && *groupID > 0 {
			enr := Enrollment{
				StudentID: student.ID,
				GroupID:   *groupID,
				JoinedAt:  time.Now(),
				Status:    "active",
				Note:      "Level imtahanı üzrə yerləşdirmə",
			}
			if err := beforeCreateEnrollment(c, tx, &enr); err != nil {
				return err
			}
			if err := tx.Create(&enr).Error; err != nil {
				return err
			}
		}

		patch := map[string]interface{}{
			"status":     "placed",
			"student_id": student.ID,
		}
		if groupID != nil && *groupID > 0 {
			patch["assigned_group_id"] = *groupID
		}
		return tx.Model(&PlacementResult{}).Where("id = ?", pr.ID).Updates(patch).Error
	})

	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"success": true, "student": student, "created": 1})
}

// ============================================================
// 5. ARDICIL QAYIB XƏBƏRDARLIĞI
//
// Davamiyyət yazılan kimi işə düşür. Neçə ardıcıl qayıbdan sonra
// xəbərdarlıq veriləcəyi edu_settings-dəki `attendance_alert_after`
// parametri ilə idarə olunur (default 2).
// ============================================================

func checkAttendanceAlerts(db *gorm.DB, lesson *Lesson, studentIDs []uint) {
	limit := settingInt(db, "attendance_alert_after", 2)
	if limit <= 0 {
		return
	}

	for _, sid := range studentIDs {
		type row struct {
			Status string
		}
		var rows []row
		db.Raw(`
			SELECT a.status
			FROM edu_attendance a
			JOIN edu_lessons l ON l.id = a.lesson_id
			WHERE a.student_id = ? AND l.group_id = ?
			ORDER BY l.date DESC, l.start_time DESC
			LIMIT ?
		`, sid, lesson.GroupID, limit).Scan(&rows)

		if len(rows) < limit {
			continue
		}

		allAbsent := true
		for _, r := range rows {
			if r.Status != "absent" {
				allAbsent = false
				break
			}
		}
		if !allAbsent {
			continue
		}

		var student Student
		if db.First(&student, sid).Error != nil {
			continue
		}

		notifyAboutStudent(db, sid, "attendance_alert",
			"Ardıcıl qayıb xəbərdarlığı",
			fmt.Sprintf("%s son %d dərsdə iştirak etməyib. Səbəbi aydınlaşdırmaq üçün mərkəzlə əlaqə saxlayın.", student.Name, limit),
			"high")

		// Qrupun müəllimi də xəbərdar olsun
		var group Group
		if db.First(&group, lesson.GroupID).Error == nil && group.TeacherID != nil {
			var tu EduUser
			if db.Where("teacher_id = ? AND is_active = ?", *group.TeacherID, true).First(&tu).Error == nil {
				pushNotification(db, tu.ID, "attendance_alert", "Ardıcıl qayıb",
					fmt.Sprintf("%s (%s) son %d dərsdə iştirak etməyib.", student.Name, group.Name, limit),
					"", "student", &sid, "high")
			}
		}
	}
}

// ============================================================
// 6. İMTAHAN İŞİNİN AVTOMATİK YOXLANMASI
// POST /sf/ops/grade-submission {submission_id}
// POST /sf/ops/grade-pending    {exam_id?}
//
// Bağlı tipli suallar (mcq / multi / truefalse / gap) maşınla
// yoxlanır; açıq suallar müəllimin əl ilə verdiyi bala qalır.
// Nəticə həm ümumi bal, həm də bacarıq üzrə bölgü kimi yazılır —
// "Güclü / zəif tərəflər" ekranı məhz bu bölgüdən qidalanır.
// ============================================================

// normalizeAnswer - cavabı müqayisə üçün sabit sətrə çevirir.
// Sıra fərqi (çoxseçimli suallarda) və hərf registri nəticəyə təsir etmir.
func normalizeAnswer(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var v interface{}
	if json.Unmarshal(raw, &v) != nil {
		return strings.ToLower(strings.TrimSpace(string(raw)))
	}

	switch t := v.(type) {
	case []interface{}:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			parts = append(parts, strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", item))))
		}
		// sadə sıralama — element sayı azdır
		for i := 0; i < len(parts); i++ {
			for j := i + 1; j < len(parts); j++ {
				if parts[j] < parts[i] {
					parts[i], parts[j] = parts[j], parts[i]
				}
			}
		}
		return strings.Join(parts, "|")
	case string:
		return strings.ToLower(strings.TrimSpace(t))
	default:
		return strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", v)))
	}
}

var autoGradable = map[string]bool{
	"mcq": true, "multi": true, "truefalse": true, "gap": true, "match": true, "numeric": true,
}

// gradeSubmission - bir işi yoxlayır və nəticəni yazır.
func gradeSubmission(db *gorm.DB, submissionID uint, graderID uint) (float32, error) {
	var sub ExamSubmission
	if err := db.First(&sub, submissionID).Error; err != nil {
		return 0, fmt.Errorf("İş tapılmadı")
	}

	var questions []Question
	db.Where("exam_id = ?", sub.ExamID).Find(&questions)
	if len(questions) == 0 {
		return 0, fmt.Errorf("İmtahanın sualı yoxdur")
	}

	var answers []Answer
	db.Where("submission_id = ?", submissionID).Find(&answers)
	answerBy := map[uint]*Answer{}
	for i := range answers {
		answerBy[answers[i].QuestionID] = &answers[i]
	}

	var autoScore float32
	var maxPoints float32

	// Bacarıq üzrə toplama
	type agg struct{ score, max float32 }
	bySkill := map[uint]*agg{}

	err := db.Transaction(func(tx *gorm.DB) error {
		for i := range questions {
			q := questions[i]
			pts := float32(q.Points)
			if pts <= 0 {
				pts = 1
			}
			maxPoints += pts

			if q.SkillID != nil {
				if bySkill[*q.SkillID] == nil {
					bySkill[*q.SkillID] = &agg{}
				}
				bySkill[*q.SkillID].max += pts
			}

			a := answerBy[q.ID]
			if a == nil {
				continue
			}

			if !autoGradable[q.Type] {
				// Açıq sual — müəllimin verdiyi bal saxlanılır
				autoScore += a.Score
				if q.SkillID != nil {
					bySkill[*q.SkillID].score += a.Score
				}
				continue
			}

			correct := answerMatches(q, a.Value)
			score := float32(0)
			if correct {
				score = pts
			}
			autoScore += score
			if q.SkillID != nil {
				bySkill[*q.SkillID].score += score
			}

			isCorrect := correct
			if err := tx.Model(&Answer{}).Where("id = ?", a.ID).Updates(map[string]interface{}{
				"is_correct": &isCorrect,
				"score":      score,
			}).Error; err != nil {
				return err
			}
		}

		total := autoScore + sub.ManualScore
		var pct float32
		if maxPoints > 0 {
			pct = total / maxPoints * 100
		}

		now := time.Now()
		patch := map[string]interface{}{
			"auto_score":  autoScore,
			"total_score": total,
			"percentage":  pct,
			"status":      "graded",
			"graded_at":   &now,
		}
		if graderID != 0 {
			patch["graded_by"] = graderID
		}
		if err := tx.Model(&ExamSubmission{}).Where("id = ?", submissionID).Updates(patch).Error; err != nil {
			return err
		}

		// Bacarıq bölgüsü — köhnə sətirlər əvəzlənir
		tx.Where("submission_id = ?", submissionID).Delete(&SubmissionSkillScore{})
		for skillID, a := range bySkill {
			if a.max <= 0 {
				continue
			}
			if err := tx.Create(&SubmissionSkillScore{
				SubmissionID: submissionID,
				StudentID:    sub.StudentID,
				SkillID:      skillID,
				Score:        a.score,
				MaxScore:     a.max,
				Percentage:   a.score / a.max * 100,
			}).Error; err != nil {
				return err
			}
		}

		// XP — eyni iş üçün yalnız bir dəfə
		var xpDup int64
		tx.Model(&XPEvent{}).
			Where("student_id = ? AND ref_type = ? AND ref_id = ?", sub.StudentID, "exam_submission", submissionID).
			Count(&xpDup)
		if xpDup == 0 {
			points := int(pct / 10)
			if points > 0 {
				refID := submissionID
				tx.Create(&XPEvent{
					StudentID: sub.StudentID,
					Source:    "exam",
					RefType:   "exam_submission",
					RefID:     &refID,
					Points:    points,
					Note:      "İmtahan nəticəsi",
				})
			}
		}

		return nil
	})

	if err != nil {
		return 0, err
	}

	var pct float32
	if maxPoints > 0 {
		pct = (autoScore + sub.ManualScore) / maxPoints * 100
	}

	notifyAboutStudent(db, sub.StudentID, "exam_graded", "İmtahan qiymətləndirildi",
		fmt.Sprintf("Nəticə: %.0f%%", pct), "normal")

	return pct, nil
}

func (h *Handler) GradeSubmission(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		SubmissionID uint `json:"submission_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "İş seçilməlidir"})
		return
	}

	// Müəllim yalnız öz imtahanının işini yoxlaya bilər
	var sub ExamSubmission
	q := scopeExamSubmissions(c, db.Model(&ExamSubmission{}))
	if err := q.Where("id = ?", req.SubmissionID).First(&sub).Error; err != nil {
		c.JSON(404, gin.H{"error": "İş tapılmadı"})
		return
	}

	pct, err := gradeSubmission(db, req.SubmissionID, currentUserID(c))
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "percentage": pct, "count": 1})
}

func (h *Handler) GradePending(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		ExamID *uint `json:"exam_id"`
	}
	_ = c.ShouldBindJSON(&req)

	q := scopeExamSubmissions(c, db.Model(&ExamSubmission{})).Where("status = ?", "submitted")
	if req.ExamID != nil && *req.ExamID > 0 {
		q = q.Where("exam_id = ?", *req.ExamID)
	}

	var subs []ExamSubmission
	q.Find(&subs)

	graded := 0
	for i := range subs {
		if _, err := gradeSubmission(db, subs[i].ID, currentUserID(c)); err == nil {
			graded++
		}
	}

	c.JSON(200, gin.H{"success": true, "count": graded})
}

// ============================================================
// 7. MƏRKƏZİN ÜMUMİ MƏNZƏRƏSİ
// GET /sf/stats/overview
//
// Admin panelinin giriş ekranı üçün: diqqət tələb edən yerlər.
// ============================================================

func (h *Handler) StatsOverview(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	out := gin.H{}

	count := func(model interface{}, cond string, args ...interface{}) int64 {
		var n int64
		q := db.Model(model)
		if cond != "" {
			q = q.Where(cond, args...)
		}
		q.Count(&n)
		return n
	}

	out["students_active"] = count(&Student{}, "status = ? AND is_archived = ?", "active", false)
	out["groups_active"] = count(&Group{}, "status = ? AND is_archived = ?", "active", false)
	out["teachers"] = count(&Teacher{}, "is_archived = ?", false)

	// Diqqət tələb edənlər
	out["students_without_guardian"] = count(&Student{},
		"is_archived = false AND id NOT IN (SELECT student_id FROM edu_student_guardians)")
	out["students_without_group"] = count(&Student{},
		"is_archived = false AND status = 'active' AND id NOT IN (SELECT student_id FROM edu_enrollments WHERE status = 'active')")
	out["groups_without_teacher"] = count(&Group{},
		"is_archived = false AND status = 'active' AND teacher_id IS NULL")
	out["groups_without_schedule"] = count(&Group{},
		"is_archived = false AND status = 'active' AND id NOT IN (SELECT group_id FROM edu_schedule_slots WHERE is_active = true)")
	out["invoices_overdue"] = count(&Invoice{}, "status = ?", "overdue")
	out["submissions_pending"] = count(&ExamSubmission{}, "status = ?", "submitted")

	var overdueSum float64
	db.Raw(`SELECT COALESCE(SUM(amount - paid_amount), 0) FROM edu_invoices WHERE status IN ('overdue','partial','pending')`).Scan(&overdueSum)
	out["receivables"] = overdueSum

	// Bu həftə keçiriləcək dərslər
	now := time.Now()
	weekEnd := now.AddDate(0, 0, 7)
	out["lessons_this_week"] = count(&Lesson{}, "date >= ? AND date <= ? AND status = ?", now.Format("2006-01-02"), weekEnd.Format("2006-01-02"), "scheduled")

	c.JSON(200, out)
}

// parseUintQuery - kiçik köməkçi (query parametrləri üçün)
func parseUintQuery(c *gin.Context, key string) uint {
	v, err := strconv.ParseUint(c.Query(key), 10, 64)
	if err != nil {
		return 0
	}
	return uint(v)
}

// answerMatches - tek sual ucun cavabin dogrulugu.
//
//	gap     : correct_answer massivdirse — istenilen biri dogrudur (boşluq/registr nezere alinmir)
//	numeric : correct_answer {"value":3.14,"tolerance":0.01} ve ya sade eded
//	qalanlar: normalizeAnswer ile bire-bir
func answerMatches(q Question, value []byte) bool {
	switch q.Type {
	case "numeric":
		var want struct {
			Value     float64 `json:"value"`
			Tolerance float64 `json:"tolerance"`
		}
		raw := []byte(q.CorrectAnswer)
		if json.Unmarshal(raw, &want) != nil {
			var f float64
			if json.Unmarshal(raw, &f) != nil {
				return false
			}
			want.Value = f
		}
		var got float64
		if json.Unmarshal(value, &got) != nil {
			var s string
			if json.Unmarshal(value, &s) != nil {
				return false
			}
			s = strings.ReplaceAll(strings.TrimSpace(s), ",", ".")
			if _, err := fmt.Sscanf(s, "%f", &got); err != nil {
				return false
			}
		}
		d := got - want.Value
		if d < 0 {
			d = -d
		}
		return d <= want.Tolerance+1e-9
	case "gap":
		var opts []string
		if json.Unmarshal(q.CorrectAnswer, &opts) == nil && len(opts) > 0 {
			got := normalizeAnswer(value)
			for _, o := range opts {
				if strings.ToLower(strings.TrimSpace(o)) == got {
					return true
				}
			}
			return false
		}
	}
	return normalizeAnswer(q.CorrectAnswer) == normalizeAnswer(value)
}
