package educationcenter

import (
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ============================================================
// DEFAULT LOOKUPS — a new centre starts with these (Seed).
// Called again it leaves existing rows alone (fills empty tables only).
// ============================================================

// Seed fills the empty lookup tables of a new centre.
func Seed(db *gorm.DB) map[string]int {
	return map[string]int{
		"skills":       seedSkills(db),
		"levels":       seedLevels(db),
		"achievements": seedAchievements(db),
		"settings":     seedSettings(db),
	}
}

func seedSkills(db *gorm.DB) int {
	var n int64
	db.Model(&Skill{}).Count(&n)
	if n > 0 {
		return 0
	}

	items := []Skill{
		{Name: "Dinləmə", Code: "listening", SortOrder: 1, IsActive: true},
		{Name: "Oxu", Code: "reading", SortOrder: 2, IsActive: true},
		{Name: "Yazı", Code: "writing", SortOrder: 3, IsActive: true},
		{Name: "Danışıq", Code: "speaking", SortOrder: 4, IsActive: true},
	}
	if db.Create(&items).Error != nil {
		return 0
	}
	return len(items)
}

func seedLevels(db *gorm.DB) int {
	var n int64
	db.Model(&Level{}).Count(&n)
	if n > 0 {
		return 0
	}

	items := []Level{
		{Name: "A1", Title: "Başlanğıc", MinScore: 0, MaxScore: 40, SortOrder: 1, IsActive: true},
		{Name: "A2", Title: "Elementar", MinScore: 41, MaxScore: 55, SortOrder: 2, IsActive: true},
		{Name: "B1", Title: "Orta", MinScore: 56, MaxScore: 70, SortOrder: 3, IsActive: true},
		{Name: "B2", Title: "Ortadan yuxarı", MinScore: 71, MaxScore: 85, SortOrder: 4, IsActive: true},
		{Name: "C1", Title: "Qabaqcıl", MinScore: 86, MaxScore: 100, SortOrder: 5, IsActive: true},
	}
	if db.Create(&items).Error != nil {
		return 0
	}
	return len(items)
}

func seedAchievements(db *gorm.DB) int {
	var n int64
	db.Model(&Achievement{}).Count(&n)
	if n > 0 {
		return 0
	}

	items := []Achievement{
		{Code: "first_exam", Title: "İlk imtahan", Description: "İlk imtahanını tamamladın", Icon: "🏆", XPReward: 50, SortOrder: 1, IsActive: true},
		{Code: "perfect_attendance", Title: "100% davamiyyət", Description: "Bir ay ərzində heç bir dərsi buraxmadın", Icon: "✅", XPReward: 100, SortOrder: 2, IsActive: true},
		{Code: "streak_7", Title: "7 gün ardıcıllıq", Description: "7 gün ardıcıl aktiv oldun", Icon: "🔥", XPReward: 70, SortOrder: 3, IsActive: true},
		{Code: "all_assignments", Title: "Tapşırıq ustası", Description: "Bütün tapşırıqları vaxtında təhvil verdin", Icon: "📋", XPReward: 80, SortOrder: 4, IsActive: true},
	}
	if db.Create(&items).Error != nil {
		return 0
	}
	return len(items)
}

func seedSettings(db *gorm.DB) int {
	var n int64
	db.Model(&Setting{}).Count(&n)
	if n > 0 {
		return 0
	}

	items := []Setting{
		{Key: "center_name", Label: "Mərkəzin adı", GroupName: "general", IsPublic: true, Value: datatypes.JSON([]byte(`""`))},
		{Key: "default_currency", Label: "Valyuta", GroupName: "finance", IsPublic: true, Value: datatypes.JSON([]byte(`"AZN"`))},
		{Key: "attendance_alert_after", Label: "Ardıcıl qayıb xəbərdarlığı", GroupName: "academic", Value: datatypes.JSON([]byte(`2`))},
		{Key: "grading_deadline_hours", Label: "Yoxlama müddəti (saat)", GroupName: "academic", Value: datatypes.JSON([]byte(`48`))},
		{Key: "invoice_due_day", Label: "Ödəniş günü", GroupName: "finance", Value: datatypes.JSON([]byte(`1`))},
	}
	if db.Create(&items).Error != nil {
		return 0
	}
	return len(items)
}
