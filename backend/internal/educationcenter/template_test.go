package educationcenter

import (
	"strings"
	"testing"
)

func TestRenderTemplate(t *testing.T) {
	sub, html, text := renderTemplate("{{title}} — {{centre}}", "Salam, {{name}}!\n{{body}}\n{{button:Bax}}", map[string]string{
		"title": "Yeni\nismarıc", "centre": "A&B", "name": "<b>Ali</b>", "body": "1 < 2", "link": "https://a.test/x?y=1&z=2",
	})
	if sub != "Yeni ismarıc — A&B" {
		t.Fatalf("subject %q", sub)
	}
	for _, want := range []string{"Salam, &lt;b&gt;Ali&lt;/b&gt;!<br>", "1 &lt; 2", `href="https://a.test/x?y=1&amp;z=2"`, ">Bax</a>"} {
		if !strings.Contains(html, want) {
			t.Fatalf("html has no %q: %s", want, html)
		}
	}
	if strings.Contains(html, "<b>Ali") {
		t.Fatal("variables must be escaped")
	}
	if !strings.Contains(text, "Bax: https://a.test/x?y=1&z=2") || !strings.Contains(text, "<b>Ali</b>") {
		t.Fatalf("text %q", text)
	}
	// linksiz düymə görünmür
	_, html, text = renderTemplate("x", "a {{button:Bax}} b", map[string]string{})
	if strings.Contains(html, "Bax") || strings.Contains(text, "Bax") {
		t.Fatalf("button without link: %q %q", html, text)
	}
}

func TestLimiter(t *testing.T) {
	l := newLimiter(3, 60e9, 60e9)
	for i := 0; i < 2; i++ {
		l.fail("k")
	}
	if l.blocked("k") > 0 {
		t.Fatal("blocked too early")
	}
	l.fail("k")
	if l.blocked("k") == 0 {
		t.Fatal("not blocked")
	}
	l.reset("k")
	if l.blocked("k") > 0 {
		t.Fatal("reset failed")
	}
	if !l.allow("x") || !l.allow("x") || !l.allow("x") || l.allow("x") {
		t.Fatal("allow")
	}
}
