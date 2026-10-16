package educationcenter

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type planSlot struct {
	SubjectID uint   `json:"subject_id"`
	TeacherID uint   `json:"teacher_id"`
	Weekday   int    `json:"weekday"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	RoomID    *uint  `json:"room_id"`
}

type planInput struct {
	Slots      []planSlot `json:"slots"`
	StudentIDs []uint     `json:"student_ids"`
	Weeks      int        `json:"weeks"`
	StartDate  string     `json:"start_date"`
	Force      bool       `json:"force"`
}

// GET /sf/groups/:id/plan - qrupun hazirki planı (slotlar + şagirdlər)
func (h *Handler) GroupPlanGet(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	gid := c.Param("id")
	slots := make([]ScheduleSlot, 0)
	db.Where("group_id = ? AND is_active = true", gid).Order("weekday, start_time").Find(&slots)
	ids := make([]uint, 0)
	db.Table("edu_enrollments").Where("group_id = ? AND status = 'active'", gid).Pluck("student_id", &ids)
	c.JSON(200, gin.H{"slots": slots, "student_ids": ids})
}

func timesOverlap(a1, a2, b1, b2 string) bool {
	return a1 < b2 && b1 < a2
}

// POST /sf/groups/:id/plan - plani yadda saxla, dersleri avtomatik yarat
func (h *Handler) GroupPlanSave(c *gin.Context) {
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	var gid uint
	fmt.Sscan(c.Param("id"), &gid)
	var grp Group
	if db.First(&grp, gid).Error != nil {
		c.JSON(404, gin.H{"error": "Qrup tapılmadı"})
		return
	}
	var in planInput
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": "Yanlış sorğu"})
		return
	}
	if in.Weeks <= 0 {
		in.Weeks = 16
	}
	if in.Weeks > 60 {
		in.Weeks = 60
	}
	for _, s := range in.Slots {
		if s.Weekday < 1 || s.Weekday > 7 || s.StartTime == "" || s.EndTime == "" || s.StartTime >= s.EndTime {
			c.JSON(400, gin.H{"error": "Gün və saatı düzgün seçin"})
			return
		}
	}
	// müəllim toqquşması
	if !in.Force {
		conflicts := make([]string, 0)
		for _, s := range in.Slots {
			if s.TeacherID == 0 {
				continue
			}
			var others []ScheduleSlot
			db.Where("teacher_id = ? AND weekday = ? AND is_active = true AND group_id <> ?", s.TeacherID, s.Weekday, gid).Find(&others)
			for _, o := range others {
				if timesOverlap(s.StartTime, s.EndTime, o.StartTime, o.EndTime) {
					var t Teacher
					var g Group
					db.First(&t, s.TeacherID)
					db.First(&g, o.GroupID)
					conflicts = append(conflicts, fmt.Sprintf("%s: həftənin %d-ci günü %s–%s (%s qrupu ilə)", t.Name, s.Weekday, o.StartTime, o.EndTime, g.Name))
				}
			}
		}
		if len(conflicts) > 0 {
			c.JSON(409, gin.H{"error": "Müəllim həmin vaxtda başqa qrupda dərs deyir", "conflicts": conflicts})
			return
		}
	}

	start := time.Now()
	if d, ok := parseDate(in.StartDate); ok {
		start = d
	}
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	created := 0

	txErr := db.Transaction(func(tx *gorm.DB) error {
		// slotlar
		if err := tx.Unscoped().Where("group_id = ?", gid).Delete(&ScheduleSlot{}).Error; err != nil {
			return err
		}
		saved := make([]ScheduleSlot, 0)
		for _, s := range in.Slots {
			sl := ScheduleSlot{GroupID: gid, Weekday: s.Weekday, StartTime: s.StartTime, EndTime: s.EndTime, RoomID: s.RoomID, IsActive: true}
			if s.SubjectID != 0 {
				v := s.SubjectID
				sl.SubjectID = &v
			}
			if s.TeacherID != 0 {
				v := s.TeacherID
				sl.TeacherID = &v
			}
			if err := tx.Create(&sl).Error; err != nil {
				return err
			}
			saved = append(saved, sl)
		}
		// şagirdlər
		var cur []Enrollment
		tx.Where("group_id = ?", gid).Find(&cur)
		want := map[uint]bool{}
		for _, id := range in.StudentIDs {
			want[id] = true
		}
		have := map[uint]*Enrollment{}
		for i := range cur {
			have[cur[i].StudentID] = &cur[i]
		}
		now := time.Now()
		for id := range want {
			if e, ok := have[id]; ok {
				if e.Status != "active" {
					tx.Model(&Enrollment{}).Where("id = ?", e.ID).Updates(map[string]interface{}{"status": "active", "left_at": nil})
				}
			} else if err := tx.Create(&Enrollment{StudentID: id, GroupID: gid, JoinedAt: now, Status: "active"}).Error; err != nil {
				return err
			}
		}
		for id, e := range have {
			if !want[id] && e.Status == "active" {
				tx.Model(&Enrollment{}).Where("id = ?", e.ID).Updates(map[string]interface{}{"status": "left", "left_at": now})
			}
		}
		// köhnə gələcək dərslər (davamiyyəti olmayan)
		tx.Where("group_id = ? AND date >= ? AND status = 'scheduled' AND id NOT IN (SELECT lesson_id FROM edu_attendance)", gid, start).Delete(&Lesson{})
		// yeni dərslər
		for _, sl := range saved {
			for w := 0; w < in.Weeks*7; w++ {
				d := start.AddDate(0, 0, w)
				if isoWeekday(d) != sl.Weekday {
					continue
				}
				var n int64
				tx.Model(&Lesson{}).Where("group_id = ? AND date = ? AND start_time = ?", gid, d, sl.StartTime).Count(&n)
				if n > 0 {
					continue
				}
				id := sl.ID
				l := Lesson{GroupID: gid, ScheduleSlotID: &id, SubjectID: sl.SubjectID, TeacherID: sl.TeacherID, RoomID: sl.RoomID,
					Date: d, StartTime: sl.StartTime, EndTime: sl.EndTime, Status: "scheduled"}
				if err := tx.Create(&l).Error; err != nil {
					return err
				}
				created++
			}
		}
		return nil
	})
	if txErr != nil {
		c.JSON(500, gin.H{"error": "Saxlanmadı: " + txErr.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true, "lessons_created": created})
}
