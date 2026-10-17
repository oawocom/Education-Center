package main

// E-poçt, bildirişlər və hesab təhlükəsizliyi — saxta SMTP serveri ilə başdan sona.

import (
	"bufio"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/http/httptest"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"educationcenter/internal/super"
	"educationcenter/internal/tenant"

	"github.com/gin-gonic/gin"
)

type mailMsg struct {
	to, subject, data string
	used              bool
}

type fakeSMTP struct {
	mu   sync.Mutex
	msgs []*mailMsg
	ln   net.Listener
}

func startSMTP(t *testing.T) *fakeSMTP {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeSMTP{ln: ln}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go f.serve(conn)
		}
	}()
	return f
}

func (f *fakeSMTP) port() string { return fmt.Sprint(f.ln.Addr().(*net.TCPAddr).Port) }

func (f *fakeSMTP) serve(conn net.Conn) {
	defer conn.Close()
	r := bufio.NewReader(conn)
	w := func(s string) { conn.Write([]byte(s + "\r\n")) }
	w("220 fake ESMTP")
	var to string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			w("250-fake")
			w("250 8BITMIME")
		case strings.HasPrefix(cmd, "MAIL FROM"):
			w("250 ok")
		case strings.HasPrefix(cmd, "RCPT TO"):
			to = strings.Trim(strings.TrimSpace(line[8:]), "<>: ")
			w("250 ok")
		case cmd == "DATA":
			w("354 go")
			var b strings.Builder
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				b.WriteString(l)
			}
			data, subject := decodeMail(b.String())
			f.mu.Lock()
			f.msgs = append(f.msgs, &mailMsg{to: strings.ToLower(to), subject: subject, data: data})
			f.mu.Unlock()
			w("250 queued")
		case cmd == "QUIT":
			w("221 bye")
			return
		default:
			w("250 ok")
		}
	}
}

// decodeMail - mövzu və bütün hissələrin (quoted-printable açılmış) mətni.
func decodeMail(raw string) (string, string) {
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return raw, ""
	}
	subject, _ := new(mime.WordDecoder).DecodeHeader(msg.Header.Get("Subject"))
	_, params, _ := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	var out strings.Builder
	out.WriteString("From: " + msg.Header.Get("From") + "\n")
	mr := multipart.NewReader(msg.Body, params["boundary"])
	for {
		part, err := mr.NextPart() // quoted-printable hissələri özü açır
		if err != nil {
			break
		}
		b, _ := io.ReadAll(part)
		out.Write(b)
		out.WriteString("\n")
	}
	return out.String(), subject
}

// wait - "to" ünvanına mövzusunda "subj" olan, hələ götürülməmiş məktub.
func (f *fakeSMTP) wait(t *testing.T, to, subj string) *mailMsg {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		f.mu.Lock()
		for _, m := range f.msgs {
			if !m.used && m.to == to && strings.Contains(m.subject, subj) {
				m.used = true
				f.mu.Unlock()
				return m
			}
		}
		f.mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	var got []string
	for _, m := range f.msgs {
		got = append(got, fmt.Sprintf("%s %q used=%v", m.to, m.subject, m.used))
	}
	t.Fatalf("no mail to %s with %q; have: %v", to, subj, got)
	return nil
}

// none - qısa müddətdə "to"-ya yeni məktub gəlmir.
func (f *fakeSMTP) none(t *testing.T, to string) {
	t.Helper()
	time.Sleep(400 * time.Millisecond)
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, m := range f.msgs {
		if !m.used && m.to == to {
			t.Fatalf("unexpected mail to %s: %q", to, m.subject)
		}
	}
}

var reToken = regexp.MustCompile(`token=([a-f0-9]{32,})`)

func tokenIn(t *testing.T, m *mailMsg) string {
	t.Helper()
	x := reToken.FindStringSubmatch(m.data)
	if x == nil {
		t.Fatalf("no link in mail %q", m.subject)
	}
	return x[1]
}

func TestMailAuthNotifications(t *testing.T) {
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
	smtp := startSMTP(t)
	c := client{t, newRouter(store)}
	const panel, host = "admin.test", "m.test"

	st := c.must(200, "POST", panel, "/api/super/login", "", map[string]string{"email": "root@test.local", "password": "root-password"})["token"].(string)
	id := uint(c.must(201, "POST", panel, "/api/super/tenants", st, map[string]interface{}{
		"name": "Mail Centre", "domains": []string{host},
		"admin": map[string]string{"name": "Boss", "email": "boss@m.test", "password": "secret123"},
	})["id"].(float64))
	tp := fmt.Sprintf("/api/super/tenants/%d", id)

	// --- SMTP: əvvəl yoxdur, sonra mərkəzin özününkü ---
	c.must(400, "POST", panel, tp+"/test-mail", st, nil)
	v := c.must(200, "PUT", panel, tp, st, map[string]interface{}{"name": "Mail Centre", "is_active": true, "domains": []string{host},
		"mail": map[string]string{"host": "127.0.0.1", "port": smtp.port(), "from": "noreply@m.test"}})
	if v["mail_source"] != "own" || v["smtp_host"] != "127.0.0.1" {
		t.Fatalf("mail view: %v", v)
	}
	if _, leaked := v["smtp_password"]; leaked {
		t.Fatal("smtp password in the view")
	}
	c.must(200, "POST", panel, tp+"/test-mail", st, map[string]string{"to": "root@test.local"})
	smtp.wait(t, "root@test.local", "Sınaq məktubu")

	login := func(email, pw string) string {
		t.Helper()
		return c.must(200, "POST", host, "/api/auth/login", "", map[string]string{"email": email, "password": pw})["token"].(string)
	}
	boss := login("boss@m.test", "secret123")

	tpl := c.must(200, "GET", host, "/api/sf/email/templates", boss, nil)
	if len(tpl["data"].([]interface{})) != 6 || tpl["mail_ready"] != true {
		t.Fatalf("templates: %v", tpl)
	}

	// --- dəvət: admin hesab açır, məktubdakı linklə parol təyin olunur ---
	created := c.must(201, "POST", host, "/api/sf/users", boss, map[string]string{"name": "Tara Teacher", "email": "tara@m.test", "role": "teacher"})
	if created["email_status"] != "queued" {
		t.Fatalf("invitation: %v", created)
	}
	inv := smtp.wait(t, "tara@m.test", "hesabınız yaradıldı")
	if !strings.Contains(inv.data, `From: "Mail Centre" <noreply@m.test>`) && !strings.Contains(inv.data, `From: Mail Centre <noreply@m.test>`) {
		t.Fatalf("from header: %q", strings.SplitN(inv.data, "\n", 2)[0])
	}
	setup := tokenIn(t, inv)
	c.must(400, "POST", host, "/api/auth/setup-password", "", map[string]string{"token": setup, "password": "short"})
	c.must(200, "POST", host, "/api/auth/setup-password", "", map[string]string{"token": setup, "password": "teacherpass1"})
	tara := login("tara@m.test", "teacherpass1")

	// --- parolun bərpası ---
	c.must(200, "POST", host, "/api/auth/forgot-password", "", map[string]string{"email": "nobody@m.test"})
	smtp.none(t, "nobody@m.test")
	if out := c.must(200, "POST", host, "/api/auth/forgot-password", "", map[string]string{"email": "TARA@m.test"}); out["mail_ready"] != true {
		t.Fatalf("forgot: %v", out)
	}
	rst := tokenIn(t, smtp.wait(t, "tara@m.test", "Parolun bərpası"))
	c.must(200, "GET", host, "/api/auth/reset-password?token="+rst, "", nil)
	c.must(400, "GET", host, "/api/auth/reset-password?token=deadbeef", "", nil)
	c.must(400, "POST", host, "/api/auth/reset-password", "", map[string]string{"token": rst, "password": "1234567"})
	time.Sleep(1100 * time.Millisecond) // köhnə token əvvəlki saniyədə verilsin
	c.must(200, "POST", host, "/api/auth/reset-password", "", map[string]string{"token": rst, "password": "brandnew123"})
	c.must(400, "POST", host, "/api/auth/reset-password", "", map[string]string{"token": rst, "password": "again12345"})
	smtp.wait(t, "tara@m.test", "Parolunuz dəyişdirildi")
	c.must(401, "GET", host, "/api/sf/auth/me", tara, nil) // köhnə sessiya bağlandı
	c.must(401, "POST", host, "/api/auth/login", "", map[string]string{"email": "tara@m.test", "password": "teacherpass1"})
	tara = login("tara@m.test", "brandnew123")
	// başqa mərkəzin linki bu mərkəzdə işləmir: token yalnız öz bazasında var
	c.must(200, "GET", host, "/api/sf/auth/me", tara, nil)

	// --- admin şablonu dəyişir, birini söndürür ---
	c.must(200, "PUT", host, "/api/sf/email/templates/notification", boss, map[string]interface{}{
		"subject": "Xəbər: {{title}}", "body": "Salam {{name}}\n{{body}}\n{{button:Bax}}", "enabled": true})
	c.must(200, "PUT", host, "/api/sf/email/templates/welcome", boss, map[string]interface{}{
		"subject": "Xoş gəldin", "body": "Salam", "enabled": false})
	c.must(404, "PUT", host, "/api/sf/email/templates/nope", boss, map[string]interface{}{"subject": "a", "body": "b"})
	c.must(403, "GET", host, "/api/sf/email/templates", tara, nil)
	c.must(200, "POST", host, "/api/sf/email/templates/password_reset/test", boss, nil)
	smtp.wait(t, "boss@m.test", "[TEST] Parolun bərpası")

	// --- qeydiyyat: xoş gəldin söndürülüb; rol seçiləndə adminə bildiriş + məktub ---
	sam := c.must(201, "POST", host, "/api/auth/register", "", map[string]string{"name": "Sam Student", "email": "sam@m.test", "password": "studentpass1"})["token"].(string)
	smtp.none(t, "sam@m.test")
	sam = c.must(200, "POST", host, "/api/sf/auth/choose-role", sam, map[string]string{"role": "student"})["token"].(string)
	smtp.wait(t, "boss@m.test", "Xəbər: Yeni qeydiyyat")
	inbox := c.must(200, "GET", host, "/api/sf/inbox", boss, nil)
	if inbox["unread"].(float64) < 1 {
		t.Fatalf("admin inbox: %v", inbox)
	}
	samID := c.must(200, "GET", host, "/api/sf/auth/me", sam, nil)["id"].(float64)
	c.must(200, "POST", host, fmt.Sprintf("/api/sf/auth/approve/%d", int(samID)), boss, nil)
	smtp.wait(t, "sam@m.test", "Hesabınız təsdiqləndi")
	smtp.none(t, "sam@m.test") // ayrıca "bildiriş" məktubu getmir
	c.must(200, "POST", host, "/api/sf/inbox/read", boss, map[string]bool{"all": true})
	if n := c.must(200, "GET", host, "/api/sf/inbox", boss, nil)["unread"]; n != float64(0) {
		t.Fatalf("unread after read all: %v", n)
	}

	// --- elan: yalnız hədəf rola, bir dəfə ---
	ann := c.must(201, "POST", host, "/api/sf/announcements", boss, map[string]interface{}{
		"title": "Tətil", "body": "Sabah dərs yoxdur", "status": "published", "target_roles": []string{"teacher"}})
	smtp.wait(t, "tara@m.test", "Xəbər: Tətil")
	smtp.none(t, "sam@m.test")
	c.must(200, "PUT", host, fmt.Sprintf("/api/sf/announcements/%d", int(ann["id"].(float64))), boss, map[string]interface{}{"body": "Düzəliş"})
	smtp.none(t, "tara@m.test")
	if n := c.must(200, "GET", host, "/api/sf/inbox", tara, nil)["unread"]; n != float64(1) {
		t.Fatalf("teacher unread: %v", n)
	}
	// qrupa / filiala hədəflənmiş elan yalnız oranın adamlarına
	branch := c.must(201, "POST", host, "/api/sf/branches", boss, map[string]interface{}{"name": "Filial X"})["id"]
	taraMe := c.must(200, "GET", host, "/api/sf/auth/me", tara, nil)["id"].(float64)
	c.must(200, "PUT", host, fmt.Sprintf("/api/sf/users/%d", int(taraMe)), boss, map[string]interface{}{"branch_id": branch})
	c.must(200, "GET", host, "/api/sf/auth/me", tara, nil) // filial dəyişəndə sessiya bağlanmır
	c.must(201, "POST", host, "/api/sf/announcements", boss, map[string]interface{}{"title": "Qrup elanı", "body": "x", "status": "published", "target_group_ids": []int{99999}})
	smtp.none(t, "tara@m.test")
	c.must(201, "POST", host, "/api/sf/announcements", boss, map[string]interface{}{"title": "Filial elanı", "body": "y", "status": "published", "target_branch_ids": []string{fmt.Sprint(branch)}})
	smtp.wait(t, "tara@m.test", "Xəbər: Filial elanı")
	smtp.none(t, "sam@m.test")

	// --- profil: e-poçt bildirişlərini söndürür ---
	me := c.must(200, "PUT", host, "/api/sf/auth/profile", tara, map[string]interface{}{"email_notifications": false, "phone": "+994 50 000 00 00"})
	if me["email_notifications"] != false || me["phone"] != "+994 50 000 00 00" {
		t.Fatalf("profile: %v", me)
	}
	taraID := me["id"].(float64)
	c.must(201, "POST", host, "/api/sf/messages", boss, map[string]interface{}{"to_user_id": taraID, "subject": "Salam", "body": "Necəsiniz?"})
	smtp.none(t, "tara@m.test")
	if n := c.must(200, "GET", host, "/api/sf/inbox", tara, nil)["unread"]; n != float64(3) {
		t.Fatalf("teacher unread after message: %v", n)
	}

	// --- parolun dəyişdirilməsi: bu cihaz qalır, digərləri çıxır ---
	other := login("tara@m.test", "brandnew123")
	c.must(400, "POST", host, "/api/sf/auth/change-password", tara, map[string]string{"current_password": "wrong", "new_password": "evennewer123"})
	time.Sleep(1100 * time.Millisecond)
	tara = c.must(200, "POST", host, "/api/sf/auth/change-password", tara, map[string]string{"current_password": "brandnew123", "new_password": "evennewer123"})["token"].(string)
	c.must(200, "GET", host, "/api/sf/auth/me", tara, nil)
	c.must(401, "GET", host, "/api/sf/auth/me", other, nil)
	smtp.wait(t, "tara@m.test", "Parolunuz dəyişdirildi") // təhlükəsizlik məktubu söndürülmür

	// --- deaktiv: sessiya dərhal bağlanır ---
	bossID := c.must(200, "GET", host, "/api/sf/auth/me", boss, nil)["id"].(float64)
	c.must(400, "PUT", host, fmt.Sprintf("/api/sf/users/%d", int(bossID)), boss, map[string]interface{}{"is_active": false})
	c.must(200, "PUT", host, fmt.Sprintf("/api/sf/users/%d", int(taraID)), boss, map[string]interface{}{"is_active": false})
	c.must(401, "GET", host, "/api/sf/auth/me", tara, nil)
	c.must(403, "POST", host, "/api/auth/login", "", map[string]string{"email": "tara@m.test", "password": "evennewer123"})
	c.must(200, "POST", host, "/api/auth/forgot-password", "", map[string]string{"email": "tara@m.test"})
	smtp.none(t, "tara@m.test")

	// --- super panel: istifadəçilər, aktivləşdirmə, bərpa linki, jurnallar ---
	users := c.must(200, "GET", panel, tp+"/users?q=tara", st, nil)["data"].([]interface{})
	if len(users) != 1 || users[0].(map[string]interface{})["is_active"] != false {
		t.Fatalf("super users: %v", users)
	}
	c.must(200, "PUT", panel, fmt.Sprintf("%s/users/%d", tp, int(taraID)), st, map[string]bool{"is_active": true})
	c.must(200, "POST", panel, fmt.Sprintf("%s/users/%d/reset-link", tp, int(taraID)), st, nil)
	smtp.wait(t, "tara@m.test", "Parolun bərpası")
	logs := c.must(200, "GET", panel, tp+"/email-log", st, nil)["data"].([]interface{})
	statuses := map[string]int{}
	for _, l := range logs {
		statuses[l.(map[string]interface{})["status"].(string)]++
	}
	if statuses["sent"] < 8 || statuses["skipped"] < 1 {
		t.Fatalf("mail log: %v", statuses)
	}
	actions := map[string]bool{}
	for _, a := range c.must(200, "GET", host, "/api/sf/audit", boss, nil)["data"].([]interface{}) {
		actions[a.(map[string]interface{})["action"].(string)] = true
	}
	for _, want := range []string{"login", "login_failed", "user_created", "password_reset", "password_changed", "user_updated", "create"} {
		if !actions[want] {
			t.Fatalf("audit has no %q: %v", want, actions)
		}
	}
	c.must(200, "GET", panel, tp+"/audit", st, nil)

	// --- super adminlər ---
	extra := c.must(201, "POST", panel, "/api/super/admins", st, map[string]string{"name": "Two", "email": "two@test.local", "password": "another-pass"})
	c.must(400, "POST", panel, "/api/super/admins", st, map[string]string{"name": "Two", "email": "TWO@test.local", "password": "another-pass"})
	if n := len(c.must(200, "GET", panel, "/api/super/admins", st, nil)["data"].([]interface{})); n != 2 {
		t.Fatalf("super admins: %d", n)
	}
	rootID := c.must(200, "GET", panel, "/api/super/me", st, nil)["id"].(float64)
	c.must(400, "DELETE", panel, fmt.Sprintf("/api/super/admins/%d", int(rootID)), st, nil)
	c.must(200, "DELETE", panel, fmt.Sprintf("/api/super/admins/%d", int(extra["id"].(float64))), st, nil)

	// --- ödəniş: hissə-hissə, artıq ödəniş olmur, tarixçə qalır ---
	stu := c.must(201, "POST", host, "/api/sf/students", boss, map[string]interface{}{"name": "Pay Student"})
	bill := c.must(201, "POST", host, "/api/sf/invoices", boss, map[string]interface{}{"student_id": stu["id"], "amount": 100})
	invID := bill["id"]
	c.must(400, "POST", host, "/api/sf/ops/record-payment", boss, map[string]interface{}{"invoice_id": invID, "amount": 150})
	if out := c.must(200, "POST", host, "/api/sf/ops/record-payment", boss, map[string]interface{}{"invoice_id": invID, "amount": 40, "method": "card"}); out["status"] != "partial" {
		t.Fatalf("partial payment: %v", out)
	}
	if out := c.must(200, "POST", host, "/api/sf/ops/record-payment", boss, map[string]interface{}{"invoice_id": invID, "paid_at": "2026-10-01T00:00:00Z"}); out["status"] != "paid" || out["paid_amount"] != float64(100) {
		t.Fatalf("rest of the payment: %v", out)
	}
	c.must(400, "POST", host, "/api/sf/ops/record-payment", boss, map[string]interface{}{"invoice_id": invID, "amount": 1})
	if n := c.must(200, "GET", host, fmt.Sprintf("/api/sf/payments?invoice_id=%v", invID), boss, nil)["total"]; n != float64(2) {
		t.Fatalf("payments: %v", n)
	}
	c.must(404, "POST", host, "/api/sf/payments", boss, map[string]interface{}{"invoice_id": invID, "amount": 5})

	// --- çox səhv giriş: blok ---
	for i := 0; i < 5; i++ {
		c.must(401, "POST", host, "/api/auth/login", "", map[string]string{"email": "sam@m.test", "password": "wrong-pass"})
	}
	c.must(429, "POST", host, "/api/auth/login", "", map[string]string{"email": "sam@m.test", "password": "studentpass1"})
	// saxta X-Forwarded-For bloku keçmir
	spoof := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"sam@m.test","password":"studentpass1"}`))
	spoof.Host = host
	spoof.Header.Set("Content-Type", "application/json")
	spoof.Header.Set("X-Forwarded-For", "9.9.9.9")
	w := httptest.NewRecorder()
	c.r.ServeHTTP(w, spoof)
	if w.Code != 429 {
		t.Fatalf("spoofed X-Forwarded-For got past the lock: %d", w.Code)
	}
	// başqa ünvandan (nginx-in yazdığı X-Real-IP) həmin hesab hələ də girə bilir
	elsewhere := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"sam@m.test","password":"studentpass1"}`))
	elsewhere.Host = host
	elsewhere.RemoteAddr = "127.0.0.1:5000"
	elsewhere.Header.Set("Content-Type", "application/json")
	elsewhere.Header.Set("X-Real-IP", "198.51.100.7")
	w = httptest.NewRecorder()
	c.r.ServeHTTP(w, elsewhere)
	if w.Code != 200 {
		t.Fatalf("the owner from another address was locked out too: %d %s", w.Code, w.Body.String())
	}
	for i := 0; i < 5; i++ {
		c.must(401, "POST", panel, "/api/super/login", "", map[string]string{"email": "two@test.local", "password": "x"})
	}
	c.must(429, "POST", panel, "/api/super/login", "", map[string]string{"email": "two@test.local", "password": "x"})
}
