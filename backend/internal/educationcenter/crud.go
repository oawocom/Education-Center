package educationcenter

import (
	"log"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// HANDLER
// ============================================================

type Handler struct {
	getDB func(uint) (*gorm.DB, error)
}

func NewHandler(getDB func(uint) (*gorm.DB, error)) *Handler {
	return &Handler{getDB: getDB}
}

var migratedTenants sync.Map

// tenantDB - the centre's own database. Once per process for each centre
// Prepare brings it up to date, so new columns and tables (grade, homework,
// media, code ...) appear with the first request after an update.
func (h *Handler) tenantDB(c *gin.Context) (*gorm.DB, error) {
	tenantID := c.MustGet("tenantID").(uint)
	db, err := h.getDB(tenantID)
	if err != nil {
		return nil, err
	}
	if _, done := migratedTenants.LoadOrStore(tenantID, true); !done {
		if merr := Prepare(db, tenantID); merr != nil {
			log.Printf("[education-center] prepare tenant %d: %v", tenantID, merr)
			migratedTenants.Delete(tenantID)
		}
	}
	return db, nil
}

// ============================================================
// GENERIC CRUD
//
// Meqsed: her resurs ucun List/Get/Create/Update/Delete/Archive
// elden yazilmasin. Yeni resurs elave etmek = routes.go-da 1 setir:
//
//	RegisterCRUD(sf, h, Resource[Student]{
//	    Name: "students", Perm: "students",
//	    Searchable: []string{"name", "email", "phone"},
//	    Filters:    []string{"branch_id", "status"},
//	    Archivable: true,
//	    Scope:      scopeStudent,
//	})
//
// Xususi davranis lazim olanda Before*/After* hook-lari isledilir,
// bu hallarda da CRUD-un qalan hissesi tekrar yazilmir.
// ============================================================

type Resource[T any] struct {
	// Name - route seqmenti, mes. "students" -> /sf/students
	Name string

	// Perm - icaze matrisindeki acar (bos olsa Name isledilir)
	Perm string

	// Scope - rola gore setir filtri (muellim yalniz oz qruplarini gorur ve s.)
	// nil olsa filtr tetbiq edilmir.
	Scope func(c *gin.Context, db *gorm.DB) *gorm.DB

	// Searchable - ?q= ucun ILIKE axtarilacaq sutunlar
	Searchable []string

	// Filters - ?sutun=deyer seklinde icaze verilen sutunlar (ag siyahi)
	Filters []string

	// Preload - GORM elaqe yuklemeleri
	Preload []string

	// DefaultOrder - bos olsa "id DESC"
	DefaultOrder string

	// Sortable - ?sort= ucun icaze verilen sutunlar
	Sortable []string

	// Archivable - modelde is_archived varsa true. Siyahida default gizledilir.
	Archivable bool

	// DateField - ?date_from= / ?date_to= hansi sutuna tetbiq olunsun.
	// Bos olsa tarix araligi filtri UMUMIYYETLE tetbiq edilmir.
	// (Evvel butun resurslara "date" sutunu ile tetbiq olunurdu ve
	//  bele sutunu olmayan resurslarda 500 xetasi verirdi.)
	DateField string

	// ReadOnly - yalniz GET route-lari acilir
	ReadOnly bool

	// Hook-lar (nil ola biler)
	BeforeCreate func(c *gin.Context, db *gorm.DB, m *T) error
	AfterCreate  func(c *gin.Context, db *gorm.DB, m *T) error
	BeforeUpdate func(c *gin.Context, db *gorm.DB, m *T, patch map[string]interface{}) error
	AfterUpdate  func(c *gin.Context, db *gorm.DB, m *T) error
	BeforeDelete func(c *gin.Context, db *gorm.DB, m *T) error
}

// RegisterCRUD - resursun butun route-larini qeydiyyata alir.
func RegisterCRUD[T any](rg *gin.RouterGroup, h *Handler, r Resource[T]) {
	perm := r.Perm
	if perm == "" {
		perm = r.Name
	}
	allowed := writableFields[T]()

	g := rg.Group("/" + r.Name)

	g.GET("", RequirePerm(perm, ActionRead), func(c *gin.Context) { crudList(c, h, r) })
	g.GET("/:id", RequirePerm(perm, ActionRead), func(c *gin.Context) { crudGet(c, h, r) })

	if r.ReadOnly {
		return
	}

	g.POST("", RequirePerm(perm, ActionCreate), func(c *gin.Context) { crudCreate(c, h, r) })
	g.PUT("/:id", RequirePerm(perm, ActionUpdate), func(c *gin.Context) { crudUpdate(c, h, r, allowed) })
	g.DELETE("/:id", RequirePerm(perm, ActionDelete), func(c *gin.Context) { crudDelete(c, h, r) })

	if r.Archivable {
		g.PUT("/:id/archive", RequirePerm(perm, ActionUpdate), func(c *gin.Context) { crudArchive(c, h, r, true) })
		g.PUT("/:id/restore", RequirePerm(perm, ActionUpdate), func(c *gin.Context) { crudArchive(c, h, r, false) })
	}
}

// ============================================================
// LIST
// ============================================================

type ListResponse struct {
	Data    interface{} `json:"data"`
	Total   int64       `json:"total"`
	Page    int         `json:"page"`
	PerPage int         `json:"per_page"`
}

func crudList[T any](c *gin.Context, h *Handler, r Resource[T]) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var model T
	q := db.Model(&model)

	if r.Scope != nil {
		q = r.Scope(c, q)
	}

	// Arxiv: default gizli, ?archived=1 ile gorsenir, ?archived=all ile hamisi
	if r.Archivable {
		switch c.Query("archived") {
		case "1", "true":
			q = q.Where("is_archived = ?", true)
		case "all":
			// filtr yoxdur
		default:
			q = q.Where("is_archived = ?", false)
		}
	}

	// Ag siyahi filtrler
	for _, f := range r.Filters {
		if v := c.Query(f); v != "" {
			if v == "null" {
				q = q.Where(f + " IS NULL")
			} else {
				q = q.Where(f+" = ?", v)
			}
		}
	}

	// Tarix araligi: ?date_from= & ?date_to= — yalniz DateField teyin olunmus resurslarda
	if r.DateField != "" {
		if from := c.Query("date_from"); from != "" {
			q = q.Where(r.DateField+" >= ?", from)
		}
		if to := c.Query("date_to"); to != "" {
			q = q.Where(r.DateField+" <= ?", to)
		}
	}

	// Axtaris
	if term := strings.TrimSpace(c.Query("q")); term != "" && len(r.Searchable) > 0 {
		like := "%" + term + "%"
		conds := make([]string, 0, len(r.Searchable))
		args := make([]interface{}, 0, len(r.Searchable))
		for _, col := range r.Searchable {
			conds = append(conds, col+" ILIKE ?")
			args = append(args, like)
		}
		q = q.Where(strings.Join(conds, " OR "), args...)
	}

	var total int64
	q.Count(&total)

	// Siralama
	order := r.DefaultOrder
	if order == "" {
		order = "id DESC"
	}
	if s := c.Query("sort"); s != "" && contains(r.Sortable, s) {
		dir := "ASC"
		if strings.EqualFold(c.Query("order"), "desc") {
			dir = "DESC"
		}
		order = s + " " + dir
	}
	q = q.Order(order)

	// Sehifeleme (per_page=0 -> hamisi)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if perPage > 500 {
		perPage = 500
	}
	if perPage > 0 {
		q = q.Offset((page - 1) * perPage).Limit(perPage)
	}

	for _, p := range r.Preload {
		q = q.Preload(p)
	}

	items := make([]T, 0)
	if err := q.Find(&items).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, ListResponse{Data: items, Total: total, Page: page, PerPage: perPage})
}

// ============================================================
// GET / CREATE / UPDATE / DELETE / ARCHIVE
// ============================================================

func crudGet[T any](c *gin.Context, h *Handler, r Resource[T]) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var model T
	q := db.Model(&model)
	if r.Scope != nil {
		q = r.Scope(c, q)
	}
	for _, p := range r.Preload {
		q = q.Preload(p)
	}

	var item T
	if err := q.Where("id = ?", c.Param("id")).First(&item).Error; err != nil {
		c.JSON(404, gin.H{"error": "Tapilmadi"})
		return
	}
	c.JSON(200, item)
}

func crudCreate[T any](c *gin.Context, h *Handler, r Resource[T]) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var item T
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if r.BeforeCreate != nil {
		if err := r.BeforeCreate(c, db, &item); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
	}

	if err := db.Create(&item).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if r.AfterCreate != nil {
		if err := r.AfterCreate(c, db, &item); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(201, item)
}

func crudUpdate[T any](c *gin.Context, h *Handler, r Resource[T], allowed map[string]string) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var model T
	q := db.Model(&model)
	if r.Scope != nil {
		q = r.Scope(c, q)
	}

	var item T
	if err := q.Where("id = ?", c.Param("id")).First(&item).Error; err != nil {
		c.JSON(404, gin.H{"error": "Tapilmadi"})
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Yalniz ag siyahidaki sahelere icaze — id, created_at, password_hash kimi
	// saheler kenar sorgu ile deyisdirile bilmez.
	patch := make(map[string]interface{}, len(raw))
	for k, v := range raw {
		if col, ok := allowed[k]; ok {
			patch[col] = v
		}
	}
	if len(patch) == 0 {
		c.JSON(400, gin.H{"error": "Deyisdirilecek sahe yoxdur"})
		return
	}

	if r.BeforeUpdate != nil {
		if err := r.BeforeUpdate(c, db, &item, patch); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
	}

	if err := db.Model(&item).Updates(patch).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	db.Where("id = ?", c.Param("id")).First(&item)

	if r.AfterUpdate != nil {
		if err := r.AfterUpdate(c, db, &item); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(200, item)
}

func crudDelete[T any](c *gin.Context, h *Handler, r Resource[T]) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var model T
	q := db.Model(&model)
	if r.Scope != nil {
		q = r.Scope(c, q)
	}

	var item T
	if err := q.Where("id = ?", c.Param("id")).First(&item).Error; err != nil {
		c.JSON(404, gin.H{"error": "Tapilmadi"})
		return
	}

	if r.BeforeDelete != nil {
		if err := r.BeforeDelete(c, db, &item); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
	}

	if err := db.Delete(&item).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func crudArchive[T any](c *gin.Context, h *Handler, r Resource[T], archive bool) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}

	var model T
	q := db.Model(&model)
	if r.Scope != nil {
		q = r.Scope(c, q)
	}

	var item T
	if err := q.Where("id = ?", c.Param("id")).First(&item).Error; err != nil {
		c.JSON(404, gin.H{"error": "Tapilmadi"})
		return
	}

	patch := map[string]interface{}{"is_archived": archive}
	if archive {
		patch["archived_at"] = nowPtr()
	} else {
		patch["archived_at"] = nil
	}

	if err := db.Model(&item).Updates(patch).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "is_archived": archive})
}

// ============================================================
// KOMEKCILER
// ============================================================

// writableFields - struct-in json tag -> DB sutun adi xeritesi.
// Qorunan saheler (id, tarixler, password_hash) siyahiya dusmur.
func writableFields[T any]() map[string]string {
	protected := map[string]bool{
		"id": true, "created_at": true, "updated_at": true,
		"password_hash": true, "tenant_id": true, "-": true, "": true,
	}
	out := map[string]string{}
	var m T
	collectFields(reflect.TypeOf(m), out, protected)
	return out
}

func collectFields(t reflect.Type, out map[string]string, protected map[string]bool) {
	if t == nil {
		return
	}
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return
	}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.Anonymous {
			collectFields(f.Type, out, protected)
			continue
		}
		jsonTag := strings.Split(f.Tag.Get("json"), ",")[0]
		if protected[jsonTag] {
			continue
		}
		col := columnFromTag(f.Tag.Get("gorm"))
		if col == "" {
			col = toSnake(f.Name)
		}
		if protected[col] {
			continue
		}
		out[jsonTag] = col
	}
}

func columnFromTag(tag string) string {
	for _, part := range strings.Split(tag, ";") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(strings.ToLower(p), "column:") {
			return strings.TrimSpace(p[7:])
		}
	}
	return ""
}

func toSnake(s string) string {
	var b strings.Builder
	runes := []rune(s)
	for i, r := range runes {
		if r >= 'A' && r <= 'Z' {
			// ID -> id, GroupID -> group_id, XPReward -> xp_reward
			if i > 0 && (runes[i-1] < 'A' || runes[i-1] > 'Z') {
				b.WriteByte('_')
			} else if i > 0 && i+1 < len(runes) && runes[i+1] >= 'a' && runes[i+1] <= 'z' {
				b.WriteByte('_')
			}
			b.WriteRune(r + 32)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func nowPtr() *time.Time {
	t := time.Now()
	return &t
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
