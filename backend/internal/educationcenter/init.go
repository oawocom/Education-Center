package educationcenter

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================
// ROUTES
// The centre comes from the address: the tenant middleware has set
// "tenantID" before any of these runs.
//
// Public : /api/auth/..., /api/public/...
// Panel  : /api/sf/...  (the centre's own users: EduUser + JWT)
// ============================================================

// RegisterRoutes puts a centre's API under api; getDB opens a centre's own database.
func RegisterRoutes(api *gin.RouterGroup, getDB func(uint) (*gorm.DB, error)) {
	h := NewHandler(getDB)
	{
		// --- Auth (token telab etmir) ---
		api.POST("/auth/login", h.Login)
		api.POST("/auth/logout", h.Logout)
		api.POST("/auth/setup-password", h.SetupPassword)
		api.GET("/auth/verify-setup-token", h.VerifySetupToken)
		api.POST("/auth/register", h.Register)
		api.POST("/auth/google", h.GoogleAuth)
		api.GET("/auth/config", h.AuthConfig)
		api.POST("/auth/forgot-password", h.ForgotPassword)
		api.GET("/auth/reset-password", h.VerifyResetToken)
		api.POST("/auth/reset-password", h.ResetPassword)
		api.GET("/public/media/:token", h.ServeMedia)

		// --- Panel (token telab edir) ---
		sf := api.Group("/sf")
		sf.Use(h.JWTAuth())
		{
			sf.GET("/auth/me", h.GetMe)
			sf.POST("/auth/change-password", h.ChangePassword)
			sf.PUT("/auth/profile", h.UpdateProfile)
			sf.POST("/auth/logout-all", h.LogoutAll)
			sf.GET("/inbox", h.Inbox)
			sf.POST("/inbox/read", h.InboxRead)

			// E-poçt şablonları, məktub jurnalı, audit — yalnız admin
			mail := sf.Group("/email")
			mail.Use(RequireRole(RoleAdmin))
			{
				mail.GET("/templates", h.ListEmailTemplates)
				mail.PUT("/templates/:key", h.SaveEmailTemplate)
				mail.DELETE("/templates/:key", h.ResetEmailTemplate)
				mail.POST("/templates/:key/test", h.TestEmailTemplate)
				mail.GET("/log", h.EmailLogList)
			}
			sf.GET("/audit", RequireRole(RoleAdmin), h.AuditList)
			sf.POST("/auth/choose-role", h.ChooseRole)
			sf.POST("/auth/add-by-code", RequireRole(RoleAdmin), h.AddByCode)
			sf.GET("/auth/pending", RequireRole(RoleAdmin), h.ListPending)
			sf.POST("/auth/approve/:id", RequireRole(RoleAdmin), h.ApproveUser)
			sf.GET("/journal", h.Journal)
			sf.GET("/lessons-overview", RequireRole(RoleAdmin, RoleTeacher), h.LessonsOverview)
			sf.GET("/lessons-overview/:id", RequireRole(RoleAdmin, RoleTeacher), h.LessonDetail)
			sf.POST("/lessons-overview/:id/homework", RequireRole(RoleAdmin, RoleTeacher), h.LessonHomeworkSave)
			sf.DELETE("/homework/:id", RequireRole(RoleAdmin, RoleTeacher), h.LessonHomeworkDelete)
			sf.GET("/groups/:id/plan", RequireRole(RoleAdmin, RoleTeacher), h.GroupPlanGet)
			sf.POST("/groups/:id/plan", RequireRole(RoleAdmin), h.GroupPlanSave)
			sf.GET("/links", RequireRole(RoleAdmin, RoleTeacher), h.LinksOverview)
			sf.POST("/links", RequireRole(RoleAdmin), h.LinkCreate)
			sf.DELETE("/links", RequireRole(RoleAdmin), h.LinkDelete)

			// Istifadeci idaresi — yalniz admin
			users := sf.Group("/users")
			users.Use(RequireRole(RoleAdmin))
			{
				users.GET("", h.ListUsers)
				users.POST("", h.CreateUser)
				users.PUT("/:id", h.UpdateUser)
				users.DELETE("/:id", h.DeleteUser)
				users.POST("/:id/reset-password", h.ResetUserPassword)
				users.POST("/:id/send-reset", h.SendUserReset)
			}

			// Aqreqat hesabatlar (stats.go)
			sf.GET("/stats/overview", RequirePerm("reports", ActionRead), h.StatsOverview)
			sf.GET("/stats/branches", RequirePerm("reports", ActionRead), h.StatsBranches)
			sf.GET("/stats/teacher-performance", RequirePerm("reports", ActionRead), h.StatsTeacherPerformance)
			sf.GET("/stats/skills", RequirePerm("skill-scores", ActionRead), h.StatsSkills)
			sf.GET("/stats/results", RequirePerm("exam-submissions", ActionRead), h.StatsResults)
			sf.GET("/stats/attendance", RequirePerm("attendance", ActionRead), h.StatsAttendance)
			sf.GET("/stats/achievements", RequirePerm("achievements", ActionRead), h.StatsAchievements)

			// Qrup davamiyyet lovhesi
			sf.GET("/attendance-board", RequirePerm("attendance", ActionRead), h.AttendanceBoard)
			sf.POST("/attendance-board", RequirePerm("attendance", ActionCreate), h.SaveAttendanceBoard)

			// Imtahan verme axini (sagird terefi) — exam_play.go.
			// RequirePerm yox, RequireRole: bu, generic CRUD-un yerine
			// kecen XUSUSI emeliyyatdir, resurs icazesi ile qarisdirilmasin.
			sf.POST("/exams/:id/start", RequireRole(RoleStudent), h.StartExam)
			sf.POST("/exams/:id/submit", RequireRole(RoleStudent), h.SubmitExam)
			sf.POST("/exams/:id/save", RequireRole(RoleStudent), h.SaveExamProgress)
			sf.POST("/media", RequireRole(RoleAdmin, RoleTeacher), h.UploadMedia)

			// Toplu emeliyyatlar (operations.go)
			// Gundelik isin tekrarlanan hisseleri — elle gorulmesin.
			ops := sf.Group("/ops")
			{
				ops.POST("/generate-lessons", RequirePerm("lessons", ActionCreate), h.GenerateLessons)
				ops.POST("/generate-invoices", RequirePerm("invoices", ActionCreate), h.GenerateInvoices)
				ops.POST("/mark-overdue", RequirePerm("invoices", ActionUpdate), h.MarkOverdueInvoices)
				ops.POST("/record-payment", RequirePerm("invoices", ActionUpdate), h.RecordPayment)
				ops.POST("/place-applicant", RequirePerm("students", ActionCreate), h.PlaceApplicant)
				ops.POST("/grade-submission", RequirePerm("exam-submissions", ActionUpdate), h.GradeSubmission)
				ops.POST("/grade-pending", RequirePerm("exam-submissions", ActionUpdate), h.GradePending)

				// Hesab ↔ profil birlesdirmesi — yalniz admin
				ops.POST("/backfill-profiles", RequireRole(RoleAdmin), h.BackfillProfiles)
				ops.POST("/create-account", RequireRole(RoleAdmin), h.CreateAccountForProfile)
			}

			// 37 resursun CRUD-u (routes.go)
			RegisterResources(sf, h)
		}
	}
}
