package main

// End to end: the super admin makes two centres, each opens only at its own address,
// and a login of one centre opens nothing in the other.
// Needs a PostgreSQL the tests may create databases in: TEST_DATABASE_URL
// (default postgres://postgres@127.0.0.1:5432/edu_test?sslmode=disable).

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"educationcenter/internal/educationcenter"
	"educationcenter/internal/super"
	"educationcenter/internal/tenant"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func testDSN() string {
	if v := os.Getenv("TEST_DATABASE_URL"); v != "" {
		return v
	}
	return "postgres://postgres@127.0.0.1:5432/edu_test?sslmode=disable"
}

// freshSystem drops the test system database and the centres' databases made from it, then makes it again.
func freshSystem(t *testing.T) string {
	dsn := testDSN()
	u, _ := url.Parse(dsn)
	name := strings.Trim(u.Path, "/")
	admin := *u
	admin.Path = "/postgres"
	db, err := gorm.Open(postgres.Open(admin.String()), &gorm.Config{})
	if err != nil {
		t.Skip("no test database: ", err)
	}
	var old []string
	db.Raw("SELECT datname FROM pg_database WHERE datname = ? OR datname LIKE ?", name, name+"_t%").Scan(&old)
	for _, d := range old {
		db.Exec(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ?`, d)
		if err := db.Exec(`DROP DATABASE "` + d + `"`).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Exec(`CREATE DATABASE "` + name + `"`).Error; err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.Close()
	return dsn
}

type client struct {
	t *testing.T
	r *gin.Engine
}

func (c client) do(method, host, path, token string, body interface{}) (int, map[string]interface{}) {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Host = host
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	c.r.ServeHTTP(w, req)
	out := map[string]interface{}{}
	json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func (c client) must(want int, method, host, path, token string, body interface{}) map[string]interface{} {
	c.t.Helper()
	code, out := c.do(method, host, path, token, body)
	if code != want {
		c.t.Fatalf("%s %s%s = %d, want %d: %v", method, host, path, code, want, out)
	}
	return out
}

func TestCentres(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-only-not-a-real-secret-0123456789abcdef")
	os.Setenv("SUPERADMIN_EMAIL", "root@test.local")
	os.Setenv("SUPERADMIN_PASSWORD", "root-password")
	gin.SetMode(gin.TestMode)

	store, err := tenant.Open(freshSystem(t))
	if err != nil {
		t.Fatal(err)
	}
	if err := super.Setup(store.System); err != nil {
		t.Fatal(err)
	}
	c := client{t, newRouter(store)}
	const panel = "admin.test"

	c.must(401, "POST", panel, "/api/super/login", "", map[string]string{"email": "root@test.local", "password": "wrong"})
	st := c.must(200, "POST", panel, "/api/super/login", "", map[string]string{"email": "root@test.local", "password": "root-password"})["token"].(string)
	c.must(401, "GET", panel, "/api/super/tenants", "", nil)

	mk := func(name, host, email string) uint {
		out := c.must(201, "POST", panel, "/api/super/tenants", st, map[string]interface{}{
			"name": name, "domains": []string{"https://" + host + "/", "www." + host},
			"admin": map[string]string{"name": name + " admin", "email": email, "password": "secret123"},
		})
		return uint(out["id"].(float64))
	}
	a := mk("Centre A", "a.test", "admin@a.test")
	b := mk("Centre B", "b.test", "admin@b.test")
	// an address belongs to one centre only
	c.must(400, "POST", panel, "/api/super/tenants", st, map[string]interface{}{
		"name": "Copy", "domains": []string{"a.test"}, "admin": map[string]string{"name": "x", "email": "x@x.x", "password": "secret123"}})

	list := c.must(200, "GET", panel, "/api/super/tenants", st, nil)["data"].([]interface{})
	if len(list) != 2 {
		t.Fatalf("tenants: %v", list)
	}
	if counts := list[0].(map[string]interface{})["counts"].(map[string]interface{}); counts["admins"].(float64) != 1 {
		t.Fatalf("counts: %v", counts)
	}

	// each centre at its own address, with its own name
	if n := c.must(200, "GET", "a.test", "/api/tenant", "", nil)["name"]; n != "Centre A" {
		t.Fatalf("name: %v", n)
	}
	c.must(200, "GET", "www.b.test:443", "/api/tenant", "", nil)
	c.must(404, "GET", "nobody.test", "/api/tenant", "", nil)

	login := func(host, email, pw string) string {
		return c.must(200, "POST", host, "/api/auth/login", "", map[string]string{"email": email, "password": pw})["token"].(string)
	}
	ta := login("a.test", "admin@a.test", "secret123")
	c.must(401, "POST", "b.test", "/api/auth/login", "", map[string]string{"email": "admin@a.test", "password": "secret123"})
	c.must(200, "GET", "a.test", "/api/sf/auth/me", ta, nil)
	// A's login opens nothing in B, even with the address forged
	c.must(401, "GET", "b.test", "/api/sf/auth/me", ta, nil)
	req := httptest.NewRequest("GET", "/api/sf/branches", nil)
	req.Host = "a.test"
	req.Header.Set("X-Forwarded-Host", "b.test")
	req.Header.Set("Authorization", "Bearer "+ta)
	w := httptest.NewRecorder()
	c.r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("forged address: %d %s", w.Code, w.Body.String())
	}

	// data stays in its own centre
	c.must(201, "POST", "a.test", "/api/sf/branches", ta, map[string]interface{}{"name": "Main branch"})
	if n := c.must(200, "GET", "a.test", "/api/sf/branches", ta, nil)["total"]; n != float64(1) {
		t.Fatalf("A branches: %v", n)
	}
	tb := login("b.test", "admin@b.test", "secret123")
	if n := c.must(200, "GET", "b.test", "/api/sf/branches", tb, nil)["total"]; n != float64(0) {
		t.Fatalf("B branches: %v", n)
	}

	// a forgotten password, then a paused centre
	c.must(200, "POST", panel, fmt.Sprintf("/api/super/tenants/%d/password", a), st, map[string]string{"email": "admin@a.test", "password": "newsecret1"})
	login("a.test", "admin@a.test", "newsecret1")
	c.must(201, "POST", panel, fmt.Sprintf("/api/super/tenants/%d/admin", a), st, map[string]string{"name": "Second", "email": "two@a.test", "password": "secret123"})
	c.must(400, "POST", panel, fmt.Sprintf("/api/super/tenants/%d/admin", a), st, map[string]string{"name": "Again", "email": "TWO@a.test", "password": "secret123"})
	login("a.test", "two@a.test", "secret123")
	c.must(200, "PUT", panel, fmt.Sprintf("/api/super/tenants/%d", b), st, map[string]interface{}{"name": "Centre B", "is_active": false, "domains": []string{"b.test"}})
	c.must(403, "POST", "b.test", "/api/auth/login", "", map[string]string{"email": "admin@b.test", "password": "secret123"})
	c.must(403, "GET", "www.b.test", "/api/tenant", "", nil) // www. falls back to b.test, which is paused

	// a database copied from an older installation: project_id becomes this centre's tenant_id
	db, _ := store.DB(a)
	db.Exec(`ALTER TABLE edu_users RENAME COLUMN tenant_id TO project_id`)
	db.Exec(`UPDATE edu_users SET project_id = 189`)
	if err := educationcenter.Prepare(db, a); err != nil {
		t.Fatal(err)
	}
	var ids []uint
	db.Raw(`SELECT DISTINCT tenant_id FROM edu_users`).Scan(&ids)
	if len(ids) != 1 || ids[0] != a {
		t.Fatalf("tenant ids after import: %v", ids)
	}
	_ = b
}
