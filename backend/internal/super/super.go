// Package super: the super admin panel's API — the people who make and run the centres.
package super

import (
	"fmt"
	"html"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"educationcenter/internal/educationcenter"
	"educationcenter/internal/security"
	"educationcenter/internal/tenant"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// Admin is a super admin.
type Admin struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:200" json:"name"`
	Email        string    `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

func (Admin) TableName() string { return "super_admins" }

const tokenTTL = 12 * time.Hour

func key() []byte { return security.Key("super-admin-token") }

// Setup makes the table and, while there is no super admin yet, the first one
// from SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD.
func Setup(db *gorm.DB) error {
	if err := db.AutoMigrate(&Admin{}); err != nil {
		return err
	}
	var n int64
	db.Model(&Admin{}).Count(&n)
	if n > 0 {
		return nil
	}
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SUPERADMIN_EMAIL")))
	pw := os.Getenv("SUPERADMIN_PASSWORD")
	if email == "" || len(pw) < 8 {
		log.Println("⚠️  no super admin yet: set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (8+ characters) and restart")
		return nil
	}
	hash, err := security.HashPassword(pw)
	if err != nil {
		return err
	}
	log.Printf("super admin %s created", email)
	return db.Create(&Admin{Name: "Super admin", Email: email, PasswordHash: hash}).Error
}

type handler struct{ store *tenant.Store }

// RegisterRoutes puts the panel's API under g. With SUPER_HOST set it answers only at that address.
func RegisterRoutes(g *gin.RouterGroup, store *tenant.Store) {
	h := &handler{store: store}
	if only := tenant.NormalizeHost(os.Getenv("SUPER_HOST")); only != "" {
		g.Use(func(c *gin.Context) {
			if tenant.RequestHost(c) != only {
				c.AbortWithStatusJSON(404, gin.H{"error": "not found"})
				return
			}
			c.Next()
		})
	}
	g.POST("/login", h.login)
	a := g.Group("")
	a.Use(h.auth)
	a.GET("/me", h.me)
	a.POST("/password", h.password)
	a.GET("/tenants", h.list)
	a.POST("/tenants", h.create)
	a.PUT("/tenants/:id", h.update)
	a.POST("/tenants/:id/admin", h.addAdmin)
	a.POST("/tenants/:id/password", h.setPassword)
	a.POST("/tenants/:id/test-mail", h.testMail)
	a.GET("/tenants/:id/users", h.users)
	a.PUT("/tenants/:id/users/:uid", h.userActive)
	a.POST("/tenants/:id/users/:uid/reset-link", h.userResetLink)
	a.GET("/tenants/:id/email-log", h.mailLog)
	a.GET("/tenants/:id/audit", h.audit)
	a.GET("/admins", h.admins)
	a.POST("/admins", h.addSuperAdmin)
	a.DELETE("/admins/:id", h.deleteSuperAdmin)
}

// ---------- girişin qorunması: bir e-poçta 5, bir IP-yə 20 səhv → 15 dəqiqə blok ----------

var (
	failMu sync.Mutex
	fails  = map[string][]time.Time{}
)

const failsSpan = 15 * time.Minute

func recentFails(key string, now time.Time) []time.Time {
	var keep []time.Time
	for _, t := range fails[key] {
		if now.Sub(t) < failsSpan {
			keep = append(keep, t)
		}
	}
	if len(keep) == 0 {
		delete(fails, key)
	} else {
		fails[key] = keep
	}
	return keep
}

func lockedFor(key string, maxFails int) time.Duration {
	failMu.Lock()
	defer failMu.Unlock()
	now := time.Now()
	f := recentFails(key, now)
	if len(f) < maxFails {
		return 0
	}
	return failsSpan - now.Sub(f[len(f)-maxFails])
}

func addFail(key string) {
	failMu.Lock()
	defer failMu.Unlock()
	if len(fails) > 10000 {
		fails = map[string][]time.Time{}
	}
	fails[key] = append(recentFails(key, time.Now()), time.Now())
}

func (h *handler) login(c *gin.Context) {
	var req struct{ Email, Password string }
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "E-poçt və parol lazımdır"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	for k, max := range map[string]int{"e:" + email: 5, "ip:" + c.ClientIP(): 20} {
		if d := lockedFor(k, max); d > 0 {
			c.JSON(429, gin.H{"error": fmt.Sprintf("Çox sayda uğursuz cəhd. %d dəqiqə sonra yenidən yoxlayın.", int(d.Minutes())+1)})
			return
		}
	}
	var a Admin
	if h.store.System.Where("email = ?", email).First(&a).Error != nil ||
		!security.CheckPassword(req.Password, a.PasswordHash) {
		addFail("e:" + email)
		addFail("ip:" + c.ClientIP())
		log.Printf("super admin login failed for %s from %s", email, c.ClientIP())
		c.JSON(401, gin.H{"error": "E-poçt və ya parol yanlışdır"})
		return
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.Itoa(int(a.ID)),
		Audience:  jwt.ClaimStrings{"super"},
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenTTL)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}).SignedString(key())
	if err != nil {
		c.JSON(500, gin.H{"error": "token"})
		return
	}
	c.JSON(200, gin.H{"token": tok, "admin": a})
}

func (h *handler) auth(c *gin.Context) {
	header := c.GetHeader("Authorization")
	claims := &jwt.RegisteredClaims{}
	ok := strings.HasPrefix(header, "Bearer ")
	if ok {
		t, err := jwt.ParseWithClaims(header[7:], claims, func(t *jwt.Token) (interface{}, error) { return key(), nil },
			jwt.WithValidMethods([]string{"HS256"}), jwt.WithAudience("super"))
		ok = err == nil && t.Valid
	}
	var a Admin
	if id, _ := strconv.Atoi(claims.Subject); !ok || h.store.System.First(&a, id).Error != nil {
		c.AbortWithStatusJSON(401, gin.H{"error": "Giriş lazımdır"})
		return
	}
	c.Set("admin", a)
	c.Next()
}

func (h *handler) me(c *gin.Context) { c.JSON(200, c.MustGet("admin")) }

func (h *handler) password(c *gin.Context) {
	a := c.MustGet("admin").(Admin)
	var req struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if c.ShouldBindJSON(&req) != nil || len(req.New) < 8 {
		c.JSON(400, gin.H{"error": "Yeni parol ən azı 8 simvol olmalıdır"})
		return
	}
	if !security.CheckPassword(req.Current, a.PasswordHash) {
		c.JSON(400, gin.H{"error": "Cari parol yanlışdır"})
		return
	}
	hash, err := security.HashPassword(req.New)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	h.store.System.Model(&a).Update("password_hash", hash)
	c.JSON(200, gin.H{"success": true})
}

type tenantView struct {
	tenant.Tenant
	Counts          map[string]int64 `json:"counts"`
	Error           string           `json:"error,omitempty"`
	SMTPPasswordSet bool             `json:"smtp_password_set"`
	MailSource      string           `json:"mail_source"` // own | server | none
}

func (h *handler) view(t tenant.Tenant) tenantView {
	v := tenantView{Tenant: t, SMTPPasswordSet: t.SMTPPassword != ""}
	switch {
	case t.SMTPHost != "":
		v.MailSource = "own"
	case educationcenter.MailFor(t.ID).Ready():
		v.MailSource = "server"
	default:
		v.MailSource = "none"
	}
	db, err := h.store.DB(t.ID)
	if err != nil {
		v.Error = err.Error()
		return v
	}
	v.Counts = educationcenter.Status(db)
	return v
}

func (h *handler) list(c *gin.Context) {
	out := []tenantView{}
	for _, t := range h.store.List() {
		out = append(out, h.view(t))
	}
	c.JSON(200, gin.H{"data": out})
}

type adminReq struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (r adminReq) check() string {
	if strings.TrimSpace(r.Name) == "" || !strings.Contains(r.Email, "@") || len(r.Password) < 8 {
		return "Adminin adı, e-poçtu və ən azı 8 simvolluq parolu lazımdır"
	}
	return ""
}

// create: the centre, its database (tables + default lookups) and its first admin.
func (h *handler) create(c *gin.Context) {
	var req struct {
		Name    string   `json:"name"`
		Domains []string `json:"domains"`
		Admin   adminReq `json:"admin"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "Məlumat düzgün deyil"})
		return
	}
	if msg := req.Admin.check(); msg != "" {
		c.JSON(400, gin.H{"error": msg})
		return
	}
	t, err := h.store.Create(req.Name, req.Domains)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	db, err := h.store.DB(t.ID)
	if err == nil {
		err = educationcenter.Prepare(db, t.ID)
	}
	if err == nil {
		educationcenter.Seed(db)
		_, err = educationcenter.CreateAdmin(db, t.ID, req.Admin.Name, req.Admin.Email, req.Admin.Password)
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "Mərkəz yaradıldı, amma bazası hazırlanmadı: " + err.Error(), "tenant": t})
		return
	}
	c.JSON(201, h.view(*t))
}

func tenantID(c *gin.Context) uint {
	id, _ := strconv.Atoi(c.Param("id"))
	return uint(id)
}

func (h *handler) update(c *gin.Context) {
	var req struct {
		Name     string       `json:"name"`
		IsActive bool         `json:"is_active"`
		Domains  []string     `json:"domains"`
		Mail     *tenant.Mail `json:"mail"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "Məlumat düzgün deyil"})
		return
	}
	if req.Mail != nil && strings.TrimSpace(req.Mail.Host) != "" && !strings.Contains(req.Mail.From, "@") {
		c.JSON(400, gin.H{"error": "SMTP üçün göndərən ünvan (From) lazımdır"})
		return
	}
	t, err := h.store.Update(tenantID(c), req.Name, req.IsActive, req.Domains)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if req.Mail != nil {
		if err := h.store.SetMail(t.ID, *req.Mail); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if fresh, err := h.store.Get(t.ID); err == nil {
			t = &fresh
		}
	}
	c.JSON(200, h.view(*t))
}

// addAdmin: one more admin account in a centre (for example the owner's own).
func (h *handler) addAdmin(c *gin.Context) {
	var req adminReq
	if c.ShouldBindJSON(&req) != nil || req.check() != "" {
		c.JSON(400, gin.H{"error": adminReq{}.check()})
		return
	}
	id := tenantID(c)
	db, err := h.store.DB(id)
	if err == nil {
		err = educationcenter.Prepare(db, id)
	}
	if err == nil {
		_, err = educationcenter.CreateAdmin(db, id, req.Name, req.Email, req.Password)
	}
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(201, gin.H{"success": true})
}

// setPassword: a new password for one of a centre's users (a forgotten admin password).
func (h *handler) setPassword(c *gin.Context) {
	var req struct{ Email, Password string }
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"error": "E-poçt və parol lazımdır"})
		return
	}
	db, err := h.store.DB(tenantID(c))
	if err == nil {
		err = educationcenter.SetPassword(db, req.Email, req.Password)
	}
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

// centreDB - mərkəzin bazası, cədvəlləri yenilənmiş.
func (h *handler) centreDB(c *gin.Context) (*gorm.DB, uint, bool) {
	id := tenantID(c)
	if _, err := h.store.Get(id); err != nil {
		c.JSON(404, gin.H{"error": "Mərkəz tapılmadı"})
		return nil, 0, false
	}
	db, err := h.store.DB(id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return nil, 0, false
	}
	educationcenter.Ensure(db, id)
	return db, id, true
}

// testMail: mərkəzin SMTP ayarı ilə sınaq məktubu.
func (h *handler) testMail(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	c.ShouldBindJSON(&req)
	id := tenantID(c)
	t, err := h.store.Get(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "Mərkəz tapılmadı"})
		return
	}
	to := strings.TrimSpace(req.To)
	if to == "" {
		to = c.MustGet("admin").(Admin).Email
	}
	m := educationcenter.MailFor(id)
	if !m.Ready() {
		c.JSON(400, gin.H{"error": "Bu mərkəz üçün SMTP qurulmayıb (serverin ümumi SMTP-si də yoxdur)"})
		return
	}
	body := "<p>Salam!</p><p>Bu, <b>" + html.EscapeString(t.Name) + "</b> mərkəzinin e-poçt ayarlarının sınaq məktubudur. Məktubu görürsünüzsə, göndərmə işləyir.</p>"
	if err := m.Send(to, "Sınaq məktubu — "+t.Name, body, "Bu, "+t.Name+" mərkəzinin e-poçt ayarlarının sınaq məktubudur."); err != nil {
		c.JSON(502, gin.H{"error": "Göndərilmədi: " + err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "to": to})
}

func (h *handler) users(c *gin.Context) {
	db, _, ok := h.centreDB(c)
	if !ok {
		return
	}
	c.JSON(200, gin.H{"data": educationcenter.Users(db, c.Query("q"), c.Query("role"))})
}

func (h *handler) userActive(c *gin.Context) {
	var req struct {
		IsActive *bool `json:"is_active"`
	}
	if c.ShouldBindJSON(&req) != nil || req.IsActive == nil {
		c.JSON(400, gin.H{"error": "is_active lazımdır"})
		return
	}
	db, _, ok := h.centreDB(c)
	if !ok {
		return
	}
	uid, _ := strconv.Atoi(c.Param("uid"))
	if err := educationcenter.SetActive(db, uint(uid), *req.IsActive); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func (h *handler) userResetLink(c *gin.Context) {
	db, id, ok := h.centreDB(c)
	if !ok {
		return
	}
	uid, _ := strconv.Atoi(c.Param("uid"))
	if _, err := educationcenter.SendReset(db, id, uint(uid), educationcenter.CentreURL(id)); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func (h *handler) mailLog(c *gin.Context) {
	db, _, ok := h.centreDB(c)
	if !ok {
		return
	}
	c.JSON(200, gin.H{"data": educationcenter.MailLog(db, c.Query("status"))})
}

func (h *handler) audit(c *gin.Context) {
	db, _, ok := h.centreDB(c)
	if !ok {
		return
	}
	c.JSON(200, gin.H{"data": educationcenter.Audit(db, c.Query("action"), c.Query("q"))})
}

// ---------- super adminlər ----------

func (h *handler) admins(c *gin.Context) {
	var as []Admin
	h.store.System.Order("id").Find(&as)
	c.JSON(200, gin.H{"data": as})
}

func (h *handler) addSuperAdmin(c *gin.Context) {
	var req adminReq
	if c.ShouldBindJSON(&req) != nil || req.check() != "" {
		c.JSON(400, gin.H{"error": "Ad, e-poçt və ən azı 8 simvolluq parol lazımdır"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	var n int64
	h.store.System.Model(&Admin{}).Where("email = ?", email).Count(&n)
	if n > 0 {
		c.JSON(400, gin.H{"error": "Bu e-poçtla super admin artıq var"})
		return
	}
	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	a := Admin{Name: strings.TrimSpace(req.Name), Email: email, PasswordHash: hash}
	if err := h.store.System.Create(&a).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	log.Printf("super admin %s added by %s", email, c.MustGet("admin").(Admin).Email)
	c.JSON(201, a)
}

func (h *handler) deleteSuperAdmin(c *gin.Context) {
	me := c.MustGet("admin").(Admin)
	id, _ := strconv.Atoi(c.Param("id"))
	if uint(id) == me.ID {
		c.JSON(400, gin.H{"error": "Öz hesabınızı silə bilməzsiniz"})
		return
	}
	var n int64
	h.store.System.Model(&Admin{}).Count(&n)
	if n <= 1 {
		c.JSON(400, gin.H{"error": "Ən azı bir super admin qalmalıdır"})
		return
	}
	res := h.store.System.Delete(&Admin{}, id)
	if res.Error != nil || res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "Tapılmadı"})
		return
	}
	log.Printf("super admin %d deleted by %s", id, me.Email)
	c.JSON(200, gin.H{"success": true})
}
