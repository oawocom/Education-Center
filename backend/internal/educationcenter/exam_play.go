package educationcenter

import (
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ============================================================
// İMTAHAN VERMƏ AXINI (şagird tərəfi)
//
// scopes.go-dakı qeyd bunu əvvəlcədən nəzərdə tuturdu:
//
//   "Sagird suallari 'imtahani basla' endpoint-i vasitesile alir —
//    orada correct_answer sahesi cavabdan cixarilir."
//
// Bu fayl həmin endpoint-i təmin edir. Generic CRUD-dakı
// "questions" resursuna şagirdin girişi YOXDUR (scopeQuestions),
// düzgün cavab heç vaxt ona göndərilmir — yalnız bu iki marşrut
// vasitəsilə imtahan verilir:
//
//   POST /sf/exams/:id/start   → iş yoxdursa yaradır (in_progress),
//                                 sualları (cavabsız) qaytarır;
//                                 artıq göndərilibsə nəticəni qaytarır.
//   POST /sf/exams/:id/submit  → cavabları yazır və avtomatik
//                                 yoxlayır (operations.go-dakı
//                                 gradeSubmission ilə eyni məntiq,
//                                 XP və bacarıq bölgüsü daxil).
//
// Qeyd: "exam-submissions" və "answers" üçün şagirdin generic CRUD
// yazma icazəsi YOXDUR (permissions.go-da yalnız oxu) — məhz bu
// iki marşrut vasitəsilə yaza bilər ki, öz balını özü dəyişə bilməsin.
// ============================================================

// PlayQuestion - şagirdə göndərilən sual görünüşü. Diqqət: CorrectAnswer
// BURADA YOXDUR — bu, Question modelinin qəsdən daraldılmış görünüşüdür.
type PlayQuestion struct {
	ID        uint           `json:"id"`
	Type      string         `json:"type"`
	Text      string         `json:"text"`
	MediaURL  string         `json:"media_url"`
	Media     datatypes.JSON `json:"media"`
	Options   datatypes.JSON `json:"options"`
	Points    int            `json:"points"`
	SortOrder int            `json:"sort_order"`
}

// StartExam - imtahanı başladır və ya davam etdirir.
// POST /sf/exams/:id/start
func (h *Handler) StartExam(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	if currentRole(c) != RoleStudent {
		c.JSON(403, gin.H{"error": "Yalnız şagird imtahan verə bilər"})
		return
	}
	studentID := currentStudentID(c)
	if studentID == 0 {
		c.JSON(400, gin.H{"error": "Şagird profili tapılmadı"})
		return
	}

	// Şagird yalnız öz qrupuna dərc olunmuş imtahana girə bilər (scopeExams)
	var exam Exam
	eq := scopeExams(c, db.Model(&Exam{}))
	if err := eq.Where("id = ?", c.Param("id")).First(&exam).Error; err != nil {
		c.JSON(404, gin.H{"error": "İmtahan tapılmadı"})
		return
	}

	var sub ExamSubmission
	found := db.Where("exam_id = ? AND student_id = ?", exam.ID, studentID).First(&sub).Error == nil

	if found && sub.Status != "in_progress" {
		// Artıq göndərilib / yoxlanılıb — sualları yenidən vermə,
		// nəticəyə yönləndirmək üçün mövcud işi qaytar.
		c.JSON(200, gin.H{"already_submitted": true, "submission": sub})
		return
	}

	if !found {
		sub = ExamSubmission{
			ExamID:    exam.ID,
			StudentID: studentID,
			StartedAt: nowPtr(),
			Status:    "in_progress",
		}
		if err := db.Create(&sub).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}

	// Vaxt limiti: bitibse avtomatik baglanir (server terefinde)
	if left, limited := examRemaining(exam, sub); limited && left <= 0 {
		h.closeExam(db, &sub)
		c.JSON(200, gin.H{"already_submitted": true, "timed_out": true, "submission": sub})
		return
	}

	var questions []Question
	db.Where("exam_id = ?", exam.ID).Order("sort_order ASC, id ASC").Find(&questions)
	// Daha evvel yazilmis cavablar (sehife yenilenibse davam etsin)
	var saved []Answer
	db.Where("submission_id = ?", sub.ID).Find(&saved)
	savedOut := map[uint]datatypes.JSON{}
	for _, a := range saved {
		savedOut[a.QuestionID] = a.Value
	}
	if exam.ShuffleQ {
		shuffleQuestions(questions, sub.ID)
	}

	out := make([]PlayQuestion, 0, len(questions))
	for _, q := range questions {
		out = append(out, PlayQuestion{
			ID: q.ID, Type: q.Type, Text: q.Text, MediaURL: q.MediaURL, Media: q.Media,
			Options: q.Options, Points: q.Points, SortOrder: q.SortOrder,
		})
	}

	c.JSON(200, gin.H{
		"already_submitted": false,
		"exam":              exam,
		"submission":        sub,
		"questions":         out,
		"saved_answers":     savedOut,
		"remaining_seconds": remainingOrNeg(exam, sub),
		"limited":           exam.DurationMin > 0,
		"server_now":        time.Now(),
	})
}

type submitAnswerReq struct {
	QuestionID uint           `json:"question_id" binding:"required"`
	Value      datatypes.JSON `json:"value"`
}

// SubmitExam - cavabları yazır və dərhal avtomatik yoxlayır.
// POST /sf/exams/:id/submit  {answers:[{question_id, value}]}
func (h *Handler) SubmitExam(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	if currentRole(c) != RoleStudent {
		c.JSON(403, gin.H{"error": "Yalnız şagird imtahan verə bilər"})
		return
	}
	studentID := currentStudentID(c)
	if studentID == 0 {
		c.JSON(400, gin.H{"error": "Şagird profili tapılmadı"})
		return
	}

	var req struct {
		Answers []submitAnswerReq `json:"answers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var exam Exam
	eq := scopeExams(c, db.Model(&Exam{}))
	if err := eq.Where("id = ?", c.Param("id")).First(&exam).Error; err != nil {
		c.JSON(404, gin.H{"error": "İmtahan tapılmadı"})
		return
	}

	var sub ExamSubmission
	if err := db.Where("exam_id = ? AND student_id = ?", exam.ID, studentID).First(&sub).Error; err != nil {
		c.JSON(400, gin.H{"error": "Əvvəlcə imtahanı başladın"})
		return
	}
	if sub.Status != "in_progress" {
		c.JSON(400, gin.H{"error": "Bu imtahan artıq göndərilib"})
		return
	}

	// Yalnız bu imtahana aid suallara cavab qəbul edilsin
	var validIDs []uint
	db.Model(&Question{}).Where("exam_id = ?", exam.ID).Pluck("id", &validIDs)
	valid := map[uint]bool{}
	for _, id := range validIDs {
		valid[id] = true
	}

	// Vaxt bitibse yeni cavablar qebul edilmir — yalniz avtomatik saxlanmislar sayilir
	late := false
	if left, limited := examRemaining(exam, sub); limited && left < -lateGrace {
		late = true
		req.Answers = nil
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		for _, a := range req.Answers {
			if !valid[a.QuestionID] {
				continue
			}
			var existing Answer
			if tx.Where("submission_id = ? AND question_id = ?", sub.ID, a.QuestionID).First(&existing).Error == nil {
				if err := tx.Model(&existing).Update("value", a.Value).Error; err != nil {
					return err
				}
				continue
			}
			if err := tx.Create(&Answer{
				SubmissionID: sub.ID,
				QuestionID:   a.QuestionID,
				Value:        a.Value,
			}).Error; err != nil {
				return err
			}
		}

		now := time.Now()
		return tx.Model(&ExamSubmission{}).Where("id = ?", sub.ID).Updates(map[string]interface{}{
			"status":       "submitted",
			"submitted_at": &now,
		}).Error
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	pct, err := gradeSubmission(db, sub.ID, 0)
	if err != nil {
		// Cavablar yazılıb, sadəcə avtomatik yoxlama xəta verib —
		// müəllim "Gözləyənləri yoxla" düyməsindən sonra yoxlaya bilər.
		c.JSON(200, gin.H{"success": true, "submission_id": sub.ID, "graded": false})
		return
	}

	c.JSON(200, gin.H{"success": true, "submission_id": sub.ID, "graded": true, "percentage": pct, "late": late})
}

const lateGrace = 20 // saniye — sebeke gecikmesi ucun

// examRemaining - qalan saniye (menfi = kecib). limited=false: vaxt limiti yoxdur.
func examRemaining(exam Exam, sub ExamSubmission) (int, bool) {
	if exam.DurationMin <= 0 || sub.StartedAt == nil {
		return 0, false
	}
	deadline := sub.StartedAt.Add(time.Duration(exam.DurationMin) * time.Minute)
	return int(time.Until(deadline).Seconds()), true
}

func remainingOrNeg(exam Exam, sub ExamSubmission) interface{} {
	if left, ok := examRemaining(exam, sub); ok {
		return left
	}
	return nil
}

// closeExam - vaxti bitmis isi avtomatik gonderir ve yoxlayir.
func (h *Handler) closeExam(db *gorm.DB, sub *ExamSubmission) {
	now := time.Now()
	db.Model(&ExamSubmission{}).Where("id = ? AND status = ?", sub.ID, "in_progress").
		Updates(map[string]interface{}{"status": "submitted", "submitted_at": &now})
	gradeSubmission(db, sub.ID, 0)
	db.First(sub, sub.ID)
}

func shuffleQuestions(qs []Question, seed uint) {
	// sabit (submission-a gore) qarisdirma — yenilenende sira deyismesin
	s := uint64(seed)*2654435761 + 1
	for i := len(qs) - 1; i > 0; i-- {
		s = s*6364136223846793005 + 1442695040888963407
		j := int((s >> 33) % uint64(i+1))
		qs[i], qs[j] = qs[j], qs[i]
	}
}

// SaveExamProgress - cavablari yazir (avto-saxlama). Vaxt bitibse redd edir.
// POST /sf/exams/:id/save {answers:[...]}
func (h *Handler) SaveExamProgress(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	studentID := currentStudentID(c)
	var req struct {
		Answers []submitAnswerReq `json:"answers"`
	}
	if c.ShouldBindJSON(&req) != nil || studentID == 0 {
		c.JSON(400, gin.H{"error": "Yanlis sorgu"})
		return
	}
	var exam Exam
	if scopeExams(c, db.Model(&Exam{})).Where("id = ?", c.Param("id")).First(&exam).Error != nil {
		c.JSON(404, gin.H{"error": "Imtahan tapilmadi"})
		return
	}
	var sub ExamSubmission
	if db.Where("exam_id = ? AND student_id = ?", exam.ID, studentID).First(&sub).Error != nil || sub.Status != "in_progress" {
		c.JSON(400, gin.H{"error": "Imtahan aktiv deyil"})
		return
	}
	if left, limited := examRemaining(exam, sub); limited && left <= 0 {
		c.JSON(410, gin.H{"error": "Vaxt bitib", "timed_out": true})
		return
	}
	var validIDs []uint
	db.Model(&Question{}).Where("exam_id = ?", exam.ID).Pluck("id", &validIDs)
	valid := map[uint]bool{}
	for _, id := range validIDs {
		valid[id] = true
	}
	for _, a := range req.Answers {
		if !valid[a.QuestionID] {
			continue
		}
		var ex Answer
		if db.Where("submission_id = ? AND question_id = ?", sub.ID, a.QuestionID).First(&ex).Error == nil {
			db.Model(&ex).Update("value", a.Value)
		} else {
			db.Create(&Answer{SubmissionID: sub.ID, QuestionID: a.QuestionID, Value: a.Value})
		}
	}
	left, _ := examRemaining(exam, sub)
	c.JSON(200, gin.H{"saved": true, "remaining_seconds": left})
}
