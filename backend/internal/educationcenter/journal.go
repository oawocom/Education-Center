package educationcenter

import (
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// GUNDELIK / HEFTELIK CEDVEL (mekteb gundeliyi kimi)
// GET /sf/journal?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Her ders: vaxt, qrup, fenn, muellim, MOVZU, EV TAPSHIRIGI.
// Sagird/valideyn ucun elave: davamiyyet statusu ve qiymet (1-10).
// Rol uzre gorunurluk scopeLessons ile hell olunur.
// ============================================================

type JournalRow struct {
	ID          uint      `json:"id"`
	Date        time.Time `json:"date"`
	StartTime   string    `json:"start_time"`
	EndTime     string    `json:"end_time"`
	GroupID     uint      `json:"group_id"`
	GroupName   string    `json:"group_name"`
	SubjectName string    `json:"subject_name"`
	TeacherName string    `json:"teacher_name"`
	RoomName    string    `json:"room_name"`
	Topic       string    `json:"topic"`
	Homework    string    `json:"homework"`
	Status      string    `json:"status"`
	// yalniz sagird / valideyn ucun
	StudentID   *uint   `json:"student_id,omitempty"`
	StudentName string  `json:"student_name,omitempty"`
	Attendance  *string `json:"attendance,omitempty"`
	Grade       *int    `json:"grade,omitempty"`
}

func (h *Handler) Journal(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	now := time.Now()
	from, err1 := time.Parse("2006-01-02", c.Query("from"))
	to, err2 := time.Parse("2006-01-02", c.Query("to"))
	if err1 != nil || err2 != nil {
		wd := int(now.Weekday()+6) % 7 // Bazar ertesi = 0
		from = time.Date(now.Year(), now.Month(), now.Day()-wd, 0, 0, 0, 0, now.Location())
		to = from.AddDate(0, 0, 6)
	}
	to = to.AddDate(0, 0, 1) // daxil

	base := scopeLessons(c, db.Table("edu_lessons")).
		Where("edu_lessons.date >= ? AND edu_lessons.date < ?", from, to)
	if gid := c.Query("group_id"); gid != "" {
		base = base.Where("edu_lessons.group_id = ?", gid)
	}

	rows := make([]JournalRow, 0)
	q := base.
		Select(`edu_lessons.id, edu_lessons.date, edu_lessons.start_time, edu_lessons.end_time, edu_lessons.group_id, g.name AS group_name,
			COALESCE(sub.name, '') AS subject_name, COALESCE(t.name, '') AS teacher_name,
			COALESCE(r.name, '') AS room_name, edu_lessons.topic, edu_lessons.homework, edu_lessons.status`).
		Joins("JOIN edu_groups g ON g.id = edu_lessons.group_id").
		Joins("LEFT JOIN edu_subjects sub ON sub.id = COALESCE(edu_lessons.subject_id, g.subject_id)").
		Joins("LEFT JOIN edu_teachers t ON t.id = COALESCE(edu_lessons.teacher_id, g.teacher_id)").
		Joins("LEFT JOIN edu_rooms r ON r.id = edu_lessons.room_id").
		Order("edu_lessons.date ASC, edu_lessons.start_time ASC")
	q.Scan(&rows)

	// Sagird / valideyn: ders ustune davamiyyet + qiymet
	role := currentRole(c)
	var studentIDs []uint
	switch role {
	case RoleStudent:
		if id := currentStudentID(c); id != 0 {
			studentIDs = []uint{id}
		}
	case RoleGuardian:
		db.Table("edu_student_guardians").Where("guardian_id = ?", currentGuardianID(c)).Pluck("student_id", &studentIDs)
	}
	if len(studentIDs) > 0 && len(rows) > 0 {
		ids := make([]uint, 0, len(rows))
		for _, r := range rows {
			ids = append(ids, r.ID)
		}
		type att struct {
			LessonID  uint
			StudentID uint
			Status    string
			Grade     *int
			Name      string
		}
		var as []att
		db.Table("edu_attendance a").Select("a.lesson_id, a.student_id, a.status, a.grade, s.name").
			Joins("JOIN edu_students s ON s.id = a.student_id").
			Where("a.lesson_id IN ? AND a.student_id IN ?", ids, studentIDs).Scan(&as)
		by := map[uint]att{}
		for _, a := range as {
			by[a.LessonID] = a // bir nece usaq varsa sonuncu; asagida duzelir
		}
		if len(studentIDs) == 1 {
			for i := range rows {
				sid := studentIDs[0]
				rows[i].StudentID = &sid
				if a, ok := by[rows[i].ID]; ok {
					st := a.Status
					rows[i].Attendance = &st
					rows[i].Grade = a.Grade
					rows[i].StudentName = a.Name
				}
			}
		} else {
			out := make([]JournalRow, 0, len(rows))
			for _, r := range rows {
				for _, a := range as {
					if a.LessonID == r.ID {
						rr := r
						sid := a.StudentID
						st := a.Status
						rr.StudentID, rr.Attendance, rr.Grade, rr.StudentName = &sid, &st, a.Grade, a.Name
						out = append(out, rr)
					}
				}
			}
			rows = out
		}
	}
	c.JSON(200, gin.H{"data": rows, "from": from.Format("2006-01-02"), "to": to.AddDate(0, 0, -1).Format("2006-01-02")})
}
// ui-hubs v2 1791362399
// plan-v1 1791365938
// lessons-panel 1791726495
