package educationcenter

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"educationcenter/internal/security"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// HESAB TƏHLÜKƏSİZLİYİ
//   - parolun e-poçtla bərpası (bir dəfəlik, 60 dəqiqəlik link)
//   - uğursuz girişlərdən sonra müvəqqəti blok
//   - parol dəyişəndə / "hər yerdən çıx" deyəndə köhnə sessiyalar bağlanır
//   - profil: ad, telefon, e-poçt bildirişləri
// ============================================================

// PasswordReset - parol bərpası linki. Linkin özü yox, yalnız sha256-sı saxlanılır.
type PasswordReset struct {
	ID        uint       `gorm:"primaryKey"`
	CreatedAt time.Time  `gorm:"index"`
	UserID    uint       `gorm:"index;not null"`
	TokenHash string     `gorm:"size:64;uniqueIndex;not null"`
	ExpiresAt time.Time  `gorm:"not null"`
	UsedAt    *time.Time `gorm:"index"`
	IP        string     `gorm:"size:64"`
}

func (PasswordReset) TableName() string { return "edu_password_resets" }

const (
	resetTTL       = 60 * time.Minute
	minPasswordLen = 8
)

// passwordProblem - yeni parol qaydaları; problem yoxdursa "".
func passwordProblem(p string) string {
	if len([]rune(p)) < minPasswordLen {
		return fmt.Sprintf("Parol ən azı %d simvol olmalıdır", minPasswordLen)
	}
	if len(p) > 128 {
		return "Parol çox uzundur"
	}
	return ""
}

func hashToken(t string) string {
	s := sha256.Sum256([]byte(t))
	return hex.EncodeToString(s[:])
}

// siteURL - istifadəçinin açdığı ünvan (linklər həmin domenə aparsın).
func siteURL(c *gin.Context) string { return "https://" + requestHost(c) }

// ---------- uğursuz cəhdlərin sayğacı ----------

type attempts struct {
	count       int
	first       time.Time
	lockedUntil time.Time
}

type limiter struct {
	mu     sync.Mutex
	m      map[string]*attempts
	max    int
	window time.Duration
	lock   time.Duration
}

func newLimiter(max int, window, lock time.Duration) *limiter {
	return &limiter{m: map[string]*attempts{}, max: max, window: window, lock: lock}
}

func (l *limiter) entry(key string, now time.Time) *attempts {
	if len(l.m) > 20000 { // yaddaş böyüməsin: köhnələri at
		for k, a := range l.m {
			if now.Sub(a.first) > l.window && now.After(a.lockedUntil) {
				delete(l.m, k)
			}
		}
	}
	a := l.m[key]
	if a == nil || (now.Sub(a.first) > l.window && now.After(a.lockedUntil)) {
		a = &attempts{first: now}
		l.m[key] = a
	}
	return a
}

// blocked - blok hələ nə qədər davam edir (0: blok yoxdur).
func (l *limiter) blocked(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.m[key]
	if a == nil {
		return 0
	}
	if d := time.Until(a.lockedUntil); d > 0 {
		return d
	}
	return 0
}

// fail - bir uğursuz cəhd; həddi keçəndə blok başlayır.
func (l *limiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	a := l.entry(key, now)
	a.count++
	if a.count >= l.max {
		a.lockedUntil = now.Add(l.lock)
		a.count = 0
		a.first = now
	}
}

// allow - hər çağırış sayılır; həddi keçibsə false.
func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	a := l.entry(key, now)
	a.count++
	return a.count <= l.max
}

func (l *limiter) reset(key string) {
	l.mu.Lock()
	delete(l.m, key)
	l.mu.Unlock()
}

var (
	loginByAccount = newLimiter(5, 15*time.Minute, 15*time.Minute)
	loginByIP      = newLimiter(40, 15*time.Minute, 15*time.Minute)
	forgotByEmail  = newLimiter(3, time.Hour, time.Hour)
	forgotByIP     = newLimiter(20, time.Hour, time.Hour)
	registerByIP   = newLimiter(60, time.Hour, time.Hour)
)

func accountKey(c *gin.Context, email string) string {
	return fmt.Sprintf("%d:%s", c.MustGet("tenantID").(uint), email)
}

func lockedMessage(d time.Duration) string {
	min := int(d.Minutes()) + 1
	return fmt.Sprintf("Çox sayda uğursuz cəhd oldu. %d dəqiqə sonra yenidən yoxlayın və ya \"Parolu unutmusunuz?\" ilə parolu bərpa edin.", min)
}

// sessionRevoked - token bu istifadəçinin sessiyaları bağlanandan əvvəl verilibmi.
func sessionRevoked(validFrom *time.Time, claims *Claims) bool {
	if validFrom == nil {
		return false
	}
	if claims.IssuedAt == nil {
		return true
	}
	return claims.IssuedAt.Time.Before(validFrom.Truncate(time.Second))
}

// ============================================================
// PAROLUN BƏRPASI (public)
// ============================================================

// POST /auth/forgot-password {email}
// Cavab həmişə eynidir: belə e-poçtun olub-olmadığı bilinməsin.
func (h *Handler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	c.ShouldBindJSON(&req)
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") {
		c.JSON(400, gin.H{"error": "E-poçt ünvanını yazın"})
		return
	}
	if !forgotByIP.allow(c.ClientIP()) {
		c.JSON(429, gin.H{"error": "Çox sayda sorğu göndərildi. Bir az sonra yenidən yoxlayın."})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	ready := MailFor(tenantOf(db)).Ready()
	done := func() {
		c.JSON(200, gin.H{"success": true, "mail_ready": ready})
	}
	if !forgotByEmail.allow(accountKey(c, email)) {
		done()
		return
	}
	var u EduUser
	if db.Where("LOWER(email) = ? AND is_active = ?", email, true).First(&u).Error != nil {
		done()
		return
	}
	now := time.Now()
	db.Model(&PasswordReset{}).Where("user_id = ? AND used_at IS NULL", u.ID).Update("used_at", now)
	token := GenerateSetupToken()
	if db.Create(&PasswordReset{UserID: u.ID, TokenHash: hashToken(token), ExpiresAt: now.Add(resetTTL), IP: c.ClientIP()}).Error != nil {
		c.JSON(500, gin.H{"error": "Bərpa linki yaradılmadı"})
		return
	}
	sendTemplate(db, "password_reset", u.Email, &u.ID, map[string]string{
		"name": firstNonEmpty(u.DisplayName, u.Name), "email": u.Email,
		"link": siteURL(c) + "/reset-password?token=" + token, "minutes": fmt.Sprint(int(resetTTL.Minutes())),
	})
	auditAs(c, db, &u.ID, u.Email, "password_reset_requested", "users", &u.ID, "")
	done()
}

func (h *Handler) findReset(db *gorm.DB, token string) (*PasswordReset, *EduUser, string) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, "Link etibarsızdır"
	}
	var r PasswordReset
	if db.Where("token_hash = ?", hashToken(token)).First(&r).Error != nil {
		return nil, nil, "Link etibarsızdır"
	}
	if r.UsedAt != nil {
		return nil, nil, "Bu link artıq istifadə olunub — yenisini istəyin"
	}
	if time.Now().After(r.ExpiresAt) {
		return nil, nil, "Linkin vaxtı keçib — yenisini istəyin"
	}
	var u EduUser
	if db.Where("id = ? AND is_active = ?", r.UserID, true).First(&u).Error != nil {
		return nil, nil, "Link etibarsızdır"
	}
	return &r, &u, ""
}

// GET /auth/reset-password?token=
func (h *Handler) VerifyResetToken(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	_, u, msg := h.findReset(db, c.Query("token"))
	if msg != "" {
		c.JSON(400, gin.H{"valid": false, "error": msg})
		return
	}
	c.JSON(200, gin.H{"valid": true, "email": u.Email, "name": firstNonEmpty(u.DisplayName, u.Name)})
}

// POST /auth/reset-password {token, password}
func (h *Handler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	c.ShouldBindJSON(&req)
	if p := passwordProblem(req.Password); p != "" {
		c.JSON(400, gin.H{"error": p})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	r, u, msg := h.findReset(db, req.Token)
	if msg != "" {
		c.JSON(400, gin.H{"error": msg})
		return
	}
	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "Parol hazırlanarkən xəta"})
		return
	}
	now := time.Now()
	err = db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&PasswordReset{}).Where("id = ? AND used_at IS NULL", r.ID).Update("used_at", now)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("Bu link artıq istifadə olunub — yenisini istəyin")
		}
		tx.Model(&PasswordReset{}).Where("user_id = ? AND used_at IS NULL", u.ID).Update("used_at", now)
		return tx.Model(&EduUser{}).Where("id = ?", u.ID).Updates(map[string]interface{}{
			"password_hash": hash, "sessions_valid_from": now, "setup_token": "", "setup_token_expiry": nil,
		}).Error
	})
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	loginByAccount.reset(accountKey(c, strings.ToLower(u.Email)))
	sendTemplate(db, "password_changed", u.Email, &u.ID, map[string]string{"name": firstNonEmpty(u.DisplayName, u.Name)})
	auditAs(c, db, &u.ID, u.Email, "password_reset", "users", &u.ID, "")
	c.JSON(200, gin.H{"success": true, "email": u.Email})
}

// sendResetLink - admin / super admin istifadəçiyə bərpa linki göndərir.
func sendResetLink(db *gorm.DB, u *EduUser, base, ip string) string {
	now := time.Now()
	db.Model(&PasswordReset{}).Where("user_id = ? AND used_at IS NULL", u.ID).Update("used_at", now)
	token := GenerateSetupToken()
	if db.Create(&PasswordReset{UserID: u.ID, TokenHash: hashToken(token), ExpiresAt: now.Add(24 * time.Hour), IP: ip}).Error != nil {
		return "failed"
	}
	return sendTemplate(db, "password_reset", u.Email, &u.ID, map[string]string{
		"name": firstNonEmpty(u.DisplayName, u.Name), "email": u.Email,
		"link": base + "/reset-password?token=" + token, "minutes": "1440",
	})
}

// POST /sf/users/:id/send-reset — admin istifadəçiyə parol bərpası linki göndərir (24 saat)
func (h *Handler) SendUserReset(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var u EduUser
	if db.First(&u, parseUint(c.Param("id"))).Error != nil {
		c.JSON(404, gin.H{"error": "İstifadəçi tapılmadı"})
		return
	}
	if !u.IsActive {
		c.JSON(400, gin.H{"error": "Hesab deaktivdir — əvvəlcə aktiv edin"})
		return
	}
	st := sendResetLink(db, &u, siteURL(c), c.ClientIP())
	audit(c, db, "password_reset_sent", "users", &u.ID, u.Email)
	switch st {
	case "queued":
		c.JSON(200, gin.H{"success": true, "email_status": st})
	case "not_configured":
		c.JSON(400, gin.H{"error": "Bu mərkəz üçün e-poçt göndərmə qurulmayıb"})
	case "disabled":
		c.JSON(400, gin.H{"error": "\"Parolun bərpası\" məktubu söndürülüb (E-poçt bölməsi)"})
	default:
		c.JSON(500, gin.H{"error": "Məktub göndərilmədi"})
	}
}

// ============================================================
// PROFİL (token ilə)
// ============================================================

// PUT /sf/auth/profile {name, display_name, phone, email_notifications}
func (h *Handler) UpdateProfile(c *gin.Context) {
	var req struct {
		Name               *string `json:"name"`
		DisplayName        *string `json:"display_name"`
		Phone              *string `json:"phone"`
		EmailNotifications *bool   `json:"email_notifications"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "Məlumat düzgün deyil"})
		return
	}
	patch := map[string]interface{}{}
	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" || len(n) > 255 {
			c.JSON(400, gin.H{"error": "Ad boş ola bilməz"})
			return
		}
		patch["name"] = n
	}
	if req.DisplayName != nil {
		patch["display_name"] = strings.TrimSpace(*req.DisplayName)
	}
	if req.Phone != nil {
		patch["phone"] = strings.TrimSpace(*req.Phone)
	}
	if req.EmailNotifications != nil {
		patch["email_notifications"] = *req.EmailNotifications
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	if len(patch) > 0 {
		if err := db.Model(&EduUser{}).Where("id = ?", currentUserID(c)).Updates(patch).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}
	var u EduUser
	if db.First(&u, currentUserID(c)).Error != nil {
		c.JSON(404, gin.H{"error": "İstifadəçi tapılmadı"})
		return
	}
	c.JSON(200, h.userInfo(db, &u))
}

// POST /sf/auth/logout-all — bütün cihazlardakı sessiyalar bağlanır, bu cihaz yeni token alır
func (h *Handler) LogoutAll(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var u EduUser
	if db.First(&u, currentUserID(c)).Error != nil {
		c.JSON(404, gin.H{"error": "İstifadəçi tapılmadı"})
		return
	}
	now := time.Now()
	db.Model(&u).Update("sessions_valid_from", now)
	u.SessionsValidFrom = &now
	audit(c, db, "logout_all", "users", &u.ID, "")
	tok, err := issueToken(&u)
	if err != nil {
		c.JSON(500, gin.H{"error": "Token yaradıla bilmədi"})
		return
	}
	c.JSON(200, gin.H{"success": true, "token": tok})
}
