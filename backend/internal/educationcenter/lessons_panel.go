package educationcenter

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
)

// ============================================================
// Müəllim "Dərslər" paneli: siyahı, detal, ev tapşırığı
// ============================================================

type LessonOverviewRow struct {
	ID          uint      `json:"id"`
	Date        time.Time `json:"date"`
	StartTime   string    `json:"start_time"`
	EndTime     string    `json:"end_time"`
	GroupID     uint      `json:"group_id"`
	GroupName   string    `json:"group_name"`
	SubjectName string    `json:"subject_name"`
	Topic       string    `json:"topic"`
	RawStatus   string    `json:"-"`
	Status      string    `json:"status"` // planned | ongoing | completed | cancelled
	Total       int       `json:"total"`
	Attended    int       `json:"attended"`
	Absent      int       `json:"absent"`
	Pending     int       `json:"pending"`
	HwStatus    string    `json:"hw_status"` // none | draft | published
	HwSubmitted int       `json:"hw_submitted"`
	HwTotal     int       `json:"hw_total"`
}

var bakuLoc = time.FixedZone("AZT", 4*3600)

func lessonStatus(raw string, date time.Time, st, en string) string {
	switch raw {
	case "cancelled":
		return "cancelled"
	case "held":
		return "completed"
	}
	d := date.UTC()
	mk := func(hm string) time.Time {
		t, err := time.Parse("15:04", hm)
		if err != nil {
			return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, bakuLoc)
		}
		return time.Date(d.Year(), d.Month(), d.Day(), t.Hour(), t.Minute(), 0, 0, bakuLoc)
	}
	now := time.Now()
	s, e := mk(st), mk(en)
	if en == "" {
		e = s.Add(time.Hour)
	}
	if now.Before(s) {
		return "planned"
	}
	if now.Before(e) {
		return "ongoing"
	}
	return "completed"
}

func hwStatusOf(pub, total int) string {
	if total == 0 {
		return "none"
	}
	if pub > 0 {
		return "published"
	}
	return "draft"
}

// GET /sf/lessons-overview?from&to&group_id&status&attendance&homework&q
func (h *Handler) LessonsOverview(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	now := time.Now()
	from, e1 := time.Parse("2006-01-02", c.Query("from"))
	to, e2 := time.Parse("2006-01-02", c.Query("to"))
	if e1 != nil || e2 != nil {
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		to = from.AddDate(0, 1, -1)
	}
	to = to.AddDate(0, 0, 1)

	q := scopeLessons(c, db.Table("edu_lessons")).Where("edu_lessons.date >= ? AND edu_lessons.date < ?", from, to)
	if g := c.Query("group_id"); g != "" {
		q = q.Where("edu_lessons.group_id = ?", g)
	}
	if s := strings.TrimSpace(c.Query("q")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where("(LOWER(g.name) LIKE ? OR LOWER(COALESCE(sub.name,'')) LIKE ? OR LOWER(edu_lessons.topic) LIKE ?)", like, like, like)
	}
	rows := make([]LessonOverviewRow, 0)
	q.Select(`edu_lessons.id, edu_lessons.date, edu_lessons.start_time, edu_lessons.end_time, edu_lessons.group_id, g.name AS group_name,
		COALESCE(sub.name, '') AS subject_name, edu_lessons.topic, edu_lessons.status AS raw_status,
		(SELECT COUNT(*) FROM edu_enrollments e WHERE e.group_id = edu_lessons.group_id AND e.status = 'active') AS total,
		(SELECT COUNT(*) FROM edu_attendance a WHERE a.lesson_id = edu_lessons.id AND a.status IN ('present','late')) AS attended,
		(SELECT COUNT(*) FROM edu_attendance a WHERE a.lesson_id = edu_lessons.id AND a.status IN ('absent','excused')) AS absent`).
		Joins("JOIN edu_groups g ON g.id = edu_lessons.group_id").
		Joins("LEFT JOIN edu_subjects sub ON sub.id = COALESCE(edu_lessons.subject_id, g.subject_id)").
		Order("edu_lessons.date ASC, edu_lessons.start_time ASC").Scan(&rows)

	// ev tapşırıqları
	type hw struct {
		LessonID  uint
		Total     int
		Published int
	}
	hws := []hw{}
	ids := make([]uint, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	if len(ids) > 0 {
		db.Raw(`SELECT lesson_id, COUNT(*) AS total, SUM(CASE WHEN is_published THEN 1 ELSE 0 END) AS published
			FROM edu_assignments WHERE lesson_id IN ? AND deleted_at IS NULL GROUP BY lesson_id`, ids).Scan(&hws)
	}
	hm := map[uint]hw{}
	for _, x := range hws {
		hm[x.LessonID] = x
	}
	fStatus, fAtt, fHw := c.Query("status"), c.Query("attendance"), c.Query("homework")
	out := make([]LessonOverviewRow, 0, len(rows))
	for _, r := range rows {
		r.Pending = r.Total - r.Attended - r.Absent
		if r.Pending < 0 {
			r.Pending = 0
		}
		r.Status = lessonStatus(r.RawStatus, r.Date, r.StartTime, r.EndTime)
		x := hm[r.ID]
		r.HwStatus = hwStatusOf(x.Published, x.Total)
		if fStatus != "" && r.Status != fStatus {
			continue
		}
		if fHw != "" && r.HwStatus != fHw {
			continue
		}
		switch fAtt {
		case "has_absent":
			if r.Absent == 0 {
				continue
			}
		case "unmarked":
			if r.Pending == 0 {
				continue
			}
		case "all_present":
			if r.Total == 0 || r.Attended != r.Total {
				continue
			}
		}
		out = append(out, r)
	}
	c.JSON(200, gin.H{"data": out})
}

type hwOut struct {
	ID          uint            `json:"id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	DueDate     *time.Time      `json:"due_date"`
	IsPublished bool            `json:"is_published"`
	Status      string          `json:"status"`
	Attachments json.RawMessage `json:"attachments"`
	StudentIDs  []uint          `json:"student_ids"`
	Total       int             `json:"total"`
	Submitted   int             `json:"submitted"`
	Students    []hwStudent     `json:"students"`
}
type hwStudent struct {
	StudentID   uint       `json:"student_id"`
	Name        string     `json:"name"`
	Status      string     `json:"status"` // pending | submitted | late | graded
	SubmittedAt *time.Time `json:"submitted_at"`
}


// GET /sf/lessons-overview/:id
func (h *Handler) LessonDetail(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var l Lesson
	if scopeLessons(c, db.Model(&Lesson{})).Where("id = ?", c.Param("id")).First(&l).Error != nil {
		c.JSON(404, gin.H{"error": "Dərs tapılmadı"})
		return
	}
	var info struct {
		GroupName   string
		SubjectName string
	}
	db.Raw(`SELECT g.name AS group_name, COALESCE(sub.name,'') AS subject_name FROM edu_groups g
		LEFT JOIN edu_subjects sub ON sub.id = COALESCE(?, g.subject_id) WHERE g.id = ?`, l.SubjectID, l.GroupID).Scan(&info)

	type stu struct {
		StudentID uint   `json:"student_id"`
		Name      string `json:"name"`
		Status    string `json:"status"`
		Category  string `json:"category"` // attended | absent | expected
	}
	students := make([]stu, 0)
	db.Raw(`SELECT s.id AS student_id, s.name, COALESCE(a.status,'') AS status
		FROM edu_enrollments e JOIN edu_students s ON s.id = e.student_id
		LEFT JOIN edu_attendance a ON a.student_id = s.id AND a.lesson_id = ?
		WHERE e.group_id = ? AND e.status = 'active' ORDER BY s.name`, l.ID, l.GroupID).Scan(&students)
	att, abs, exp := 0, 0, 0
	for i := range students {
		switch students[i].Status {
		case "present", "late":
			students[i].Category = "attended"
			att++
		case "absent", "excused":
			students[i].Category = "absent"
			abs++
		default:
			students[i].Category = "expected"
			exp++
		}
	}
	pct := 0
	if att+abs > 0 {
		pct = att * 100 / (att + abs)
	}

	var as []Assignment
	db.Where("lesson_id = ?", l.ID).Order("id").Find(&as)
	hws := make([]hwOut, 0, len(as))
	for _, a := range as {
		o := hwOut{ID: a.ID, Title: a.Title, Description: a.Description, DueDate: a.DueDate, IsPublished: a.IsPublished,
			Attachments: json.RawMessage(a.Attachments), StudentIDs: []uint{}}
		if a.IsPublished {
			o.Status = "published"
		} else {
			o.Status = "draft"
		}
		if len(a.StudentIDs) > 0 {
			json.Unmarshal(a.StudentIDs, &o.StudentIDs)
		}
		target := map[uint]bool{}
		for _, id := range o.StudentIDs {
			target[id] = true
		}
		subs := map[uint]AssignmentSubmission{}
		var sl []AssignmentSubmission
		db.Where("assignment_id = ?", a.ID).Find(&sl)
		for _, s := range sl {
			subs[s.StudentID] = s
		}
		o.Students = []hwStudent{}
		for _, s := range students {
			if len(target) > 0 && !target[s.StudentID] {
				continue
			}
			hs := hwStudent{StudentID: s.StudentID, Name: s.Name, Status: "pending"}
			if sub, ok := subs[s.StudentID]; ok && sub.Status != "" && sub.Status != "pending" {
				hs.Status, hs.SubmittedAt = sub.Status, sub.SubmittedAt
				o.Submitted++
			}
			o.Students = append(o.Students, hs)
		}
		o.Total = len(o.Students)
		hws = append(hws, o)
	}
	c.JSON(200, gin.H{
		"lesson": gin.H{"id": l.ID, "date": l.Date, "start_time": l.StartTime, "end_time": l.EndTime, "group_id": l.GroupID,
			"group_name": info.GroupName, "subject_name": info.SubjectName, "topic": l.Topic,
			"status": lessonStatus(l.Status, l.Date, l.StartTime, l.EndTime)},
		"students": students,
		"stats":    gin.H{"total": len(students), "attended": att, "absent": abs, "expected": exp, "percent": pct},
		"homework": hws,
	})
}

// POST /sf/lessons-overview/:id/homework
func (h *Handler) LessonHomeworkSave(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var l Lesson
	if scopeLessons(c, db.Model(&Lesson{})).Where("id = ?", c.Param("id")).First(&l).Error != nil {
		c.JSON(404, gin.H{"error": "Dərs tapılmadı"})
		return
	}
	var in struct {
		ID          uint            `json:"id"`
		Title       string          `json:"title"`
		Description string          `json:"description"`
		DueDate     string          `json:"due_date"`
		StudentIDs  []uint          `json:"student_ids"`
		Attachments json.RawMessage `json:"attachments"`
		Publish     bool            `json:"publish"`
	}
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.Title) == "" {
		c.JSON(400, gin.H{"error": "Tapşırığın adını yazın"})
		return
	}
	var due *time.Time
	if in.DueDate != "" {
		t, err := time.ParseInLocation("2006-01-02T15:04", in.DueDate, bakuLoc)
		if err != nil {
			if d, ok := parseDate(in.DueDate); ok {
				t = d
			} else {
				c.JSON(400, gin.H{"error": "Son tarix düzgün deyil"})
				return
			}
		}
		due = &t
	}
	// yalnız qrupun şagirdləri
	valid := make([]uint, 0)
	if len(in.StudentIDs) > 0 {
		db.Table("edu_enrollments").Where("group_id = ? AND status = 'active' AND student_id IN ?", l.GroupID, in.StudentIDs).Pluck("student_id", &valid)
	}
	sidJSON, _ := json.Marshal(valid)
	var att datatypes.JSON
	if len(in.Attachments) > 0 {
		att = datatypes.JSON(in.Attachments)
	}
	a := Assignment{}
	if in.ID != 0 {
		if db.Where("id = ? AND lesson_id = ?", in.ID, l.ID).First(&a).Error != nil {
			c.JSON(404, gin.H{"error": "Tapşırıq tapılmadı"})
			return
		}
	}
	a.GroupID, a.LessonID = l.GroupID, &l.ID
	if tid := currentTeacherID(c); tid != 0 {
		a.TeacherID = &tid
	}
	a.Title, a.Description, a.DueDate = strings.TrimSpace(in.Title), in.Description, due
	a.IsPublished = in.Publish
	a.StudentIDs = datatypes.JSON(sidJSON)
	if att != nil {
		a.Attachments = att
	}
	if a.MaxPoints == 0 {
		a.MaxPoints = 100
	}
	var serr error
	if a.ID == 0 {
		serr = db.Create(&a).Error
	} else {
		serr = db.Save(&a).Error
	}
	if serr != nil {
		c.JSON(500, gin.H{"error": fmt.Sprint("Saxlanmadı: ", serr)})
		return
	}
	c.JSON(200, gin.H{"ok": true, "id": a.ID})
}

// DELETE /sf/homework/:id
func (h *Handler) LessonHomeworkDelete(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var a Assignment
	if scopeAssignments(c, db.Model(&Assignment{})).Where("id = ? AND lesson_id IS NOT NULL", c.Param("id")).First(&a).Error != nil {
		c.JSON(404, gin.H{"error": "Tapşırıq tapılmadı"})
		return
	}
	db.Where("assignment_id = ?", a.ID).Delete(&AssignmentSubmission{})
	db.Delete(&a)
	c.JSON(200, gin.H{"ok": true})
}
