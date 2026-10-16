package educationcenter

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// HOOK-LAR
//
// Generic CRUD "necə yazılır" sualına cavab verir; bu fayl isə
// "yazılmasına icazə varmı" sualına. Tədris mərkəzinin real
// qaydaları burada tətbiq olunur:
//
//   · qrup tutumundan artıq şagird yazılmır
//   · eyni şagird eyni qrupa iki dəfə yazılmır
//   · eyni otaq / eyni müəllim eyni vaxtda iki yerdə olmur
//   · bir şagirdin yalnız bir "əsas" valideyni olur
//   · ismarıcın göndərəni serverdə təyin olunur (saxtalaşdırıla bilməz)
//
// Bu yoxlamalar interfeysə yox, API-yə qoyulub — hansı ekrandan
// gəlməsindən asılı olmayaraq işləyir.
// ============================================================

// ---------- Vaxt köməkçiləri ----------

// validTime - "HH:MM" formatını yoxlayır.
func validTime(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	_, err := time.Parse("15:04", s)
	return err == nil
}

// overlaps - iki vaxt aralığı kəsişirmi ("HH:MM" leksik müqayisə ilə işləyir)
func overlaps(aStart, aEnd, bStart, bEnd string) bool {
	return aStart < bEnd && aEnd > bStart
}

// ---------- Qrupa yazılma ----------

func beforeCreateEnrollment(c *gin.Context, db *gorm.DB, m *Enrollment) error {
	if m.StudentID == 0 || m.GroupID == 0 {
		return errors.New("Şagird və qrup seçilməlidir")
	}

	if m.JoinedAt.IsZero() {
		m.JoinedAt = time.Now()
	}
	if m.Status == "" {
		m.Status = "active"
	}

	// Eyni qrupa təkrar aktiv yazılma
	var dup int64
	db.Model(&Enrollment{}).
		Where("student_id = ? AND group_id = ? AND status = ?", m.StudentID, m.GroupID, "active").
		Count(&dup)
	if dup > 0 {
		return errors.New("Bu şagird həmin qrupa artıq yazılıb")
	}

	var group Group
	if err := db.First(&group, m.GroupID).Error; err != nil {
		return errors.New("Qrup tapılmadı")
	}
	if group.IsArchived {
		return errors.New("Arxivlənmiş qrupa şagird yazmaq olmaz")
	}

	// Tutum nəzarəti (0 = limitsiz)
	if group.Capacity > 0 && m.Status == "active" {
		var current int64
		db.Model(&Enrollment{}).
			Where("group_id = ? AND status = ?", m.GroupID, "active").
			Count(&current)
		if current >= int64(group.Capacity) {
			return fmt.Errorf("Qrupun tutumu doludur (%d/%d)", current, group.Capacity)
		}
	}

	var student Student
	if err := db.First(&student, m.StudentID).Error; err != nil {
		return errors.New("Şagird tapılmadı")
	}
	if student.IsArchived {
		return errors.New("Arxivlənmiş şagirdi qrupa yazmaq olmaz")
	}

	return nil
}

// ---------- Şagird ↔ valideyn ----------

func beforeCreateStudentGuardian(c *gin.Context, db *gorm.DB, m *StudentGuardian) error {
	if m.StudentID == 0 || m.GuardianID == 0 {
		return errors.New("Şagird və valideyn seçilməlidir")
	}

	var dup int64
	db.Model(&StudentGuardian{}).
		Where("student_id = ? AND guardian_id = ?", m.StudentID, m.GuardianID).
		Count(&dup)
	if dup > 0 {
		return errors.New("Bu valideyn həmin şagirdə artıq bağlanıb")
	}

	if err := db.First(&Student{}, m.StudentID).Error; err != nil {
		return errors.New("Şagird tapılmadı")
	}
	if err := db.First(&Guardian{}, m.GuardianID).Error; err != nil {
		return errors.New("Valideyn tapılmadı")
	}

	// İlk bağlanan valideyn avtomatik əsas əlaqə olur
	var existing int64
	db.Model(&StudentGuardian{}).Where("student_id = ?", m.StudentID).Count(&existing)
	if existing == 0 {
		m.IsPrimary = true
	}

	return nil
}

// onlyOnePrimary - bir şagirdin yalnız bir əsas əlaqəsi olur.
func onlyOnePrimary(db *gorm.DB, m *StudentGuardian) error {
	if !m.IsPrimary {
		return nil
	}
	return db.Model(&StudentGuardian{}).
		Where("student_id = ? AND id <> ?", m.StudentID, m.ID).
		Update("is_primary", false).Error
}

func afterCreateStudentGuardian(c *gin.Context, db *gorm.DB, m *StudentGuardian) error {
	return onlyOnePrimary(db, m)
}

func afterUpdateStudentGuardian(c *gin.Context, db *gorm.DB, m *StudentGuardian) error {
	return onlyOnePrimary(db, m)
}

// ---------- Müəllim ↔ fənn ----------

func beforeCreateTeacherSubject(c *gin.Context, db *gorm.DB, m *TeacherSubject) error {
	if m.TeacherID == 0 || m.SubjectID == 0 {
		return errors.New("Müəllim və fənn seçilməlidir")
	}
	var dup int64
	db.Model(&TeacherSubject{}).
		Where("teacher_id = ? AND subject_id = ?", m.TeacherID, m.SubjectID).
		Count(&dup)
	if dup > 0 {
		return errors.New("Bu fənn həmin müəllimə artıq təyin olunub")
	}
	return nil
}

// ---------- Cədvəl münaqişəsi ----------

// checkSlotConflict - eyni gün / kəsişən saat üzrə otaq, müəllim və
// qrup münaqişəsini yoxlayır. excludeID > 0 olduqda öz sətrini nəzərə almır.
func checkSlotConflict(db *gorm.DB, s *ScheduleSlot, excludeID uint) error {
	if !validTime(s.StartTime) || !validTime(s.EndTime) {
		return errors.New("Saat formatı düzgün deyil (HH:MM)")
	}
	if s.StartTime >= s.EndTime {
		return errors.New("Bitmə saatı başlama saatından sonra olmalıdır")
	}
	if s.Weekday < 1 || s.Weekday > 7 {
		return errors.New("Həftənin günü 1–7 aralığında olmalıdır")
	}

	var candidates []ScheduleSlot
	q := db.Model(&ScheduleSlot{}).Where("weekday = ? AND is_active = ?", s.Weekday, true)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	q.Find(&candidates)

	for _, ex := range candidates {
		if !overlaps(s.StartTime, s.EndTime, ex.StartTime, ex.EndTime) {
			continue
		}
		if s.RoomID != nil && ex.RoomID != nil && *s.RoomID == *ex.RoomID {
			var room Room
			db.First(&room, *s.RoomID)
			return fmt.Errorf("Otaq münaqişəsi: %s otağı %s–%s aralığında artıq doludur", room.Name, ex.StartTime, ex.EndTime)
		}
		if s.TeacherID != nil && ex.TeacherID != nil && *s.TeacherID == *ex.TeacherID {
			var t Teacher
			db.First(&t, *s.TeacherID)
			return fmt.Errorf("Müəllim münaqişəsi: %s həmin vaxtda (%s–%s) başqa dərsdədir", t.Name, ex.StartTime, ex.EndTime)
		}
		if s.GroupID == ex.GroupID {
			return fmt.Errorf("Qrup münaqişəsi: bu qrupun %s–%s aralığında artıq dərsi var", ex.StartTime, ex.EndTime)
		}
	}

	return nil
}

func beforeCreateScheduleSlot(c *gin.Context, db *gorm.DB, m *ScheduleSlot) error {
	if m.GroupID == 0 {
		return errors.New("Qrup seçilməlidir")
	}
	// Qrupun müəllimi / otağı verilməyibsə qrupdan götürülür
	var group Group
	if err := db.First(&group, m.GroupID).Error; err != nil {
		return errors.New("Qrup tapılmadı")
	}
	if m.TeacherID == nil {
		m.TeacherID = group.TeacherID
	}
	if m.RoomID == nil {
		m.RoomID = group.RoomID
	}
	if m.BranchID == nil {
		m.BranchID = group.BranchID
	}
	m.IsActive = true

	return checkSlotConflict(db, m, 0)
}

func beforeUpdateScheduleSlot(c *gin.Context, db *gorm.DB, m *ScheduleSlot, patch map[string]interface{}) error {
	merged := *m
	if v, ok := patch["start_time"].(string); ok {
		merged.StartTime = v
	}
	if v, ok := patch["end_time"].(string); ok {
		merged.EndTime = v
	}
	if v, ok := patch["weekday"].(float64); ok {
		merged.Weekday = int(v)
	}
	if v, ok := patch["room_id"].(float64); ok {
		id := uint(v)
		merged.RoomID = &id
	}
	if v, ok := patch["teacher_id"].(float64); ok {
		id := uint(v)
		merged.TeacherID = &id
	}
	if v, ok := patch["group_id"].(float64); ok {
		merged.GroupID = uint(v)
	}
	if v, ok := patch["is_active"].(bool); ok && !v {
		// Deaktiv edilən sətir münaqişə yaratmır
		return nil
	}
	return checkSlotConflict(db, &merged, m.ID)
}

// ---------- Müəllimin boş saatları ----------

func beforeCreateAvailability(c *gin.Context, db *gorm.DB, m *TeacherAvailability) error {
	if !validTime(m.StartTime) || !validTime(m.EndTime) {
		return errors.New("Saat formatı düzgün deyil (HH:MM)")
	}
	if m.StartTime >= m.EndTime {
		return errors.New("Bitmə saatı başlama saatından sonra olmalıdır")
	}
	// Müəllim öz adından yazır — kənar müəllimin qrafikinə yazmaq olmaz
	if currentRole(c) == RoleTeacher {
		tid := currentTeacherID(c)
		if tid == 0 {
			return errors.New("Hesabınız müəllim profilinə bağlı deyil")
		}
		m.TeacherID = tid
	}
	if m.TeacherID == 0 {
		return errors.New("Müəllim seçilməlidir")
	}
	return nil
}

// ---------- İsmarıclar ----------

func beforeCreateMessage(c *gin.Context, db *gorm.DB, m *Message) error {
	uid := currentUserID(c)
	if uid == 0 {
		return errors.New("Sessiya tapılmadı")
	}
	// Göndərən HƏMİŞƏ serverdə təyin olunur — sorğu ilə dəyişdirilə bilməz
	m.FromUserID = uid

	if m.ToUserID == 0 {
		return errors.New("Alıcı seçilməlidir")
	}
	if m.ToUserID == uid {
		return errors.New("Özünüzə ismarıc göndərə bilməzsiniz")
	}

	var to EduUser
	if err := db.Where("id = ? AND is_active = ?", m.ToUserID, true).First(&to).Error; err != nil {
		return errors.New("Alıcı tapılmadı")
	}
	if strings.TrimSpace(m.Body) == "" {
		return errors.New("İsmarıc mətni boş ola bilməz")
	}
	m.IsRead = false
	return nil
}

// afterCreateMessage - alıcıya bildiriş düşür ki, panelə girməsə də xəbəri olsun.
func afterCreateMessage(c *gin.Context, db *gorm.DB, m *Message) error {
	subject := m.Subject
	if subject == "" {
		subject = "Yeni ismarıc"
	}
	pushNotification(db, m.ToUserID, "message", subject, trimTo(m.Body, 160), "", "message", &m.ID, "normal")
	return nil
}

// ---------- Qaimələr ----------

func beforeCreateInvoice(c *gin.Context, db *gorm.DB, m *Invoice) error {
	if m.StudentID == 0 {
		return errors.New("Şagird seçilməlidir")
	}
	if m.Amount <= 0 {
		return errors.New("Məbləğ sıfırdan böyük olmalıdır")
	}
	if m.Currency == "" {
		m.Currency = defaultCurrency(db)
	}
	if m.Number == "" {
		m.Number = nextInvoiceNumber(db)
	}
	if m.Status == "" {
		m.Status = "pending"
	}
	return nil
}

func afterUpdateInvoice(c *gin.Context, db *gorm.DB, m *Invoice) error {
	// Tam ödənilibsə status avtomatik düzəlsin — əl ilə unudulmasın
	if m.PaidAmount >= m.Amount && m.Amount > 0 && m.Status != "paid" && m.Status != "cancelled" {
		now := time.Now()
		db.Model(&Invoice{}).Where("id = ?", m.ID).Updates(map[string]interface{}{
			"status":  "paid",
			"paid_at": &now,
		})
		return nil
	}
	if m.PaidAmount > 0 && m.PaidAmount < m.Amount && m.Status == "pending" {
		db.Model(&Invoice{}).Where("id = ?", m.ID).Update("status", "partial")
	}
	return nil
}

// ---------- Şagird ----------

func beforeCreateStudent(c *gin.Context, db *gorm.DB, m *Student) error {
	if strings.TrimSpace(m.Name) == "" {
		return errors.New("Ad Soyad tələb olunur")
	}
	if m.Status == "" {
		m.Status = "active"
	}
	if m.EnrolledAt == nil {
		m.EnrolledAt = nowPtr()
	}
	if m.Code == "" {
		m.Code = nextStudentCode(db)
	}
	return nil
}

// ---------- İmtahan ----------

func beforeCreateExam(c *gin.Context, db *gorm.DB, m *Exam) error {
	if m.Status == "" {
		m.Status = "draft"
	}
	// Müəllim yaradırsa imtahan ona bağlanır
	if currentRole(c) == RoleTeacher && m.TeacherID == nil {
		tid := currentTeacherID(c)
		if tid != 0 {
			m.TeacherID = &tid
		}
	}
	return nil
}

func beforeUpdateExam(c *gin.Context, db *gorm.DB, m *Exam, patch map[string]interface{}) error {
	// Dərc etmək üçün ən azı bir sual olmalıdır — boş imtahan şagirdə düşməsin
	if v, ok := patch["status"].(string); ok && v == "published" {
		var n int64
		db.Model(&Question{}).Where("exam_id = ?", m.ID).Count(&n)
		if n == 0 {
			return errors.New("Sualı olmayan imtahan dərc oluna bilməz")
		}
	}
	return nil
}

// ---------- XP ----------

func beforeCreateXP(c *gin.Context, db *gorm.DB, m *XPEvent) error {
	if m.StudentID == 0 {
		return errors.New("Şagird seçilməlidir")
	}
	if m.Source == "" {
		m.Source = "manual"
	}
	return nil
}
