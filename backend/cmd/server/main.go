// Education Center: one server for many centres. A centre is found from the
// address it is opened at and keeps its data in a database of its own.
package main

import (
	"log"
	"os"

	"educationcenter/internal/educationcenter"
	"educationcenter/internal/security"
	"educationcenter/internal/super"
	"educationcenter/internal/tenant"

	"github.com/gin-gonic/gin"
)

func main() {
	if err := security.Check(); err != nil {
		log.Fatal(err)
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	store, err := tenant.Open(dsn)
	if err != nil {
		log.Fatal("database: ", err)
	}
	if err := super.Setup(store.System); err != nil {
		log.Fatal("super admin: ", err)
	}

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := newRouter(store)

	addr := ":" + envOr("PORT", "8080")
	log.Printf("Education Center API on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

// newRouter: /api/super is the super admin panel; everything else under /api belongs to the centre of the address.
func newRouter(store *tenant.Store) *gin.Engine {
	educationcenter.MailFor = mailFor(store)
	educationcenter.CentreName = func(id uint) string { t, _ := store.Info(id); return t.Name }
	educationcenter.CentreURL = func(id uint) string { return centreURL(store, id) }

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.MaxMultipartMemory = 32 << 20

	r.GET("/api/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	super.RegisterRoutes(r.Group("/api/super"), store)

	api := r.Group("/api")
	api.Use(tenant.Middleware(store))
	api.GET("/tenant", func(c *gin.Context) {
		c.JSON(200, gin.H{"name": store.Name(c.MustGet("tenantID").(uint))})
	})
	educationcenter.RegisterRoutes(api, store.DB)
	return r
}

// mailFor: a centre's own SMTP settings, or the server's SMTP_* ones; the sender's name is the centre's.
func mailFor(store *tenant.Store) func(uint) educationcenter.Mail {
	return func(id uint) educationcenter.Mail {
		m := educationcenter.Mail{
			Host: os.Getenv("SMTP_HOST"), Port: os.Getenv("SMTP_PORT"), User: os.Getenv("SMTP_USER"),
			Password: os.Getenv("SMTP_PASSWORD"), From: os.Getenv("SMTP_FROM"), FromName: os.Getenv("SMTP_FROM_NAME"),
		}
		t, ok := store.Info(id)
		if !ok {
			return m
		}
		if t.SMTPHost != "" {
			m = educationcenter.Mail{Host: t.SMTPHost, Port: t.SMTPPort, User: t.SMTPUser, Password: t.SMTPPassword, From: t.SMTPFrom, FromName: t.SMTPFromName}
		}
		if m.FromName == "" {
			m.FromName = t.Name
		}
		return m
	}
}

// centreURL: the centre's first address, for links in e-mails (PUBLIC_SCHEME=http only for local tests).
func centreURL(store *tenant.Store, id uint) string {
	t, ok := store.Info(id)
	if !ok || len(t.Domains) == 0 {
		return ""
	}
	return envOr("PUBLIC_SCHEME", "https") + "://" + t.Domains[0].Host
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
