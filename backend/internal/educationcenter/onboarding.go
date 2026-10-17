package educationcenter

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"educationcenter/internal/security"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// ============================================================
// QEYDIYYAT / GOOGLE / 6 REQEMLI KOD / ROL SECIMI / BAGLANTILAR
// ============================================================

const (
	StatusActive  = "active"
	StatusPending = "pending"
)

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func userStatus(u *EduUser) string {
	if u.Status == "" {
		return StatusActive
	}
	return u.Status
}

// tokenRole - tokende gedecek rol. Rolu secilmeyen ve ya gozleyen
// istifadeci "pending" rolu ile girir (hec bir resursa icazesi yoxdur).
func tokenRole(u *EduUser) string {
	if userStatus(u) == StatusPending || u.Role == "" || !u.RoleChosen {
		return "pending"
	}
	return u.Role
}

func issueToken(u *EduUser) (string, error) {
	now := time.Now()
	claims := Claims{
		TenantID:   u.TenantID,
		UserID:     u.ID,
		Email:      u.Email,
		Role:       tokenRole(u),
		SubRoleID:  u.SubRoleID,
		TeacherID:  u.TeacherID,
		StudentID:  u.StudentID,
		GuardianID: u.GuardianID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(eduTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(eduJWTSecret())
}

func randomCode6() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	}
	return fmt.Sprintf("%d", n.Int64()+100000)
}

// ensureUserCode - istifadecinin unikal 6 reqemli kodu yoxdursa yaradir.
func ensureUserCode(db *gorm.DB, u *EduUser) {
	if u.Code != nil && *u.Code != "" {
		return
	}
	for i := 0; i < 30; i++ {
		code := randomCode6()
		var n int64
		db.Model(&EduUser{}).Where("code = ?", code).Count(&n)
		if n > 0 {
			continue
		}
		if db.Model(u).Update("code", code).Error == nil {
			u.Code = &code
			return
		}
	}
}

func (h *Handler) activeAdminExists(db *gorm.DB) bool {
	var n int64
	db.Model(&EduUser{}).Where("role = ? AND status = ? AND is_active = ? AND role_chosen = ?", RoleAdmin, StatusActive, true, true).Count(&n)
	return n > 0
}

func (h *Handler) respondSession(c *gin.Context, db *gorm.DB, u *EduUser, status int) {
	ensureUserCode(db, u)
	tok, err := issueToken(u)
	if err != nil {
		c.JSON(500, gin.H{"error": "Token yaradila bilmedi"})
		return
	}
	c.JSON(status, LoginResponse{Token: tok, User: h.userInfo(db, u)})
}

// ---------------- public ----------------

// GET /auth/config — login ekrani ucun (Google dugmesi gosterilsin?)
func (h *Handler) AuthConfig(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	c.JSON(200, gin.H{"google_client_id": h.googleClientID(db), "registration": true})
}

func (h *Handler) googleClientID(db *gorm.DB) string {
	var s Setting
	if db.Where("key = ?", "google_client_id").First(&s).Error != nil {
		return ""
	}
	var v string
	if json.Unmarshal(s.Value, &v) == nil {
		return strings.TrimSpace(v)
	}
	return strings.Trim(strings.TrimSpace(string(s.Value)), `"`)
}

// POST /auth/register {name,email,password}
func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	c.ShouldBindJSON(&req)
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Email) == "" {
		c.JSON(400, gin.H{"error": "Ad, e-poçt və parol tələb olunur"})
		return
	}
	if p := passwordProblem(req.Password); p != "" {
		c.JSON(400, gin.H{"error": p})
		return
	}
	if !registerByIP.allow(c.ClientIP()) {
		c.JSON(429, gin.H{"error": "Bu ünvandan çox sayda qeydiyyat oldu. Bir az sonra yenidən yoxlayın."})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	db.AutoMigrate(&EduUser{}, &TeacherStudent{})
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") {
		c.JSON(400, gin.H{"error": "E-poct duzgun deyil"})
		return
	}
	var n int64
	db.Model(&EduUser{}).Where("LOWER(email) = ?", email).Count(&n)
	if n > 0 {
		c.JSON(409, gin.H{"error": "Bu e-poçt artıq qeydiyyatdan keçib — daxil olun və ya parolu bərpa edin"})
		return
	}
	hash, err := security.HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "Sifre hazirlanarken xeta"})
		return
	}
	u := EduUser{
		Name: strings.TrimSpace(req.Name), Email: email, PasswordHash: hash,
		Role: "", RoleChosen: false, Status: StatusPending, Provider: "password",
		IsActive: true, TenantID: c.MustGet("tenantID").(uint),
	}
	if err := db.Create(&u).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	h.welcome(c, db, &u)
	h.respondSession(c, db, &u, 201)
}

// welcome - yeni qeydiyyat: xoş gəldin məktubu + audit.
func (h *Handler) welcome(c *gin.Context, db *gorm.DB, u *EduUser) {
	sendTemplate(db, "welcome", u.Email, &u.ID, map[string]string{"name": firstNonEmpty(u.DisplayName, u.Name), "email": u.Email, "link": siteURL(c) + "/login"})
	auditAs(c, db, &u.ID, u.Email, "registered", "auth", &u.ID, u.Provider)
}

// POST /auth/google {credential} — Google ID token
func (h *Handler) GoogleAuth(c *gin.Context) {
	var req struct {
		Credential string `json:"credential" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Google token teleb olunur"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	clientID := h.googleClientID(db)
	if clientID == "" {
		c.JSON(400, gin.H{"error": "Google ile giris hele qurulmayib (Ayarlar → google_client_id)"})
		return
	}
	httpc := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpc.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + req.Credential)
	if err != nil {
		c.JSON(502, gin.H{"error": "Google ile elaqe qurulmadi"})
		return
	}
	defer resp.Body.Close()
	var info struct {
		Aud           string `json:"aud"`
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Exp           string `json:"exp"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(resp.Body).Decode(&info) != nil {
		c.JSON(401, gin.H{"error": "Google tokeni etibarsizdir"})
		return
	}
	if info.Aud != clientID || info.Email == "" || info.EmailVerified != "true" {
		c.JSON(401, gin.H{"error": "Google hesabi tesdiqlenmedi"})
		return
	}
	email := strings.ToLower(info.Email)
	db.AutoMigrate(&EduUser{}, &TeacherStudent{})

	var u EduUser
	if db.Where("email = ?", email).First(&u).Error == nil {
		if !u.IsActive {
			c.JSON(403, gin.H{"error": "Hesab deaktivdir"})
			return
		}
		updates := map[string]interface{}{"last_login": time.Now()}
		if u.GoogleSub == "" {
			updates["google_sub"] = info.Sub
		}
		if u.Avatar == "" {
			updates["avatar"] = info.Picture
		}
		db.Model(&u).Updates(updates)
		h.respondSession(c, db, &u, 200)
		return
	}
	// yeni hesab (parolsuz)
	rnd := make([]byte, 24)
	rand.Read(rnd)
	hash, _ := security.HashPassword(fmt.Sprintf("%x", rnd))
	name := info.Name
	if name == "" {
		name = strings.Split(email, "@")[0]
	}
	u = EduUser{
		Name: name, Email: email, PasswordHash: hash, Avatar: info.Picture,
		Role: "", RoleChosen: false, Status: StatusPending, Provider: "google",
		GoogleSub: info.Sub, IsActive: true, TenantID: c.MustGet("tenantID").(uint),
	}
	if err := db.Create(&u).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	h.welcome(c, db, &u)
	h.respondSession(c, db, &u, 201)
}

// ---------------- sf (token ile) ----------------

// POST /sf/auth/choose-role {role}
// Ilk admin — avtomatik aktiv. Qalanlari admin kodla elave edene qeder gozleyir.
func (h *Handler) ChooseRole(c *gin.Context) {
	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Rol secin"})
		return
	}
	switch req.Role {
	case RoleAdmin, RoleTeacher, RoleStudent, RoleGuardian:
	default:
		c.JSON(400, gin.H{"error": "Yanlis rol"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var u EduUser
	if db.First(&u, currentUserID(c)).Error != nil {
		c.JSON(404, gin.H{"error": "Istifadeci tapilmadi"})
		return
	}
	if u.RoleChosen && u.Role != "" {
		c.JSON(400, gin.H{"error": "Rol artiq secilib"})
		return
	}
	status := StatusPending
	if req.Role == RoleAdmin && !h.activeAdminExists(db) {
		status = StatusActive
	}
	u.Role, u.RoleChosen, u.Status = req.Role, true, status
	if status == StatusActive {
		if err := h.ensureProfileForUser(db, &u, nil); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}
	if err := db.Save(&u).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if status == StatusPending {
		notifyAdmins(db, "registration", "Yeni qeydiyyat təsdiq gözləyir",
			u.Name+" ("+u.Email+") "+roleLabelAz[u.Role]+" kimi qoşulmaq istəyir. İstifadəçilər bölməsində təsdiqləyin və ya 6 rəqəmli kodu ilə əlavə edin.",
			"users", u.ID)
	}
	h.respondSession(c, db, &u, 200)
}

func (h *Handler) activate(db *gorm.DB, u *EduUser, branchID *uint) error {
	if !u.RoleChosen || u.Role == "" {
		return fmt.Errorf("Istifadeci hele rol secmeyib")
	}
	if err := h.ensureProfileForUser(db, u, branchID); err != nil {
		return err
	}
	u.Status = StatusActive
	if err := db.Save(u).Error; err != nil {
		return err
	}
	// İstifadəçiyə xəbər: paneldə bildiriş və "Hesab təsdiqləndi" məktubu (ayrıca bildiriş məktubu getmir)
	createNotification(db, Notification{UserID: u.ID, Type: "account_approved", Title: "Hesabınız təsdiqləndi",
		Body: "Artıq panelinizin bütün imkanlarından istifadə edə bilərsiniz."}, false)
	link := ""
	if base := CentreURL(tenantOf(db)); base != "" {
		link = base + "/login"
	}
	sendTemplate(db, "account_approved", u.Email, &u.ID, map[string]string{"name": firstNonEmpty(u.DisplayName, u.Name), "link": link})
	return nil
}

// POST /sf/auth/add-by-code {code}
func (h *Handler) AddByCode(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "6 reqemli kodu yazin"})
		return
	}
	code := strings.ReplaceAll(strings.TrimSpace(req.Code), " ", "")
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var u EduUser
	if len(code) != 6 || db.Where("code = ?", code).First(&u).Error != nil {
		c.JSON(404, gin.H{"error": "Bu kodla istifadeci tapilmadi"})
		return
	}
	if userStatus(&u) == StatusActive {
		c.JSON(200, gin.H{"already": true, "user": h.userInfo(db, &u)})
		return
	}
	if !u.RoleChosen || u.Role == "" {
		c.JSON(409, gin.H{"error": "Bu sexs hele rol secmeyib — rol secenden sonra yeniden cehd edin"})
		return
	}
	if err := h.activate(db, &u, nil); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"added": true, "user": h.userInfo(db, &u)})
}

// GET /sf/auth/pending
func (h *Handler) ListPending(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var us []EduUser
	db.Where("status = ?", StatusPending).Order("created_at DESC").Find(&us)
	out := make([]UserInfo, 0, len(us))
	for i := range us {
		out = append(out, h.userInfo(db, &us[i]))
	}
	c.JSON(200, gin.H{"data": out})
}

// POST /sf/auth/approve/:id
func (h *Handler) ApproveUser(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var u EduUser
	if db.First(&u, parseUint(c.Param("id"))).Error != nil {
		c.JSON(404, gin.H{"error": "Tapilmadi"})
		return
	}
	if err := h.activate(db, &u, nil); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"user": h.userInfo(db, &u)})
}

// ---------------- BAGLANTILAR ----------------
// Bir sagird: N valideyn (StudentGuardian), N muellim (TeacherStudent).

type linkPerson struct {
	LinkID   uint   `json:"link_id"`
	ID       uint   `json:"id"` // guardian_id / teacher_id
	Name     string `json:"name"`
	Relation string `json:"relation,omitempty"`
}

// GET /sf/links?student_id=  — yoxdursa butun sagirdler siyahisi (sayla)
func (h *Handler) LinksOverview(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	db.AutoMigrate(&TeacherStudent{})
	sid := parseUint(c.Query("student_id"))
	if sid == 0 {
		type row struct {
			ID        uint   `json:"id"`
			Name      string `json:"name"`
			Guardians int    `json:"guardians"`
			Teachers  int    `json:"teachers"`
		}
		var rows []row
		q := db.Table("edu_students s").
			Select(`s.id, s.name,
			 (SELECT COUNT(*) FROM edu_student_guardians g WHERE g.student_id = s.id) AS guardians,
			 (SELECT COUNT(*) FROM edu_teacher_students t WHERE t.student_id = s.id) AS teachers`).
			Order("s.name ASC")
		if search := strings.TrimSpace(c.Query("q")); search != "" {
			q = q.Where("LOWER(s.name) LIKE ?", "%"+strings.ToLower(search)+"%")
		}
		if currentRole(c) == RoleTeacher {
			q = q.Where("s.id IN (SELECT student_id FROM edu_teacher_students WHERE teacher_id = ?)", currentTeacherID(c))
		}
		q.Limit(500).Scan(&rows)
		c.JSON(200, gin.H{"students": rows})
		return
	}
	var guardians, teachers []linkPerson
	db.Table("edu_student_guardians l").
		Select("l.id AS link_id, g.id AS id, g.name AS name, l.relation AS relation").
		Joins("JOIN edu_guardians g ON g.id = l.guardian_id").
		Where("l.student_id = ?", sid).Scan(&guardians)
	db.Table("edu_teacher_students l").
		Select("l.id AS link_id, t.id AS id, t.name AS name").
		Joins("JOIN edu_teachers t ON t.id = l.teacher_id").
		Where("l.student_id = ?", sid).Scan(&teachers)
	type opt struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
	}
	var allG, allT []opt
	if currentRole(c) == RoleAdmin {
		db.Table("edu_guardians").Select("id, name").Order("name").Scan(&allG)
		db.Table("edu_teachers").Select("id, name").Order("name").Scan(&allT)
	}
	c.JSON(200, gin.H{"guardians": guardians, "teachers": teachers, "all_guardians": allG, "all_teachers": allT})
}

type linkReq struct {
	StudentID uint   `json:"student_id" binding:"required"`
	Kind      string `json:"kind" binding:"required"` // guardian | teacher
	PersonID  uint   `json:"person_id" binding:"required"`
	Relation  string `json:"relation"`
}

// POST /sf/links
func (h *Handler) LinkCreate(c *gin.Context) {
	var r linkReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(400, gin.H{"error": "student_id, kind, person_id teleb olunur"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	db.AutoMigrate(&TeacherStudent{})
	switch r.Kind {
	case "guardian":
		l := StudentGuardian{StudentID: r.StudentID, GuardianID: r.PersonID, Relation: r.Relation, CanPickup: true}
		if err := db.Where("student_id = ? AND guardian_id = ?", l.StudentID, l.GuardianID).FirstOrCreate(&l).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	case "teacher":
		l := TeacherStudent{StudentID: r.StudentID, TeacherID: r.PersonID}
		if err := db.Where("student_id = ? AND teacher_id = ?", l.StudentID, l.TeacherID).FirstOrCreate(&l).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(400, gin.H{"error": "kind guardian ve ya teacher olmalidir"})
		return
	}
	c.JSON(201, gin.H{"success": true})
}

// DELETE /sf/links {student_id, kind, person_id}
func (h *Handler) LinkDelete(c *gin.Context) {
	var r linkReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(400, gin.H{"error": "student_id, kind, person_id teleb olunur"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	switch r.Kind {
	case "guardian":
		db.Where("student_id = ? AND guardian_id = ?", r.StudentID, r.PersonID).Delete(&StudentGuardian{})
	case "teacher":
		db.Where("student_id = ? AND teacher_id = ?", r.StudentID, r.PersonID).Delete(&TeacherStudent{})
	}
	c.JSON(200, gin.H{"success": true})
}

// ---------------- MEDIA (sekil / audio) ----------------

const maxMediaBytes = 12 << 20

// POST /sf/media (multipart "file")
func (h *Handler) UploadMedia(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	db.AutoMigrate(&MediaFile{})
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "Fayl secin"})
		return
	}
	if fh.Size > maxMediaBytes {
		c.JSON(413, gin.H{"error": "Fayl 12 MB-dan boyuk ola bilmez"})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(400, gin.H{"error": "Fayl oxunmadi"})
		return
	}
	defer f.Close()
	data := make([]byte, 0, fh.Size)
	buf := make([]byte, 32*1024)
	for {
		n, rerr := f.Read(buf)
		data = append(data, buf[:n]...)
		if rerr != nil {
			break
		}
	}
	mime := http.DetectContentType(data)
	kind := ""
	switch {
	case strings.HasPrefix(mime, "image/"):
		kind = "image"
	case strings.HasPrefix(mime, "audio/"), strings.HasPrefix(mime, "video/ogg"), mime == "application/ogg", mime == "video/webm":
		kind = "audio"
		if mime == "video/webm" || mime == "application/ogg" || mime == "video/ogg" {
			mime = "audio/" + strings.TrimPrefix(strings.SplitN(mime, ";", 2)[0], "video/")
		}
	default:
		// mp3 (ID3) / svg bəzən text kimi taninir: uzantiya bax
		low := strings.ToLower(fh.Filename)
		switch {
		case strings.HasSuffix(low, ".mp3"), strings.HasSuffix(low, ".m4a"), strings.HasSuffix(low, ".wav"), strings.HasSuffix(low, ".ogg"):
			kind, mime = "audio", "audio/mpeg"
			if strings.HasSuffix(low, ".wav") {
				mime = "audio/wav"
			} else if strings.HasSuffix(low, ".ogg") {
				mime = "audio/ogg"
			} else if strings.HasSuffix(low, ".m4a") {
				mime = "audio/mp4"
			}
		}
	}
	if kind == "" {
		c.JSON(400, gin.H{"error": "Yalniz sekil ve ya audio fayllari qebul olunur"})
		return
	}
	tb := make([]byte, 16)
	rand.Read(tb)
	m := MediaFile{Token: fmt.Sprintf("%x", tb), Name: fh.Filename, Mime: mime, Size: len(data), Data: data, OwnerID: currentUserID(c)}
	if err := db.Create(&m).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(201, gin.H{"type": kind, "token": m.Token, "name": m.Name, "mime": mime})
}

// GET /public/media/:token
func (h *Handler) ServeMedia(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.Status(500)
		return
	}
	var m MediaFile
	if db.Where("token = ?", c.Param("token")).First(&m).Error != nil {
		c.Status(404)
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.Header("Content-Disposition", "inline")
	c.Header("X-Content-Type-Options", "nosniff")
	// Range desteyi (audio axtarisi) — http.ServeContent
	http.ServeContent(c.Writer, c.Request, m.Name, m.UpdatedAt, bytesReader(m.Data))
}

type byteSeeker struct {
	b []byte
	i int64
}

func bytesReader(b []byte) *byteSeeker { return &byteSeeker{b: b} }
func (r *byteSeeker) Read(p []byte) (int, error) {
	if r.i >= int64(len(r.b)) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += int64(n)
	return n, nil
}
func (r *byteSeeker) Seek(off int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		r.i = off
	case io.SeekCurrent:
		r.i += off
	case io.SeekEnd:
		r.i = int64(len(r.b)) + off
	}
	return r.i, nil
}
