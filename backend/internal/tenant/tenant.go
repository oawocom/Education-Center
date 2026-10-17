// Package tenant: the centres (tenants). Each centre has its own database and
// the addresses (domains) it opens at; the system database keeps the list.
package tenant

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Tenant is one centre. The SMTP_* fields are its own mail settings (empty: the server's).
type Tenant struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:200;not null" json:"name"`
	DBName       string    `gorm:"size:63;uniqueIndex;not null" json:"db_name"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	SMTPHost     string    `gorm:"size:255" json:"smtp_host"`
	SMTPPort     string    `gorm:"size:10" json:"smtp_port"`
	SMTPUser     string    `gorm:"size:255" json:"smtp_user"`
	SMTPPassword string    `gorm:"size:255" json:"-"`
	SMTPFrom     string    `gorm:"size:255" json:"smtp_from"`
	SMTPFromName string    `gorm:"size:200" json:"smtp_from_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Domains      []Domain  `gorm:"constraint:OnDelete:CASCADE" json:"domains"`
}

// Domain is an address a centre opens at (no scheme, no port).
type Domain struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	TenantID uint   `gorm:"index;not null" json:"tenant_id"`
	Host     string `gorm:"size:253;uniqueIndex;not null" json:"host"`
}

type hostInfo struct {
	id     uint
	active bool
}

// Store: the system database, the centres' open databases and the address list.
type Store struct {
	System *gorm.DB
	dsn    *url.URL

	mu     sync.RWMutex
	dbs    map[uint]*gorm.DB
	hosts  map[string]hostInfo
	names  map[uint]string
	info   map[uint]Tenant
	loaded time.Time
}

const hostsTTL = 30 * time.Second

// Open connects to the system database (DATABASE_URL) and brings its tables up to date.
func Open(dsn string) (*Store, error) {
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme == "" || strings.Trim(u.Path, "/") == "" {
		return nil, errors.New("DATABASE_URL must be like postgres://user:password@host:5432/database")
	}
	db, err := open(dsn, 5)
	if err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&Tenant{}, &Domain{}); err != nil {
		return nil, err
	}
	return &Store{System: db, dsn: u, dbs: map[uint]*gorm.DB{}}, nil
}

func open(dsn string, maxOpen int) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), logger.Config{
		SlowThreshold: time.Second, LogLevel: logger.Warn, IgnoreRecordNotFoundError: true,
	})})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(maxOpen)
	sqlDB.SetMaxIdleConns(2)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	return db, nil
}

// prefix names the centres' databases after the system database (edu → edu_t1, edu_t2 ...),
// so two installations can share one PostgreSQL server.
func (s *Store) prefix() string {
	p := strings.ToLower(strings.Trim(s.dsn.Path, "/"))
	if len(p) > 50 {
		p = p[:50]
	}
	return p
}

// dsnFor is the address of a centre's own database: the system address with its database name.
func (s *Store) dsnFor(dbName string) string {
	u := *s.dsn
	u.Path = "/" + dbName
	return u.String()
}

// DB opens (once) and returns a centre's own database.
func (s *Store) DB(id uint) (*gorm.DB, error) {
	s.mu.RLock()
	db := s.dbs[id]
	s.mu.RUnlock()
	if db != nil {
		return db, nil
	}
	var t Tenant
	if err := s.System.First(&t, id).Error; err != nil {
		return nil, fmt.Errorf("centre %d: %w", id, err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if db := s.dbs[id]; db != nil {
		return db, nil
	}
	db, err := open(s.dsnFor(t.DBName), 10)
	if err != nil {
		return nil, err
	}
	s.dbs[id] = db
	return db, nil
}

// NormalizeHost: lower case, no port, no trailing dot.
func NormalizeHost(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	if i := strings.LastIndex(h, ":"); i >= 0 && !strings.Contains(h[i:], "]") {
		h = h[:i]
	}
	return strings.TrimSuffix(h, ".")
}

var hostPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`)

// CleanHosts normalises a list of addresses and refuses what is not an address.
func CleanHosts(in []string) ([]string, error) {
	seen := map[string]bool{}
	var out []string
	for _, h := range in {
		h = strings.TrimPrefix(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(h)), "https://"), "http://")
		h = NormalizeHost(strings.SplitN(h, "/", 2)[0])
		if h == "" || seen[h] {
			continue
		}
		if !hostPattern.MatchString(h) {
			return nil, fmt.Errorf("%q is not a domain", h)
		}
		seen[h] = true
		out = append(out, h)
	}
	if len(out) == 0 {
		return nil, errors.New("at least one domain is needed")
	}
	return out, nil
}

func (s *Store) reload() {
	var ts []Tenant
	s.System.Preload("Domains").Find(&ts)
	hosts, names, info := map[string]hostInfo{}, map[uint]string{}, map[uint]Tenant{}
	for _, t := range ts {
		names[t.ID] = t.Name
		info[t.ID] = t
		for _, d := range t.Domains {
			hosts[d.Host] = hostInfo{id: t.ID, active: t.IsActive}
		}
	}
	s.mu.Lock()
	s.hosts, s.names, s.info, s.loaded = hosts, names, info, time.Now()
	s.mu.Unlock()
}

// Invalidate makes the next request read the address list again.
func (s *Store) Invalidate() {
	s.mu.Lock()
	s.loaded = time.Time{}
	s.mu.Unlock()
}

// Resolve finds the centre of an address ("www." is tried without it too).
func (s *Store) Resolve(host string) (id uint, active, ok bool) {
	s.mu.RLock()
	fresh := time.Since(s.loaded) < hostsTTL
	s.mu.RUnlock()
	if !fresh {
		s.reload()
	}
	host = NormalizeHost(host)
	s.mu.RLock()
	defer s.mu.RUnlock()
	hi, ok := s.hosts[host]
	if !ok && strings.HasPrefix(host, "www.") {
		hi, ok = s.hosts[strings.TrimPrefix(host, "www.")]
	}
	return hi.id, hi.active, ok
}

// Info is a centre with its addresses and mail settings, from the list kept in memory.
func (s *Store) Info(id uint) (Tenant, bool) {
	s.mu.RLock()
	fresh := time.Since(s.loaded) < hostsTTL
	s.mu.RUnlock()
	if !fresh {
		s.reload()
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.info[id]
	return t, ok
}

// Name is a centre's name.
func (s *Store) Name(id uint) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.names[id]
}

// RequestHost is the address the visitor opened: the frontend (and nginx) pass it on in
// X-Forwarded-Host. Trusting it is safe: a login opens only the centre it was made in.
func RequestHost(c *gin.Context) string {
	if h := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Host"), ",")[0]); h != "" {
		return NormalizeHost(h)
	}
	return NormalizeHost(c.Request.Host)
}

// Middleware finds the centre from the address of the request and sets "tenantID".
func Middleware(s *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, active, ok := s.Resolve(RequestHost(c))
		if !ok {
			c.AbortWithStatusJSON(404, gin.H{"error": "Bu ünvanda mərkəz yoxdur"})
			return
		}
		if !active {
			c.AbortWithStatusJSON(403, gin.H{"error": "Bu mərkəz hazırda aktiv deyil"})
			return
		}
		c.Set("tenantID", id)
		c.Next()
	}
}

// taken tells which of hosts already belong to a centre other than except.
func (s *Store) taken(tx *gorm.DB, hosts []string, except uint) error {
	var ds []Domain
	tx.Where("host IN ? AND tenant_id <> ?", hosts, except).Find(&ds)
	if len(ds) > 0 {
		return fmt.Errorf("%s is already used by another centre", ds[0].Host)
	}
	return nil
}

// Create makes a centre: its row, its addresses and its own empty database.
func (s *Store) Create(name string, hosts []string) (*Tenant, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name is needed")
	}
	hosts, err := CleanHosts(hosts)
	if err != nil {
		return nil, err
	}
	b := make([]byte, 6)
	rand.Read(b)
	t := Tenant{Name: name, DBName: "pending_" + hex.EncodeToString(b), IsActive: true}
	err = s.System.Transaction(func(tx *gorm.DB) error {
		if err := s.taken(tx, hosts, 0); err != nil {
			return err
		}
		if err := tx.Create(&t).Error; err != nil {
			return err
		}
		t.DBName = fmt.Sprintf("%s_t%d", s.prefix(), t.ID)
		if err := tx.Model(&t).Update("db_name", t.DBName).Error; err != nil {
			return err
		}
		for _, h := range hosts {
			d := Domain{TenantID: t.ID, Host: h}
			if err := tx.Create(&d).Error; err != nil {
				return err
			}
			t.Domains = append(t.Domains, d)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// CREATE DATABASE cannot run inside a transaction; the name is ours (<system db>_t<id>), never user text
	if err := s.System.Exec(`CREATE DATABASE "` + t.DBName + `"`).Error; err != nil {
		s.System.Select("Domains").Delete(&t)
		return nil, fmt.Errorf("the database could not be made: %w", err)
	}
	s.Invalidate()
	return &t, nil
}

// Update changes a centre's name, state and addresses.
func (s *Store) Update(id uint, name string, active bool, hosts []string) (*Tenant, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name is needed")
	}
	hosts, err := CleanHosts(hosts)
	if err != nil {
		return nil, err
	}
	var t Tenant
	err = s.System.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&t, id).Error; err != nil {
			return err
		}
		if err := s.taken(tx, hosts, id); err != nil {
			return err
		}
		if err := tx.Model(&t).Updates(map[string]interface{}{"name": name, "is_active": active}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_id = ?", id).Delete(&Domain{}).Error; err != nil {
			return err
		}
		for _, h := range hosts {
			if err := tx.Create(&Domain{TenantID: id, Host: h}).Error; err != nil {
				return err
			}
		}
		return tx.Preload("Domains").First(&t, id).Error
	})
	if err != nil {
		return nil, err
	}
	s.Invalidate()
	return &t, nil
}

// Mail is a centre's own mail settings; an empty Password keeps the saved one.
type Mail struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	From     string `json:"from"`
	FromName string `json:"from_name"`
}

// SetMail saves a centre's mail settings.
func (s *Store) SetMail(id uint, m Mail) error {
	up := map[string]interface{}{
		"smtp_host": strings.TrimSpace(m.Host), "smtp_port": strings.TrimSpace(m.Port), "smtp_user": strings.TrimSpace(m.User),
		"smtp_from": strings.TrimSpace(m.From), "smtp_from_name": strings.TrimSpace(m.FromName),
	}
	if m.Password != "" {
		up["smtp_password"] = m.Password
	}
	if strings.TrimSpace(m.Host) == "" {
		up["smtp_password"] = ""
	}
	err := s.System.Model(&Tenant{}).Where("id = ?", id).Updates(up).Error
	s.Invalidate()
	return err
}

// Get is one centre.
func (s *Store) Get(id uint) (Tenant, error) {
	var t Tenant
	err := s.System.Preload("Domains").First(&t, id).Error
	return t, err
}

// List is every centre with its addresses.
func (s *Store) List() []Tenant {
	var ts []Tenant
	s.System.Preload("Domains").Order("id").Find(&ts)
	return ts
}
