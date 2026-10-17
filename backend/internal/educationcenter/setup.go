package educationcenter

import (
	"errors"
	"strings"
	"time"

	"educationcenter/internal/security"
	"gorm.io/gorm"
)

// ============================================================
// A CENTRE'S DATABASE
// Prepare brings it up to date, Seed (handlers.go) fills the default
// lookups, CreateAdmin opens admin accounts.
// The super admin panel uses these when it creates a centre.
// ============================================================

// Prepare brings a centre's database up to date. A database copied from an
// older installation keeps its users: their project_id column becomes
// tenant_id, and every account is marked as this centre's.
func Prepare(db *gorm.DB, tenantID uint) error {
	m := db.Migrator()
	if m.HasTable(&EduUser{}) && m.HasColumn(&EduUser{}, "project_id") && !m.HasColumn(&EduUser{}, "tenant_id") {
		if err := m.RenameColumn(&EduUser{}, "project_id", "tenant_id"); err != nil {
			return err
		}
	}
	if err := db.AutoMigrate(Models()...); err != nil {
		return err
	}
	return db.Unscoped().Model(&EduUser{}).Where("tenant_id <> ?", tenantID).UpdateColumn("tenant_id", tenantID).Error
}

// CreateAdmin opens an admin account in the centre (the super admin panel's "Admin əlavə et").
func CreateAdmin(db *gorm.DB, tenantID uint, name, email, password string) (*EduUser, error) {
	name, email = strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || passwordProblem(password) != "" {
		return nil, errors.New("ad, e-poçt və ən azı 8 simvolluq parol lazımdır")
	}
	var n int64
	db.Model(&EduUser{}).Where("LOWER(email) = ?", email).Count(&n)
	if n > 0 {
		return nil, errors.New("bu e-poçtla istifadəçi artıq var — parolunu \"Parol\" düyməsi ilə dəyişin")
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		return nil, err
	}
	u := EduUser{Name: name, Email: email, PasswordHash: hash, Role: RoleAdmin, RoleChosen: true, IsActive: true, TenantID: tenantID}
	if err := db.Create(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// Status is what the super admin panel shows for a centre.
func Status(db *gorm.DB) map[string]int64 {
	counts := map[string]int64{}
	if !db.Migrator().HasTable(&EduUser{}) {
		return counts
	}
	for name, model := range map[string]interface{}{
		"users": &EduUser{}, "admins": nil, "branches": &Branch{}, "teachers": &Teacher{}, "students": &Student{}, "groups": &Group{},
	} {
		var n int64
		if model == nil {
			db.Model(&EduUser{}).Where("role = ?", RoleAdmin).Count(&n)
		} else {
			db.Model(model).Count(&n)
		}
		counts[name] = n
	}
	return counts
}

// SetPassword gives a centre user a new password (the super admin's "reset password").
func SetPassword(db *gorm.DB, email, password string) error {
	if p := passwordProblem(password); p != "" {
		return errors.New(p)
	}
	var u EduUser
	if db.Where("LOWER(email) = ?", strings.ToLower(strings.TrimSpace(email))).First(&u).Error != nil {
		return errors.New("bu e-poçtla istifadəçi yoxdur")
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		return err
	}
	return db.Model(&u).Updates(map[string]interface{}{"password_hash": hash, "is_active": true, "sessions_valid_from": time.Now()}).Error
}
