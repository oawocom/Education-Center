package educationcenter

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"educationcenter/internal/security"
	"gorm.io/gorm"
)

// ============================================================
// AUTH
// Merkezin oz istifadecileri: edu_users cedveli, oz token-i.
// Token yalniz verildiyi merkezde kecerlidir.
// ============================================================

// requestHost - the address the visitor opened (passed on by the frontend / nginx).
func requestHost(c *gin.Context) string {
	if h := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Host"), ",")[0]); h != "" {
		return h
	}
	return c.Request.Host
}

// eduJWTSecret - the signing key of the centre logins, derived from JWT_SECRET.
func eduJWTSecret() []byte { return security.Key("education-center-token") }

const eduTokenTTL = 24 * time.Hour

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UserInfo struct {
	ID          uint                `json:"id"`
	Email       string              `json:"email"`
	Name        string              `json:"name"`
	DisplayName string              `json:"display_name"`
	Role        string              `json:"role"`
	SubRoleID   *uint               `json:"sub_role_id,omitempty"`
	Avatar      string              `json:"avatar"`
	Code        string              `json:"code"`
	Status      string              `json:"status"`
	TeacherID   *uint               `json:"teacher_id,omitempty"`
	StudentID   *uint               `json:"student_id,omitempty"`
	GuardianID  *uint               `json:"guardian_id,omitempty"`
	BranchID    *uint               `json:"branch_id,omitempty"`
	Permissions map[string][]string `json:"permissions"`
}

type LoginResponse struct {
	Token string   `json:"token"`
	User  UserInfo `json:"user"`
}

type Claims struct {
	TenantID   uint   `json:"tid"` // the centre the token was issued in: it opens no other centre
	UserID     uint   `json:"user_id"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	SubRoleID  *uint  `json:"sub_role_id,omitempty"`
	TeacherID  *uint  `json:"teacher_id,omitempty"`
	StudentID  *uint  `json:"student_id,omitempty"`
	GuardianID *uint  `json:"guardian_id,omitempty"`
	jwt.RegisteredClaims
}

func GenerateSetupToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ============================================================
// MIDDLEWARE
// ============================================================

// JWTAuth - tokeni yoxlayir, istifadeci melumatlarini ve alt rol
// icazelerini context-e qoyur. Butun /sf route-lari bunun altindadir.
func (h *Handler) JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.JSON(401, gin.H{"error": "Token teleb olunur"})
			c.Abort()
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(header[7:], claims, func(t *jwt.Token) (interface{}, error) {
			return eduJWTSecret(), nil
		})
		if err != nil || !token.Valid {
			c.JSON(401, gin.H{"error": "Token etibarsiz ve ya vaxti kecib"})
			c.Abort()
			return
		}
		if claims.TenantID != c.MustGet("tenantID").(uint) {
			c.JSON(401, gin.H{"error": "Token etibarsiz ve ya vaxti kecib"})
			c.Abort()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("userEmail", claims.Email)
		c.Set("userRole", claims.Role)
		if claims.TeacherID != nil {
			c.Set("teacherID", *claims.TeacherID)
		}
		if claims.StudentID != nil {
			c.Set("studentID", *claims.StudentID)
		}
		if claims.GuardianID != nil {
			c.Set("guardianID", *claims.GuardianID)
		}

		// Alt rol varsa icazeleri DB-den oxu (icaze daraldilmasi ucun)
		if claims.SubRoleID != nil {
			if db, err := h.tenantDB(c); err == nil {
				var sr SubRole
				if db.Where("id = ? AND is_active = ?", *claims.SubRoleID, true).First(&sr).Error == nil {
					if perms := ParseSubRolePermissions(sr.Permissions); perms != nil {
						c.Set("subRolePerms", perms)
					}
				}
			}
		}

		c.Next()
	}
}

// Cari istifadeci uzre komekciler (Scope funksiyalari bunlari isledir)
func currentUserID(c *gin.Context) uint { v, _ := c.Get("userID"); id, _ := v.(uint); return id }
func currentRole(c *gin.Context) string { return c.GetString("userRole") }
func currentTeacherID(c *gin.Context) uint {
	v, _ := c.Get("teacherID")
	id, _ := v.(uint)
	return id
}
func currentStudentID(c *gin.Context) uint {
	v, _ := c.Get("studentID")
	id, _ := v.(uint)
	return id
}
func currentGuardianID(c *gin.Context) uint {
	v, _ := c.Get("guardianID")
	id, _ := v.(uint)
	return id
}
func currentSubRolePerms(c *gin.Context) map[string][]string {
	v, ok := c.Get("subRolePerms")
	if !ok {
		return nil
	}
	p, _ := v.(map[string][]string)
	return p
}

// ============================================================
// LOGIN / ME / LOGOUT
// ============================================================

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "E-poct ve sifre teleb olunur"})
		return
	}

	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	var user EduUser
	if err := db.Where("email = ? AND is_active = ?", email, true).First(&user).Error; err != nil {
		c.JSON(401, gin.H{"error": "E-poct ve ya sifre yanlisdir"})
		return
	}

	if !security.CheckPassword(req.Password, user.PasswordHash) {
		c.JSON(401, gin.H{"error": "E-poct ve ya sifre yanlisdir"})
		return
	}

	db.Model(&user).Update("last_login", time.Now())
	ensureUserCode(db, &user)

	signed, err := issueToken(&user)
	if err != nil {
		c.JSON(500, gin.H{"error": "Token yaradila bilmedi"})
		return
	}

	c.JSON(200, LoginResponse{Token: signed, User: h.userInfo(db, &user)})
}

func (h *Handler) GetMe(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var user EduUser
	if err := db.Where("id = ? AND is_active = ?", currentUserID(c), true).First(&user).Error; err != nil {
		c.JSON(401, gin.H{"error": "Istifadeci tapilmadi"})
		return
	}

	ensureUserCode(db, &user)
	info := h.userInfo(db, &user)
	// Rol/status deyisibse (admin elave edib) yeni token ver
	if currentRole(c) != tokenRole(&user) {
		if t, err := issueToken(&user); err == nil {
			c.JSON(200, gin.H{"id": info.ID, "email": info.Email, "name": info.Name, "display_name": info.DisplayName, "role": info.Role, "avatar": info.Avatar, "code": info.Code, "status": info.Status, "teacher_id": info.TeacherID, "student_id": info.StudentID, "guardian_id": info.GuardianID, "branch_id": info.BranchID, "sub_role_id": info.SubRoleID, "permissions": info.Permissions, "token": t})
			return
		}
	}
	c.JSON(200, info)
}

func (h *Handler) Logout(c *gin.Context) {
	c.JSON(200, gin.H{"success": true})
}

// userInfo - istifadeci + yekun icaze xeritesi.
// Frontend menyunu bu cavaba gore qurur, hardcode etmir.
func (h *Handler) userInfo(db *gorm.DB, u *EduUser) UserInfo {
	var sub map[string][]string
	if u.SubRoleID != nil {
		var sr SubRole
		if db.Where("id = ? AND is_active = ?", *u.SubRoleID, true).First(&sr).Error == nil {
			sub = ParseSubRolePermissions(sr.Permissions)
		}
	}

	return UserInfo{
		ID:          u.ID,
		Email:       u.Email,
		Name:        u.Name,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		SubRoleID:   u.SubRoleID,
		Avatar:      u.Avatar,
		Code:        derefStr(u.Code),
		Status:      userStatus(u),
		TeacherID:   u.TeacherID,
		StudentID:   u.StudentID,
		GuardianID:  u.GuardianID,
		BranchID:    u.BranchID,
		Permissions: func() map[string][]string {
			if tokenRole(u) == "pending" {
				return map[string][]string{}
			}
			return EffectivePermissions(u.Role, sub)
		}(),
	}
}

// ============================================================
// SIFRE EMELIYYATLARI
// ============================================================

func (h *Handler) ChangePassword(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Cari ve yeni sifre teleb olunur (min 6 simvol)"})
		return
	}

	var user EduUser
	if err := db.First(&user, currentUserID(c)).Error; err != nil {
		c.JSON(404, gin.H{"error": "Istifadeci tapilmadi"})
		return
	}

	if !security.CheckPassword(req.CurrentPassword, user.PasswordHash) {
		c.JSON(401, gin.H{"error": "Cari sifre yanlisdir"})
		return
	}

	hash, err := security.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(500, gin.H{"error": "Sifre hazirlanarken xeta"})
		return
	}

	db.Model(&user).Update("password_hash", hash)
	c.JSON(200, gin.H{"success": true})
}

// SetupPassword - dəvət linki ile ilk sifrenin teyini (public)
func (h *Handler) SetupPassword(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Token ve sifre teleb olunur (min 6 simvol)"})
		return
	}

	var user EduUser
	if err := db.Where("setup_token = ? AND is_active = ?", req.Token, true).First(&user).Error; err != nil {
		c.JSON(400, gin.H{"error": "Link etibarsizdir"})
		return
	}

	if user.SetupTokenExpiry != nil && user.SetupTokenExpiry.Before(time.Now()) {
		c.JSON(400, gin.H{"error": "Linkin vaxti kecib"})
		return
	}

	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "Sifre hazirlanarken xeta"})
		return
	}

	db.Model(&user).Updates(map[string]interface{}{
		"password_hash":      hash,
		"setup_token":        "",
		"setup_token_expiry": nil,
	})

	c.JSON(200, gin.H{"success": true, "email": user.Email})
}

func (h *Handler) VerifySetupToken(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	token := c.Query("token")
	if token == "" {
		c.JSON(400, gin.H{"valid": false, "error": "Token teleb olunur"})
		return
	}

	var user EduUser
	if err := db.Where("setup_token = ? AND is_active = ?", token, true).First(&user).Error; err != nil {
		c.JSON(400, gin.H{"valid": false, "error": "Link etibarsizdir"})
		return
	}

	if user.SetupTokenExpiry != nil && user.SetupTokenExpiry.Before(time.Now()) {
		c.JSON(400, gin.H{"valid": false, "error": "Linkin vaxti kecib"})
		return
	}

	c.JSON(200, gin.H{"valid": true, "name": user.Name, "email": user.Email})
}

// ============================================================
// ISTIFADECI IDARESI (admin)
// ============================================================

func (h *Handler) ListUsers(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	q := db.Model(&EduUser{})
	if role := c.Query("role"); role != "" {
		q = q.Where("role = ?", role)
	}
	if branch := c.Query("branch_id"); branch != "" {
		q = q.Where("branch_id = ?", branch)
	}
	// Yalniz "kolge" hesablar (profile baglanmayan) — duzeltmek ucun suzge
	if c.Query("orphan") == "1" {
		q = q.Where("(role = 'teacher' AND teacher_id IS NULL) OR (role = 'student' AND student_id IS NULL) OR (role = 'guardian' AND guardian_id IS NULL)")
	}

	users := make([]EduUser, 0)
	q.Order("id DESC").Find(&users)

	// Her hesaba baglilig xulasesi elave et: profil adi, kod, movcudluq.
	// Frontend bununla "kolge hesab"lari isaretleyir.
	type profileInfo struct {
		Kind    string `json:"kind"`
		ID      uint   `json:"id"`
		Name    string `json:"name"`
		Code    string `json:"code"`
		Linked  bool   `json:"linked"`
		Missing bool   `json:"missing"` // rol var, profil yoxdur = kolge
	}

	out := make([]map[string]interface{}, 0, len(users))
	for i := range users {
		u := users[i]
		row := map[string]interface{}{
			"id": u.ID, "name": u.Name, "email": u.Email, "role": u.Role,
			"is_active": u.IsActive, "phone": u.Phone, "last_login": u.LastLogin,
			"sub_role_id": u.SubRoleID, "teacher_id": u.TeacherID,
			"student_id": u.StudentID, "guardian_id": u.GuardianID, "branch_id": u.BranchID,
		}

		pi := profileInfo{}
		switch u.Role {
		case RoleTeacher:
			pi.Kind = "teacher"
			if u.TeacherID != nil {
				var t Teacher
				if db.First(&t, *u.TeacherID).Error == nil {
					pi.ID, pi.Name, pi.Linked = t.ID, t.Name, true
				}
			}
			pi.Missing = !pi.Linked
		case RoleStudent:
			pi.Kind = "student"
			if u.StudentID != nil {
				var s Student
				if db.First(&s, *u.StudentID).Error == nil {
					pi.ID, pi.Name, pi.Code, pi.Linked = s.ID, s.Name, s.Code, true
				}
			}
			pi.Missing = !pi.Linked
		case RoleGuardian:
			pi.Kind = "guardian"
			if u.GuardianID != nil {
				var g Guardian
				if db.First(&g, *u.GuardianID).Error == nil {
					pi.ID, pi.Name, pi.Linked = g.ID, g.Name, true
				}
			}
			pi.Missing = !pi.Linked
		}
		row["profile"] = pi
		out = append(out, row)
	}

	c.JSON(200, gin.H{"data": out, "total": len(out)})
}

// CreateUser - admin terefinden istifadeci yaradilmasi.
// Sifre verilmese devet tokeni qaytarilir.
func (h *Handler) CreateUser(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		Name       string `json:"name" binding:"required"`
		Email      string `json:"email" binding:"required"`
		Password   string `json:"password"`
		Role       string `json:"role" binding:"required"`
		SubRoleID  *uint  `json:"sub_role_id"`
		TeacherID  *uint  `json:"teacher_id"`
		StudentID  *uint  `json:"student_id"`
		GuardianID *uint  `json:"guardian_id"`
		BranchID   *uint  `json:"branch_id"`
		Phone      string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if _, ok := PermissionMatrix[req.Role]; !ok {
		c.JSON(400, gin.H{"error": "Bilinmeyen rol: " + req.Role})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	var existing EduUser
	if db.Where("email = ?", email).First(&existing).Error == nil {
		c.JSON(409, gin.H{"error": "Bu e-poct artiq istifade olunur"})
		return
	}

	tenantID := c.MustGet("tenantID").(uint)
	user := EduUser{
		Name:       req.Name,
		Email:      email,
		Role:       req.Role,
		SubRoleID:  req.SubRoleID,
		TeacherID:  req.TeacherID,
		StudentID:  req.StudentID,
		GuardianID: req.GuardianID,
		BranchID:   req.BranchID,
		Phone:      req.Phone,
		IsActive:   true,
		TenantID:  tenantID,
	}

	// Rola uygun profil avtomatik yaradilir/baglanir.
	// Bu, "kolge hesab" problemini kokunden hell edir: teacher/student/
	// guardian rolu olan her hesabin real profil qeydi (kod, telefon...)
	// olur. Admin evvelceden profili sece biler — o zaman toxunulmur.
	if err := h.ensureProfileForUser(db, &user, req.BranchID); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var setupURL string
	if req.Password != "" {
		hash, err := security.HashPassword(req.Password)
		if err != nil {
			c.JSON(500, gin.H{"error": "Sifre hazirlanarken xeta"})
			return
		}
		user.PasswordHash = hash
	} else {
		token := GenerateSetupToken()
		expiry := time.Now().Add(7 * 24 * time.Hour)
		tmp, _ := security.HashPassword("__pending__" + token)
		user.PasswordHash = tmp
		user.SetupToken = token
		user.SetupTokenExpiry = &expiry
		setupURL = "https://" + requestHost(c) + "/setup-password?token=" + token
	}

	if err := db.Create(&user).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{"user": h.userInfo(db, &user)}
	if setupURL != "" {
		resp["setup_url"] = setupURL
	}
	c.JSON(201, resp)
}

// ensureProfileForUser - hesabi rola uygun profile baglayir.
// Profil evvelceden secilibse toxunmur; secilmeyibse ad/e-poct/telefondan
// yeni profil yaradir ve id-ni user-e yazir. Butun bunlar user CREATE
// olunmazdan EVVEL cagirilir, ona gore user hemin profil id ile yaranir.
func (h *Handler) ensureProfileForUser(db *gorm.DB, user *EduUser, branchID *uint) error {
	switch user.Role {
	case RoleTeacher:
		if user.TeacherID != nil && *user.TeacherID > 0 {
			return nil
		}
		t := Teacher{Name: user.Name, Email: user.Email, Phone: user.Phone, BranchID: branchID, Status: "active"}
		if err := db.Create(&t).Error; err != nil {
			return err
		}
		user.TeacherID = &t.ID

	case RoleStudent:
		if user.StudentID != nil && *user.StudentID > 0 {
			return nil
		}
		s := Student{Name: user.Name, Email: user.Email, Phone: user.Phone, BranchID: branchID, Status: "active", Code: nextStudentCode(db), EnrolledAt: nowPtr()}
		if err := db.Create(&s).Error; err != nil {
			return err
		}
		user.StudentID = &s.ID

	case RoleGuardian:
		if user.GuardianID != nil && *user.GuardianID > 0 {
			return nil
		}
		g := Guardian{Name: user.Name, Email: user.Email, Phone: user.Phone}
		if err := db.Create(&g).Error; err != nil {
			return err
		}
		user.GuardianID = &g.ID
	}
	return nil
}

// BackfillProfiles - movcud "kolge" hesablar ucun catismayan profilleri
// yaradib baglayir. Bir defe basilir, butun kohne hesablar duzelir.
// POST /sf/ops/backfill-profiles
func (h *Handler) BackfillProfiles(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var users []EduUser
	db.Where("role IN ?", []string{RoleTeacher, RoleStudent, RoleGuardian}).
		Where("(role = ? AND teacher_id IS NULL) OR (role = ? AND student_id IS NULL) OR (role = ? AND guardian_id IS NULL)",
			RoleTeacher, RoleStudent, RoleGuardian).
		Find(&users)

	fixed := 0
	for i := range users {
		u := users[i]
		if err := h.ensureProfileForUser(db, &u, u.BranchID); err != nil {
			continue
		}
		patch := map[string]interface{}{}
		if u.TeacherID != nil {
			patch["teacher_id"] = *u.TeacherID
		}
		if u.StudentID != nil {
			patch["student_id"] = *u.StudentID
		}
		if u.GuardianID != nil {
			patch["guardian_id"] = *u.GuardianID
		}
		if len(patch) > 0 {
			db.Model(&EduUser{}).Where("id = ?", u.ID).Updates(patch)
			fixed++
		}
	}

	c.JSON(200, gin.H{"success": true, "count": fixed})
}

// CreateAccountForProfile - movcud profile (muellim/sagird/valideyn) giris
// hesabi yaradir. Profil terefinden "Hesab yarat" duymesi bunu cagirir.
// POST /sf/ops/create-account {kind, profile_id, email?, password?}
func (h *Handler) CreateAccountForProfile(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		Kind      string `json:"kind" binding:"required"` // teacher | student | guardian
		ProfileID uint   `json:"profile_id" binding:"required"`
		Email     string `json:"email"`
		Password  string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Profil seçilməlidir"})
		return
	}
	if req.Kind != RoleTeacher && req.Kind != RoleStudent && req.Kind != RoleGuardian {
		c.JSON(400, gin.H{"error": "Rol yalnız müəllim/şagird/valideyn ola bilər"})
		return
	}

	// Profil movcuddurmu + ad/e-poct/telefonu goturek
	var name, profileEmail, phone string
	col := map[string]string{RoleTeacher: "edu_teachers", RoleStudent: "edu_students", RoleGuardian: "edu_guardians"}[req.Kind]
	type prow struct {
		Name  string
		Email string
		Phone string
	}
	var pr prow
	if db.Raw("SELECT name, email, phone FROM "+col+" WHERE id = ?", req.ProfileID).Scan(&pr).RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "Profil tapılmadı"})
		return
	}
	name, profileEmail, phone = pr.Name, pr.Email, pr.Phone

	// Bu profile artiq hesab varmi?
	fk := map[string]string{RoleTeacher: "teacher_id", RoleStudent: "student_id", RoleGuardian: "guardian_id"}[req.Kind]
	var dup int64
	db.Model(&EduUser{}).Where(fk+" = ?", req.ProfileID).Count(&dup)
	if dup > 0 {
		c.JSON(409, gin.H{"error": "Bu profilin artıq giriş hesabı var"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(profileEmail))
	}
	if email == "" {
		c.JSON(400, gin.H{"error": "E-poçt tələb olunur (profildə də yoxdur)"})
		return
	}
	var existing EduUser
	if db.Where("email = ?", email).First(&existing).Error == nil {
		c.JSON(409, gin.H{"error": "Bu e-poçt artıq istifadə olunur"})
		return
	}

	tenantID := c.MustGet("tenantID").(uint)
	user := EduUser{
		Name:      name,
		Email:     email,
		Role:      req.Kind,
		Phone:     phone,
		IsActive:  true,
		TenantID: tenantID,
	}
	switch req.Kind {
	case RoleTeacher:
		id := req.ProfileID
		user.TeacherID = &id
	case RoleStudent:
		id := req.ProfileID
		user.StudentID = &id
	case RoleGuardian:
		id := req.ProfileID
		user.GuardianID = &id
	}

	var setupURL string
	if req.Password != "" {
		hash, err := security.HashPassword(req.Password)
		if err != nil {
			c.JSON(500, gin.H{"error": "Şifrə hazırlanarken xeta"})
			return
		}
		user.PasswordHash = hash
	} else {
		token := GenerateSetupToken()
		expiry := time.Now().Add(7 * 24 * time.Hour)
		tmp, _ := security.HashPassword("__pending__" + token)
		user.PasswordHash = tmp
		user.SetupToken = token
		user.SetupTokenExpiry = &expiry
		setupURL = "https://" + requestHost(c) + "/setup-password?token=" + token
	}

	if err := db.Create(&user).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{"success": true, "user": h.userInfo(db, &user)}
	if setupURL != "" {
		resp["setup_url"] = setupURL
	}
	c.JSON(201, resp)
}

func (h *Handler) UpdateUser(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	allowed := map[string]bool{
		"name": true, "display_name": true, "phone": true, "avatar": true,
		"role": true, "sub_role_id": true, "branch_id": true, "is_active": true,
		"teacher_id": true, "student_id": true, "guardian_id": true, "locale": true,
	}
	patch := map[string]interface{}{}
	for k, v := range raw {
		if allowed[k] {
			patch[k] = v
		}
	}
	if len(patch) == 0 {
		c.JSON(400, gin.H{"error": "Deyisdirilecek sahe yoxdur"})
		return
	}

	if r, ok := patch["role"].(string); ok {
		if _, valid := PermissionMatrix[r]; !valid {
			c.JSON(400, gin.H{"error": "Bilinmeyen rol: " + r})
			return
		}
	}

	if err := db.Model(&EduUser{}).Where("id = ?", c.Param("id")).Updates(patch).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	var user EduUser
	db.First(&user, c.Param("id"))
	c.JSON(200, h.userInfo(db, &user))
}

func (h *Handler) ResetUserPassword(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var req struct {
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Sifre teleb olunur (min 6 simvol)"})
		return
	}

	var user EduUser
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(404, gin.H{"error": "Istifadeci tapilmadi"})
		return
	}

	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "Sifre hazirlanarken xeta"})
		return
	}

	db.Model(&user).Updates(map[string]interface{}{
		"password_hash":      hash,
		"setup_token":        "",
		"setup_token_expiry": nil,
	})
	c.JSON(200, gin.H{"success": true})
}

func (h *Handler) DeleteUser(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	if currentUserID(c) == parseUint(c.Param("id")) {
		c.JSON(400, gin.H{"error": "Oz hesabinizi sile bilmezsiniz"})
		return
	}

	if err := db.Delete(&EduUser{}, c.Param("id")).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func parseUint(s string) uint {
	var n uint64
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + uint64(r-'0')
	}
	return uint(n)
}
