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

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
