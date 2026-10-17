package educationcenter

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"html"
	"log"
	"mime"
	"mime/quotedprintable"
	"net"
	netmail "net/mail"
	"net/smtp"
	"regexp"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// ============================================================
// E-POÇT GÖNDƏRMƏ
//
// Hər mərkəz öz SMTP ayarı ilə göndərir (super admin panelində);
// yoxdursa serverin ümumi SMTP_* ayarı işləyir. MailFor, CentreName
// və CentreURL-i server (main) qurur.
// ============================================================

// Mail - bir mərkəzin göndərmə ayarları.
type Mail struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string // göndərən ünvan
	FromName string // göndərənin adı (adətən mərkəzin adı)
}

// Ready - göndərmək üçün kifayət qədər ayar var.
func (m Mail) Ready() bool { return strings.TrimSpace(m.Host) != "" && strings.TrimSpace(m.From) != "" }

// MailFor bir mərkəzin göndərmə ayarlarını verir.
var MailFor = func(tenantID uint) Mail { return Mail{} }

// CentreName - mərkəzin adı (şablonlarda {{centre}}).
var CentreName = func(tenantID uint) string { return "" }

// CentreURL - mərkəzin əsas ünvanı, məs. https://oawo.academy (linklər üçün).
var CentreURL = func(tenantID uint) string { return "" }

// ---------- sorğunun mərkəzi gorm bağlantısının içində ----------

type tenantCtxKey struct{}

type tenantCtx struct {
	id   uint
	root *gorm.DB // tranzaksiyadan kənar bağlantı (jurnal yazıları üçün)
}

// withTenant - bu bağlantı ilə yazılanlar (bildirişlər, məktublar) hansı mərkəzə aiddir.
func withTenant(db *gorm.DB, tenantID uint) *gorm.DB {
	ctx := context.Background()
	if db.Statement != nil && db.Statement.Context != nil {
		ctx = db.Statement.Context
	}
	return db.WithContext(context.WithValue(ctx, tenantCtxKey{}, tenantCtx{id: tenantID, root: db}))
}

func tenantOf(db *gorm.DB) uint {
	if db == nil || db.Statement == nil || db.Statement.Context == nil {
		return 0
	}
	t, _ := db.Statement.Context.Value(tenantCtxKey{}).(tenantCtx)
	return t.id
}

// background - sorğu (və tranzaksiya) bitəndən sonra da işləyən bağlantı (jurnallar üçün).
func background(db *gorm.DB) *gorm.DB {
	if db != nil && db.Statement != nil && db.Statement.Context != nil {
		if t, ok := db.Statement.Context.Value(tenantCtxKey{}).(tenantCtx); ok && t.root != nil {
			return t.root.WithContext(context.Background())
		}
	}
	return db.WithContext(context.Background())
}

func (m Mail) name() string {
	if strings.TrimSpace(m.FromName) != "" {
		return strings.TrimSpace(m.FromName)
	}
	return "Təlim mərkəzi"
}

// qpEncode - quoted-printable: uzun sətirlər 76 simvolda bükülür (SMTP 998 həddini keçməsin).
func qpEncode(s string) string {
	var b bytes.Buffer
	w := quotedprintable.NewWriter(&b)
	w.Write([]byte(s))
	w.Close()
	return b.String()
}

func randomBoundary() string {
	b := make([]byte, 12)
	rand.Read(b)
	return "edu-" + hex.EncodeToString(b)
}

// Send - HTML + düz mətn (multipart/alternative). 465 portu birbaşa TLS, digərləri STARTTLS (server dəstəkləyirsə).
func (m Mail) Send(to, subject, htmlBody, textBody string) error {
	to = strings.TrimSpace(to)
	if to == "" || !strings.Contains(to, "@") || strings.ContainsAny(to, "\r\n") {
		return fmt.Errorf("alıcı ünvanı düzgün deyil")
	}
	if !m.Ready() {
		return fmt.Errorf("e-poçt göndərmə qurulmayıb")
	}
	port := strings.TrimSpace(m.Port)
	if port == "" {
		port = "587"
	}
	from := strings.TrimSpace(m.From)
	if strings.ContainsAny(from, "\r\n<>") {
		return fmt.Errorf("göndərən ünvan düzgün deyil")
	}
	boundary := randomBoundary()
	var msg strings.Builder
	msg.WriteString("From: " + (&netmail.Address{Name: m.name(), Address: from}).String() + "\r\n")
	msg.WriteString("To: " + to + "\r\n")
	msg.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", strings.Join(strings.Fields(subject), " ")) + "\r\n")
	msg.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")
	msg.WriteString("--" + boundary + "\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n")
	msg.WriteString(qpEncode(textBody) + "\r\n")
	msg.WriteString("--" + boundary + "\r\nContent-Type: text/html; charset=\"UTF-8\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n")
	msg.WriteString(qpEncode(htmlBody) + "\r\n")
	msg.WriteString("--" + boundary + "--\r\n")

	host := strings.TrimSpace(m.Host)
	addr := net.JoinHostPort(host, port)
	var c *smtp.Client
	var err error
	if port == "465" {
		conn, derr := tls.DialWithDialer(&net.Dialer{Timeout: 15 * time.Second}, "tcp", addr, &tls.Config{ServerName: host})
		if derr != nil {
			return derr
		}
		conn.SetDeadline(time.Now().Add(60 * time.Second))
		c, err = smtp.NewClient(conn, host)
	} else {
		conn, derr := net.DialTimeout("tcp", addr, 15*time.Second)
		if derr != nil {
			return derr
		}
		conn.SetDeadline(time.Now().Add(60 * time.Second))
		c, err = smtp.NewClient(conn, host)
		if err == nil {
			if ok, _ := c.Extension("STARTTLS"); ok {
				err = c.StartTLS(&tls.Config{ServerName: host})
			}
		}
	}
	if err != nil {
		return err
	}
	defer c.Close()
	if m.User != "" {
		if err := c.Auth(smtp.PlainAuth("", m.User, m.Password, host)); err != nil {
			return err
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte(msg.String())); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	c.Quit()
	return nil
}

// ---------- HTML çərçivə ----------

var (
	reBreaks = regexp.MustCompile(`(?i)<br\s*/?>|</p>|</div>|</h[1-6]>|</li>|</tr>`)
	reTags   = regexp.MustCompile(`<[^>]+>`)
	reLinks  = regexp.MustCompile(`(?i)<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>`)
	reBlank  = regexp.MustCompile(`\n{3,}`)
)

// htmlToText - məktubun düz mətn variantı.
func htmlToText(s string) string {
	s = reLinks.ReplaceAllString(s, "$2 ($1)")
	s = reBreaks.ReplaceAllString(s, "\n")
	s = reTags.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = strings.TrimSpace(lines[i])
	}
	return strings.TrimSpace(reBlank.ReplaceAllString(strings.Join(lines, "\n"), "\n\n"))
}

// layout - şablonun mətnini mərkəzin adı olan səliqəli çərçivəyə qoyur.
func layout(centre, inner string) string {
	c := html.EscapeString(centre)
	if c == "" {
		c = "Təlim mərkəzi"
	}
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>` +
		`<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c2434">` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 12px"><tr><td align="center">` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e3e7ef">` +
		`<tr><td style="padding:22px 28px;border-bottom:1px solid #eef1f6;font-size:16px;font-weight:700;color:#2F5BEA">` + c + `</td></tr>` +
		`<tr><td style="padding:26px 28px;font-size:15px;line-height:1.6">` + inner + `</td></tr>` +
		`<tr><td style="padding:16px 28px;border-top:1px solid #eef1f6;font-size:12px;color:#8a93a6">Bu məktub ` + c + ` tərəfindən avtomatik göndərilib.</td></tr>` +
		`</table></td></tr></table></body></html>`
}

// button - şablonlarda {{button:Mətn}} yerinə linkli düymə.
func button(link, label string) string {
	if link == "" {
		return ""
	}
	return `<p style="margin:22px 0"><a href="` + html.EscapeString(link) + `" style="display:inline-block;background:#2F5BEA;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">` +
		html.EscapeString(label) + `</a></p><p style="font-size:12px;color:#8a93a6;word-break:break-all">` + html.EscapeString(link) + `</p>`
}

// ---------- göndəriş növbəsi ----------
// Məktublar sorğunu gözlətmir: növbəyə düşür, bir neçə işçi ardıcıl göndərir
// (yüz qaimə bir anda yüz SMTP bağlantısı açmasın). Nəticə jurnala yazılır.

type mailJob struct {
	db       *gorm.DB
	mail     Mail
	tenantID uint
	to       string
	userID   *uint
	key      string
	subject  string
	html     string
	text     string
}

// İki növbə: hesab məktubları (dəvət, parol bərpası ...) bildirişlərdən (elan, qaimə) əvvəl gedir —
// böyük bir elan göndərişi başqa mərkəzin parol linkini gecikdirməsin.
var (
	urgentQueue = make(chan mailJob, 2000)
	bulkQueue   = make(chan mailJob, 5000)
	mailOnce    sync.Once
)

const mailWorkers = 3

func deliver(j mailJob) {
	if err := j.mail.Send(j.to, j.subject, j.html, j.text); err != nil {
		logMailFailure(j.tenantID, j.to, err)
		writeLog(j.db, j.to, j.userID, j.key, j.subject, "failed", err.Error())
		return
	}
	writeLog(j.db, j.to, j.userID, j.key, j.subject, "sent", "")
}

func enqueueMail(j mailJob, urgent bool) bool {
	mailOnce.Do(func() {
		for i := 0; i < mailWorkers; i++ {
			go func() {
				for {
					select {
					case j := <-urgentQueue:
						deliver(j)
						continue
					default:
					}
					select {
					case j := <-urgentQueue:
						deliver(j)
					case j := <-bulkQueue:
						deliver(j)
					}
				}
			}()
		}
	})
	q := bulkQueue
	if urgent {
		q = urgentQueue
	}
	select {
	case q <- j:
		return true
	default:
		return false
	}
}

func logMailFailure(tenantID uint, to string, err error) {
	log.Printf("[education-center] mail tenant=%d to=%s FAILED: %v", tenantID, to, err)
}
