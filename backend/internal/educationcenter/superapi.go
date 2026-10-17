package educationcenter

import (
	"errors"
	"strings"

	"gorm.io/gorm"
)

// ============================================================
// SUPER ADMIN PANELİ ÜÇÜN — bir mərkəzin istifadəçiləri, məktubları, auditi
// ============================================================

// UserRow - super paneldə istifadəçi sətri.
type UserRow struct {
	ID        uint    `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	Role      string  `json:"role"`
	Status    string  `json:"status"`
	IsActive  bool    `json:"is_active"`
	LastLogin *string `json:"last_login"`
	CreatedAt string  `json:"created_at"`
}

// Users - mərkəzin istifadəçiləri (axtarış: ad / e-poçt), ən çox 300.
func Users(db *gorm.DB, q, role string) []UserRow {
	tx := db.Model(&EduUser{}).Order("role = 'admin' DESC, name ASC").Limit(300)
	if s := strings.TrimSpace(q); s != "" {
		tx = tx.Where("name ILIKE ? OR email ILIKE ?", "%"+s+"%", "%"+s+"%")
	}
	if role != "" {
		tx = tx.Where("role = ?", role)
	}
	var us []EduUser
	tx.Find(&us)
	out := make([]UserRow, 0, len(us))
	for _, u := range us {
		r := UserRow{ID: u.ID, Name: u.Name, Email: u.Email, Role: u.Role, Status: userStatus(&u), IsActive: u.IsActive, CreatedAt: u.CreatedAt.Format("2006-01-02")}
		if u.LastLogin != nil {
			t := u.LastLogin.Format("2006-01-02 15:04")
			r.LastLogin = &t
		}
		out = append(out, r)
	}
	return out
}

// SetActive - hesabı aktiv / deaktiv edir (deaktiv hesabın sessiyaları dərhal keçərsiz olur).
func SetActive(db *gorm.DB, userID uint, active bool) error {
	res := db.Model(&EduUser{}).Where("id = ?", userID).Update("is_active", active)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("istifadəçi tapılmadı")
	}
	return nil
}

// SendReset - istifadəçiyə parol bərpası linki (24 saat). base: https://mərkəzin-domeni
func SendReset(db *gorm.DB, tenantID, userID uint, base string) (string, error) {
	db = withTenant(db, tenantID)
	var u EduUser
	if db.First(&u, userID).Error != nil {
		return "", errors.New("istifadəçi tapılmadı")
	}
	if !u.IsActive {
		return "", errors.New("hesab deaktivdir — əvvəlcə aktiv edin")
	}
	if base == "" {
		return "", errors.New("mərkəzin domeni yoxdur")
	}
	switch st := sendResetLink(db, &u, base, ""); st {
	case "queued":
		return st, nil
	case "not_configured":
		return st, errors.New("bu mərkəz üçün SMTP qurulmayıb")
	case "disabled":
		return st, errors.New("mərkəzdə \"Parolun bərpası\" məktubu söndürülüb")
	default:
		return st, errors.New("məktub göndərilmədi")
	}
}

// MailLog - son məktublar.
func MailLog(db *gorm.DB, status string) []EmailLog {
	tx := db.Model(&EmailLog{}).Order("id DESC").Limit(200)
	if status != "" {
		tx = tx.Where("status = ?", status)
	}
	rows := []EmailLog{}
	if db.Migrator().HasTable(&EmailLog{}) {
		tx.Find(&rows)
	}
	return rows
}

// Audit - son hadisələr.
func Audit(db *gorm.DB, action, q string) []AuditLog {
	if !db.Migrator().HasTable(&AuditLog{}) {
		return []AuditLog{}
	}
	return auditRows(db, action, "", q, 0)
}
