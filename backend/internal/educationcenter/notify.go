package educationcenter

import (
	"encoding/json"
	"reflect"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// BİLDİRİŞLƏR, ELANLAR, AUDİT
// ============================================================

// createNotification - paneldə bildiriş; email=true olsa və istifadəçi
// söndürməyibsə, "Bildiriş" şablonu ilə e-poçt da gedir.
func createNotification(db *gorm.DB, n Notification, email bool) {
	if n.UserID == 0 {
		return
	}
	if n.Priority == "" {
		n.Priority = "normal"
	}
	if db.Create(&n).Error != nil || !email {
		return
	}
	var u EduUser
	if db.Select("id, email, name, display_name, is_active, email_notifications").First(&u, n.UserID).Error != nil {
		return
	}
	if !u.IsActive || !u.EmailNotifications {
		return
	}
	link := CentreURL(tenantOf(db))
	if link != "" {
		link += "/dashboard"
		if n.Link != "" && !strings.Contains(n.Link, "/") {
			link += "?view=" + n.Link
		}
	}
	uid := u.ID
	sendTemplate(db, "notification", u.Email, &uid, map[string]string{
		"name": firstNonEmpty(u.DisplayName, u.Name), "title": n.Title, "body": firstNonEmpty(n.Body, n.Title), "link": link,
	})
}

// notifyAdmins - mərkəzin bütün aktiv adminlərinə.
func notifyAdmins(db *gorm.DB, kind, title, body, link string, except uint) {
	var ids []uint
	db.Model(&EduUser{}).Where("role = ? AND status = ? AND is_active = ? AND id <> ?", RoleAdmin, StatusActive, true, except).Pluck("id", &ids)
	for _, id := range ids {
		createNotification(db, Notification{UserID: id, Type: kind, Title: title, Body: body, Link: link}, true)
	}
}

var roleLabelAz = map[string]string{RoleAdmin: "admin", RoleTeacher: "müəllim", RoleStudent: "şagird", RoleGuardian: "valideyn"}

// ---------- zəng (bell) ----------

// GET /sf/inbox?limit=15 — son bildirişlər və oxunmamışların sayı
func (h *Handler) Inbox(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	limit := int(parseUint(c.DefaultQuery("limit", "15")))
	if limit <= 0 || limit > 100 {
		limit = 15
	}
	uid := currentUserID(c)
	var rows []Notification
	db.Where("user_id = ?", uid).Order("id DESC").Limit(limit).Find(&rows)
	var unread int64
	db.Model(&Notification{}).Where("user_id = ? AND is_read = ?", uid, false).Count(&unread)
	c.JSON(200, gin.H{"data": rows, "unread": unread})
}

// POST /sf/inbox/read {ids:[...]} və ya {all:true}
func (h *Handler) InboxRead(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids"`
		All bool   `json:"all"`
	}
	c.ShouldBindJSON(&req)
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	q := db.Model(&Notification{}).Where("user_id = ? AND is_read = ?", currentUserID(c), false)
	if !req.All {
		if len(req.IDs) == 0 {
			c.JSON(200, gin.H{"success": true})
			return
		}
		q = q.Where("id IN ?", req.IDs)
	}
	q.Updates(map[string]interface{}{"is_read": true, "read_at": time.Now()})
	c.JSON(200, gin.H{"success": true})
}

// ---------- elanlar ----------

// announcementPublished - elan dərc olunanda hədəf rollara bir dəfə bildiriş (və e-poçt).
func announcementPublished(c *gin.Context, db *gorm.DB, m *Announcement) error {
	if m.Status != "published" || m.NotifiedAt != nil {
		return nil
	}
	now := time.Now()
	up := map[string]interface{}{"notified_at": now}
	if m.PublishedAt == nil {
		up["published_at"] = now
	}
	// bir dəfə: eyni anda iki yeniləmə gəlsə də yalnız biri göndərsin
	res := db.Model(&Announcement{}).Where("id = ? AND notified_at IS NULL", m.ID).Updates(up)
	if res.Error != nil || res.RowsAffected == 0 {
		return nil
	}
	m.NotifiedAt = &now
	var ids []uint
	announcementAudience(db, m, currentUserID(c)).Pluck("id", &ids)
	body := trimTo(m.Body, 300)
	for _, id := range ids {
		aid := m.ID
		createNotification(db, Notification{UserID: id, Type: "announcement", Title: m.Title, Body: body, Link: "announcements", RefType: "announcement", RefID: &aid}, true)
	}
	return nil
}

// jsonIDs - [1,2] və ya ["1","2"] şəklində id siyahısı.
func jsonIDs(raw []byte) []uint {
	var xs []interface{}
	if len(raw) == 0 || json.Unmarshal(raw, &xs) != nil {
		return nil
	}
	var out []uint
	for _, x := range xs {
		switch v := x.(type) {
		case float64:
			if v > 0 {
				out = append(out, uint(v))
			}
		case string:
			if n := parseUint(strings.TrimSpace(v)); n > 0 {
				out = append(out, n)
			}
		}
	}
	return out
}

// announcementAudience - elanın hədəfi: rollar, qruplar (şagird, onun valideynləri, qrupun
// müəllimi) və filiallar (filialın istifadəçiləri, şagirdləri, valideynləri, müəllimləri).
func announcementAudience(db *gorm.DB, m *Announcement, except uint) *gorm.DB {
	var roles []string
	var groups, branches []uint
	if len(m.TargetRoles) > 0 {
		json.Unmarshal(m.TargetRoles, &roles)
	}
	groups, branches = jsonIDs(m.TargetGroupIDs), jsonIDs(m.TargetBranchIDs)
	q := db.Model(&EduUser{}).Where("is_active = ? AND status = ? AND role_chosen = ? AND id <> ?", true, StatusActive, true, except)
	if len(roles) > 0 {
		q = q.Where("role IN ?", roles)
	}
	var conds []string
	var args []interface{}
	if len(groups) > 0 {
		inGroups := "SELECT student_id FROM edu_enrollments WHERE group_id IN ? AND status = 'active'"
		conds = append(conds,
			"student_id IN ("+inGroups+")",
			"guardian_id IN (SELECT guardian_id FROM edu_student_guardians WHERE student_id IN ("+inGroups+"))",
			"teacher_id IN (SELECT teacher_id FROM edu_groups WHERE id IN ? AND teacher_id IS NOT NULL)")
		args = append(args, groups, groups, groups)
	}
	if len(branches) > 0 {
		inBranch := "SELECT id FROM edu_students WHERE branch_id IN ?"
		conds = append(conds,
			"branch_id IN ?",
			"student_id IN ("+inBranch+")",
			"guardian_id IN (SELECT guardian_id FROM edu_student_guardians WHERE student_id IN ("+inBranch+"))",
			"teacher_id IN (SELECT id FROM edu_teachers WHERE branch_id IN ?)")
		args = append(args, branches, branches, branches, branches)
	}
	if len(conds) > 0 {
		q = q.Where("("+strings.Join(conds, " OR ")+")", args...)
	}
	return q
}

// ============================================================
// AUDİT JURNALI — kim, nə vaxt, nəyi dəyişdi
// ============================================================

type AuditLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
	UserID    *uint     `json:"user_id" gorm:"index"`
	UserEmail string    `json:"user_email" gorm:"size:255"`
	Action    string    `json:"action" gorm:"size:50;index"`
	Resource  string    `json:"resource" gorm:"size:60;index"`
	RefID     *uint     `json:"ref_id"`
	IP        string    `json:"ip" gorm:"size:64"`
	Detail    string    `json:"detail" gorm:"type:text"`
}

func (AuditLog) TableName() string { return "edu_audit_log" }

func auditAs(c *gin.Context, db *gorm.DB, userID *uint, email, action, resource string, refID *uint, detail string) {
	ip := ""
	if c != nil {
		ip = c.ClientIP()
	}
	background(db).Create(&AuditLog{UserID: userID, UserEmail: email, Action: action, Resource: resource, RefID: refID, IP: ip, Detail: trimTo(detail, 1000)})
}

// audit - cari istifadəçinin adından.
func audit(c *gin.Context, db *gorm.DB, action, resource string, refID *uint, detail string) {
	var uid *uint
	if id := currentUserID(c); id != 0 {
		uid = &id
	}
	auditAs(c, db, uid, c.GetString("userEmail"), action, resource, refID, detail)
}

// noAudit - tez-tez dəyişən, jurnala yazmağa dəyməyən resurslar.
var noAudit = map[string]bool{"notifications": true}

// auditItem - generic CRUD-dan sonra.
func auditItem(c *gin.Context, db *gorm.DB, action, resource string, item interface{}) {
	if noAudit[resource] {
		return
	}
	var ref *uint
	v := reflect.ValueOf(item)
	for v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() == reflect.Struct {
		if f := v.FieldByName("ID"); f.IsValid() && f.Kind() == reflect.Uint {
			id := uint(f.Uint())
			ref = &id
		}
	}
	detail := ""
	for _, name := range []string{"Name", "Title", "Number", "Subject"} {
		if v.Kind() == reflect.Struct {
			if f := v.FieldByName(name); f.IsValid() && f.Kind() == reflect.String && f.String() != "" {
				detail = f.String()
				break
			}
		}
	}
	audit(c, db, action, resource, ref, detail)
}

// GET /sf/audit?action=&resource=&q=&before_id=
func (h *Handler) AuditList(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	c.JSON(200, gin.H{"data": auditRows(db, c.Query("action"), c.Query("resource"), c.Query("q"), parseUint(c.Query("before_id")))})
}

func auditRows(db *gorm.DB, action, resource, q string, beforeID uint) []AuditLog {
	tx := db.Model(&AuditLog{}).Order("id DESC").Limit(200)
	if action != "" {
		tx = tx.Where("action = ?", action)
	}
	if resource != "" {
		tx = tx.Where("resource = ?", resource)
	}
	if s := strings.TrimSpace(q); s != "" {
		tx = tx.Where("user_email ILIKE ? OR detail ILIKE ?", "%"+s+"%", "%"+s+"%")
	}
	if beforeID > 0 {
		tx = tx.Where("id < ?", beforeID)
	}
	rows := []AuditLog{}
	tx.Find(&rows)
	return rows
}
