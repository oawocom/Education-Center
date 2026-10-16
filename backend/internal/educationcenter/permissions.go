package educationcenter

import (
	"encoding/json"

	"github.com/gin-gonic/gin"
)

// ============================================================
// ICAZE SISTEMI
//
// Prinsip: rol mehdudiyyetleri KOD deyil, DATA-dir.
// Yeni rol elave etmek = PermissionMatrix-e bir setir.
// Handler-lerin icinde "if role == ..." yazilmir.
//
// Iki seviyye var:
//  1. Baza rol      -> PermissionMatrix (asagida)
//  2. Alt rol       -> edu_sub_roles.permissions (JSONB, DB-den)
//
// Alt rol yalniz DARALDA biler, genislede bilmez.
// Effektiv icaze = baza rol ∩ alt rol
// ============================================================

const (
	ActionRead   = "read"
	ActionCreate = "create"
	ActionUpdate = "update"
	ActionDelete = "delete"
)

const (
	RoleAdmin    = "admin"
	RoleTeacher  = "teacher"
	RoleStudent  = "student"
	RoleGuardian = "guardian"
)

// Qisa yollar
var (
	permR    = []string{ActionRead}
	permRC   = []string{ActionRead, ActionCreate}
	permRW   = []string{ActionRead, ActionCreate, ActionUpdate}
	permFull = []string{ActionRead, ActionCreate, ActionUpdate, ActionDelete}
)

// ResourceAll - admin ucun bir yerde butun resurslar
const ResourceAll = "*"

// PermissionMatrix - rol -> resurs -> icazeli emeliyyatlar.
// Resurs adlari route seqmentleri ile EYNI olmalidir (mes. "schedule-slots").
var PermissionMatrix = map[string]map[string][]string{

	// --- ADMIN: her seye tam giris ---
	RoleAdmin: {
		ResourceAll: permFull,
	},

	// --- MUELLIM ---
	// Setir seviyyesinde mehdudiyyet (yalniz oz qruplari) Scope funksiyalari ile
	// tetbiq olunur, burada yalniz EMELIYYAT seviyyesi tenzimlenir.
	RoleTeacher: {
		// Sorgu ucun lazim olan sorgu kitabcalari
		"branches": permR,
		"rooms":    permR,
		"subjects": permR,
		"levels":   permR,
		"skills":   permR,

		// Insanlar
		"teachers":  permR,
		"students":  permR,
		"guardians": permR,

		// Tedris
		"groups":               permR,
		"enrollments":          permR,
		"schedule-slots":       permR,
		"teacher-availability": permFull,
		"lessons":              permRW,
		"attendance":           permFull,

		// Qiymetlendirme
		"exams":             permFull,
		"questions":         permFull,
		"exam-submissions":  permRW,
		"answers":           permRW,
		"skill-scores":      permFull,
		"placement-results": permR,

		// Kurs materiali
		"syllabus-weeks":         permFull,
		"materials":              permFull,
		"assignments":            permFull,
		"assignment-submissions": permRW,

		// Kommunikasiya
		"messages":      permRC,
		"announcements": permR,
		"notifications": permRW,

		// Motivasiya
		"xp-events":            permRC,
		"achievements":         permR,
		"student-achievements": permR,

		// Maliyye — muellimin girisi YOXDUR (matrisde yer almir)
	},

	// --- SAGIRD ---
	RoleStudent: {
		"subjects": permR,
		"levels":   permR,
		"skills":   permR,
		"teachers": permR,

		"groups":         permR,
		"enrollments":    permR,
		"schedule-slots": permR,
		"lessons":        permR,
		"attendance":     permR,

		"exams":            permR,
		"exam-submissions": permR, // yazma exam_play.go-dakı /exams/:id/start,/submit ile - generic CRUD-dan deyil
		"answers":          permR,
		"skill-scores":     permR,

		"syllabus-weeks":         permR,
		"materials":              permR,
		"assignments":            permR,
		"assignment-submissions": permRW,

		"messages":      permRC,
		"announcements": permR,
		"notifications": permRW,

		"xp-events":            permR,
		"achievements":         permR,
		"student-achievements": permR,

		"invoices": permR,
	},

	// --- VALIDEYN ---
	RoleGuardian: {
		"subjects": permR,
		"levels":   permR,
		"teachers": permR,
		"skills":   permR,

		"students":       permR,
		"groups":         permR,
		"schedule-slots": permR,
		"lessons":        permR,
		"attendance":     permR,

		"exams":            permR,
		"exam-submissions": permR,
		"skill-scores":     permR,

		"assignments":            permR,
		"assignment-submissions": permR,
		"materials":              permR,

		"messages":      permRC,
		"announcements": permR,
		"notifications": permRW,

		"invoices": permR,
	},
}

// ============================================================
// YOXLAMA
// ============================================================

// HasPerm - istifadecinin verilen resurs uzerinde emeliyyat icazesi varmi.
func HasPerm(c *gin.Context, resource, action string) bool {
	role := c.GetString("userRole")
	if role == "" {
		return false
	}

	if !baseAllows(role, resource, action) {
		return false
	}

	// Alt rol varsa — daraldir
	if raw, ok := c.Get("subRolePerms"); ok {
		if sp, ok := raw.(map[string][]string); ok && sp != nil {
			return listHas(sp[resource], action)
		}
	}

	return true
}

func baseAllows(role, resource, action string) bool {
	res, ok := PermissionMatrix[role]
	if !ok {
		return false
	}
	if listHas(res[ResourceAll], action) {
		return true
	}
	return listHas(res[resource], action)
}

func listHas(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// RequirePerm - CRUD route-larina qosulan middleware.
func RequirePerm(resource, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !HasPerm(c, resource, action) {
			c.JSON(403, gin.H{
				"error":    "Bu emeliyyat ucun icazeniz yoxdur",
				"resource": resource,
				"action":   action,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireRole - yalniz konkret rollara acilan route-lar ucun.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("userRole")
		for _, r := range roles {
			if r == role {
				c.Next()
				return
			}
		}
		c.JSON(403, gin.H{"error": "Bu bolme sizin rolunuz ucun acili deyil"})
		c.Abort()
	}
}

// ============================================================
// ALT ROL
// ============================================================

// ParseSubRolePermissions - edu_sub_roles.permissions JSONB-ni oxuyur.
// Format: {"students":["read","create"],"invoices":["read"]}
func ParseSubRolePermissions(raw []byte) map[string][]string {
	if len(raw) == 0 {
		return nil
	}
	out := map[string][]string{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

// EffectivePermissions - frontend-in menyunu qurmasi ucun yekun icaze xeritesi.
// Panel hansi bolmelerin gorunecceyini bu cavaba gore qerarlasdirir.
func EffectivePermissions(role string, sub map[string][]string) map[string][]string {
	base, ok := PermissionMatrix[role]
	if !ok {
		return map[string][]string{}
	}

	// Admin: butun resurslar uzre tam icaze
	if listHas(base[ResourceAll], ActionRead) {
		out := map[string][]string{}
		for _, r := range AllResources {
			out[r] = permFull
		}
		if sub != nil {
			return intersect(out, sub)
		}
		return out
	}

	out := map[string][]string{}
	for res, acts := range base {
		if res == ResourceAll {
			continue
		}
		out[res] = acts
	}
	if sub != nil {
		return intersect(out, sub)
	}
	return out
}

func intersect(base, sub map[string][]string) map[string][]string {
	out := map[string][]string{}
	for res, acts := range base {
		allowed := sub[res]
		if len(allowed) == 0 {
			continue
		}
		keep := []string{}
		for _, a := range acts {
			if listHas(allowed, a) {
				keep = append(keep, a)
			}
		}
		if len(keep) > 0 {
			out[res] = keep
		}
	}
	return out
}

// AllResources - butun resurs acarlari.
// YENI RESURS ELAVE EDENDE bura da elave et (admin icazesi bundan qurulur).
var AllResources = []string{
	"branches", "rooms", "subjects", "levels",
	"users", "sub-roles", "teachers", "teacher-subjects",
	"students", "guardians", "student-guardians",
	"groups", "enrollments", "schedule-slots", "teacher-availability",
	"lessons", "attendance",
	"skills", "exams", "questions", "exam-submissions", "answers",
	"skill-scores", "placement-results",
	"syllabus-weeks", "materials", "assignments", "assignment-submissions",
	"messages", "announcements", "notifications",
	"tuition-plans", "student-tuitions", "invoices",
	"xp-events", "achievements", "student-achievements",
	"settings", "stats", "reports",
}
