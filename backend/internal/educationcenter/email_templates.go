package educationcenter

import (
	"html"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// E-POÇT ŞABLONLARI VƏ JURNAL
//
// Hər məktubun standart şablonu kodda var; mərkəzin admini onun
// mövzusunu və mətnini dəyişə, söndürə və test göndərə bilər
// (edu_email_templates). Mətn sadə yazıdır: sətirlər olduğu kimi
// qalır, {{dəyişən}} yerinə dəyər, {{button:Mətn}} yerinə linkli
// düymə qoyulur. Hər göndəriş jurnala düşür (edu_email_log).
// ============================================================

// EmailTemplate - adminin dəyişdirdiyi şablon (dəyişdirilməyibsə sətri yoxdur).
type EmailTemplate struct {
	BaseModel
	Key     string `json:"key" gorm:"size:50;uniqueIndex;not null"`
	Subject string `json:"subject" gorm:"size:255"`
	Body    string `json:"body" gorm:"type:text"`
	Enabled bool   `json:"enabled" gorm:"not null"` // default yoxdur: gorm false-u default ilə əvəz etməsin
}

func (EmailTemplate) TableName() string { return "edu_email_templates" }

// EmailLog - göndərilən (və ya göndərilməyən) hər məktub.
type EmailLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	CreatedAt   time.Time `json:"created_at" gorm:"index"`
	ToEmail     string    `json:"to" gorm:"column:to_email;size:255;index"`
	UserID      *uint     `json:"user_id" gorm:"index"`
	TemplateKey string    `json:"template" gorm:"size:50;index"`
	Subject     string    `json:"subject" gorm:"size:255"`
	Status      string    `json:"status" gorm:"size:20;index"` // sent | failed | skipped
	Error       string    `json:"error" gorm:"type:text"`
}

func (EmailLog) TableName() string { return "edu_email_log" }

type templateDef struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Vars        []string `json:"vars"`
	Subject     string   `json:"default_subject"`
	Body        string   `json:"default_body"`
}

// defaultTemplates - ardıcıllıq admin ekranındakı sıradır.
var defaultTemplates = []templateDef{
	{
		Key: "invitation", Label: "Dəvət (hesab yaradıldı)",
		Description: "Admin yeni istifadəçi yaradanda göndərilir: istifadəçi linklə öz parolunu təyin edir.",
		Vars:        []string{"name", "email", "centre", "link"},
		Subject:     "{{centre}} — hesabınız yaradıldı",
		Body: "Salam, {{name}}!\n\n{{centre}} sizin üçün hesab yaratdı ({{email}}). Parolunuzu təyin edib daxil olmaq üçün düyməyə basın:\n" +
			"{{button:Parolu təyin et}}\nLink 7 gün etibarlıdır.",
	},
	{
		Key: "welcome", Label: "Xoş gəldin (qeydiyyat)",
		Description: "İstifadəçi özü qeydiyyatdan keçəndə göndərilir.",
		Vars:        []string{"name", "email", "centre", "link"},
		Subject:     "Xoş gəlmisiniz — {{centre}}",
		Body: "Salam, {{name}}!\n\n{{centre}} sistemində qeydiyyatdan keçdiniz. Daxil olduqdan sonra rolunuzu seçin — hesabınız təsdiqlənəndən sonra bütün imkanlar açılacaq.\n" +
			"{{button:Daxil ol}}",
	},
	{
		Key: "account_approved", Label: "Hesab təsdiqləndi",
		Description: "Admin gözləyən hesabı təsdiqləyəndə göndərilir.",
		Vars:        []string{"name", "centre", "link"},
		Subject:     "Hesabınız təsdiqləndi — {{centre}}",
		Body:        "Salam, {{name}}!\n\nHesabınız təsdiqləndi. İndi daxil olub panelinizdən istifadə edə bilərsiniz.\n{{button:Daxil ol}}",
	},
	{
		Key: "password_reset", Label: "Parolun bərpası",
		Description: "\"Parolu unutmusunuz?\" ilə istənəndə göndərilir.",
		Vars:        []string{"name", "centre", "link", "minutes"},
		Subject:     "Parolun bərpası — {{centre}}",
		Body: "Salam, {{name}}!\n\nHesabınız üçün parolun bərpası istənildi. Yeni parol təyin etmək üçün düyməyə basın:\n" +
			"{{button:Yeni parol təyin et}}\nLink {{minutes}} dəqiqə ərzində etibarlıdır və bir dəfə işləyir. Bu sorğunu siz etməmisinizsə, məktubu nəzərə almayın — parolunuz dəyişmir.",
	},
	{
		Key: "password_changed", Label: "Parol dəyişdirildi",
		Description: "Parol dəyişəndə (bərpa, profil və ya admin tərəfindən) təhlükəsizlik üçün göndərilir.",
		Vars:        []string{"name", "centre"},
		Subject:     "Parolunuz dəyişdirildi — {{centre}}",
		Body:        "Salam, {{name}}!\n\nHesabınızın parolu indicə dəyişdirildi və digər cihazlardakı sessiyalar bağlandı.\n\nBunu siz etməmisinizsə, dərhal mərkəzin administrasiyası ilə əlaqə saxlayın.",
	},
	{
		Key: "notification", Label: "Bildiriş",
		Description: "Paneldə hər yeni bildiriş (ismarıc, qaimə, imtahan nəticəsi, davamiyyət, elan və s.) e-poçtla da göndərilir. İstifadəçi bunu profilindən söndürə bilər.",
		Vars:        []string{"name", "centre", "title", "body", "link"},
		Subject:     "{{title}} — {{centre}}",
		Body:        "Salam, {{name}}!\n\n{{body}}\n{{button:Panelə keç}}\nBildiriş məktublarını paneldə profil menyusundan söndürə bilərsiniz.",
	},
}

func templateDefOf(key string) (templateDef, bool) {
	for _, d := range defaultTemplates {
		if d.Key == key {
			return d, true
		}
	}
	return templateDef{}, false
}

// effectiveTemplate - adminin dəyişdirdiyi variant, yoxdursa standart.
func effectiveTemplate(db *gorm.DB, key string) (subject, body string, enabled, custom bool) {
	d, _ := templateDefOf(key)
	subject, body, enabled = d.Subject, d.Body, true
	var t EmailTemplate
	if db.Where("key = ?", key).First(&t).Error == nil {
		return t.Subject, t.Body, t.Enabled, true
	}
	return
}

var (
	reVar    = regexp.MustCompile(`\{\{\s*([a-z_]+)\s*\}\}`)
	reButton = regexp.MustCompile(`\{\{\s*button:([^}]*)\}\}`)
)

// renderTemplate - mövzu, HTML (çərçivəsiz) və düz mətn.
func renderTemplate(subject, body string, vars map[string]string) (string, string, string) {
	sub := strings.TrimSpace(strings.ReplaceAll(reVar.ReplaceAllStringFunc(subject, func(m string) string {
		return vars[reVar.FindStringSubmatch(m)[1]]
	}), "\n", " "))

	// düz mətn
	text := reButton.ReplaceAllStringFunc(body, func(m string) string {
		label := strings.TrimSpace(reButton.FindStringSubmatch(m)[1])
		if vars["link"] == "" {
			return ""
		}
		return label + ": " + vars["link"]
	})
	text = reVar.ReplaceAllStringFunc(text, func(m string) string { return vars[reVar.FindStringSubmatch(m)[1]] })

	// HTML: düymələr ayrıca qoyulur, qalan mətn qorunur (escape), sətirlər <br> olur
	var buttons []string
	marked := reButton.ReplaceAllStringFunc(body, func(m string) string {
		buttons = append(buttons, button(vars["link"], strings.TrimSpace(reButton.FindStringSubmatch(m)[1])))
		return "\x00" + string(rune('A'+len(buttons)-1)) + "\x00"
	})
	h := html.EscapeString(marked)
	h = reVar.ReplaceAllStringFunc(h, func(m string) string {
		return strings.ReplaceAll(html.EscapeString(vars[reVar.FindStringSubmatch(m)[1]]), "\n", "<br>")
	})
	h = strings.ReplaceAll(h, "\n", "<br>")
	for i, b := range buttons {
		h = strings.Replace(h, "\x00"+string(rune('A'+i))+"\x00", b, 1)
	}
	return sub, h, strings.TrimSpace(text)
}

func writeLog(db *gorm.DB, to string, userID *uint, key, subject, status, errText string) {
	background(db).Create(&EmailLog{ToEmail: to, UserID: userID, TemplateKey: key, Subject: subject, Status: status, Error: errText})
}

// sendTemplate - şablonla məktub. Göndəriş arxa planda gedir; nəticə jurnala yazılır.
// Qaytarır: "queued" | "disabled" | "not_configured" | "no_address" | "failed".
func sendTemplate(db *gorm.DB, key, to string, userID *uint, vars map[string]string) string {
	tenantID := tenantOf(db)
	subject, body, enabled, _ := effectiveTemplate(db, key)
	if vars == nil {
		vars = map[string]string{}
	}
	if vars["centre"] == "" {
		vars["centre"] = CentreName(tenantID)
	}
	sub, htmlInner, text := renderTemplate(subject, body, vars)
	to = strings.TrimSpace(to)
	if to == "" || !strings.Contains(to, "@") {
		return "no_address"
	}
	if !enabled {
		writeLog(db, to, userID, key, sub, "skipped", "şablon söndürülüb")
		return "disabled"
	}
	m := MailFor(tenantID)
	if !m.Ready() {
		writeLog(db, to, userID, key, sub, "skipped", "SMTP qurulmayıb")
		return "not_configured"
	}
	job := mailJob{db: background(db), mail: m, tenantID: tenantID, to: to, userID: userID, key: key,
		subject: sub, html: layout(vars["centre"], htmlInner), text: text}
	if !enqueueMail(job) {
		writeLog(db, to, userID, key, sub, "failed", "göndəriş növbəsi doludur")
		return "failed"
	}
	return "queued"
}

// loginURL - mərkəzin giriş səhifəsi.
func loginURL(db *gorm.DB) string {
	if u := CentreURL(tenantOf(db)); u != "" {
		return u + "/login"
	}
	return ""
}

// ============================================================
// ADMIN: şablonlar, test, jurnal
// ============================================================

type templateView struct {
	templateDef
	Subject string `json:"subject"`
	Body    string `json:"body"`
	Enabled bool   `json:"enabled"`
	Custom  bool   `json:"customized"`
}

// GET /sf/email/templates
func (h *Handler) ListEmailTemplates(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	out := make([]templateView, 0, len(defaultTemplates))
	for _, d := range defaultTemplates {
		s, b, en, custom := effectiveTemplate(db, d.Key)
		out = append(out, templateView{templateDef: d, Subject: s, Body: b, Enabled: en, Custom: custom})
	}
	m := MailFor(tenantOf(db))
	c.JSON(200, gin.H{"data": out, "mail_ready": m.Ready(), "from": m.From, "from_name": m.name()})
}

// PUT /sf/email/templates/:key {subject, body, enabled}
func (h *Handler) SaveEmailTemplate(c *gin.Context) {
	key := c.Param("key")
	if _, ok := templateDefOf(key); !ok {
		c.JSON(404, gin.H{"error": "Belə şablon yoxdur"})
		return
	}
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
		Enabled *bool  `json:"enabled"`
	}
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Subject) == "" || strings.TrimSpace(req.Body) == "" {
		c.JSON(400, gin.H{"error": "Mövzu və mətn boş ola bilməz"})
		return
	}
	if len(req.Subject) > 250 || len(req.Body) > 20000 {
		c.JSON(400, gin.H{"error": "Mətn çox uzundur"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var t EmailTemplate
	if db.Where("key = ?", key).First(&t).Error != nil {
		t = EmailTemplate{Key: key}
	}
	t.Subject, t.Body, t.Enabled = strings.TrimSpace(req.Subject), req.Body, enabled
	if err := db.Save(&t).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

// DELETE /sf/email/templates/:key — standart mətnə qaytarır
func (h *Handler) ResetEmailTemplate(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	db.Where("key = ?", c.Param("key")).Delete(&EmailTemplate{})
	c.JSON(200, gin.H{"success": true})
}

// POST /sf/email/templates/:key/test — nümunə dəyərlərlə adminin öz ünvanına
func (h *Handler) TestEmailTemplate(c *gin.Context) {
	key := c.Param("key")
	d, ok := templateDefOf(key)
	if !ok {
		c.JSON(404, gin.H{"error": "Belə şablon yoxdur"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var me EduUser
	if db.First(&me, currentUserID(c)).Error != nil {
		c.JSON(404, gin.H{"error": "İstifadəçi tapılmadı"})
		return
	}
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	c.ShouldBindJSON(&req)
	subject, body, _, _ := effectiveTemplate(db, key)
	if strings.TrimSpace(req.Subject) != "" && strings.TrimSpace(req.Body) != "" {
		subject, body = req.Subject, req.Body // redaktə olunan (hələ saxlanmayan) variant
	}
	tenantID := tenantOf(db)
	vars := map[string]string{
		"name": firstNonEmpty(me.DisplayName, me.Name), "email": me.Email, "centre": CentreName(tenantID),
		"link": firstNonEmpty(loginURL(db), "https://example.com"), "minutes": "60",
		"title": "Nümunə bildiriş", "body": "Bu, bildiriş məktubunun nümunə mətnidir.",
	}
	sub, htmlInner, text := renderTemplate(subject, body, vars)
	m := MailFor(tenantID)
	if !m.Ready() {
		c.JSON(400, gin.H{"error": "Bu mərkəz üçün e-poçt göndərmə (SMTP) qurulmayıb — super admin panelində təyin olunur"})
		return
	}
	uid := me.ID
	if err := m.Send(me.Email, "[TEST] "+sub, layout(vars["centre"], htmlInner), text); err != nil {
		writeLog(db, me.Email, &uid, d.Key, "[TEST] "+sub, "failed", err.Error())
		c.JSON(502, gin.H{"error": "Göndərilmədi: " + err.Error()})
		return
	}
	writeLog(db, me.Email, &uid, d.Key, "[TEST] "+sub, "sent", "")
	c.JSON(200, gin.H{"success": true, "to": me.Email})
}

// GET /sf/email/log?status=&q=
func (h *Handler) EmailLogList(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	q := db.Model(&EmailLog{}).Order("id DESC").Limit(200)
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if s := strings.TrimSpace(c.Query("q")); s != "" {
		q = q.Where("to_email ILIKE ? OR subject ILIKE ?", "%"+s+"%", "%"+s+"%")
	}
	var rows []EmailLog
	q.Find(&rows)
	c.JSON(200, gin.H{"data": rows})
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}
