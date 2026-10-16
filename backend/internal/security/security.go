// Package security holds the passwords and the signing keys.
package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// Check tells whether JWT_SECRET is usable; the server does not start without it.
func Check() error {
	if len(os.Getenv("JWT_SECRET")) < 32 {
		return errors.New("JWT_SECRET must be set and at least 32 characters long")
	}
	return nil
}

// Key is a signing key of its own for one purpose, derived from JWT_SECRET:
// changing JWT_SECRET changes every key (everyone signs in again once).
func Key(purpose string) []byte {
	m := hmac.New(sha256.New, []byte(os.Getenv("JWT_SECRET")))
	m.Write([]byte("key:" + purpose))
	return m.Sum(nil)
}

// HashPassword: argon2id, t=3, m=64MB, p=4.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

// CheckPassword accepts argon2id hashes (any parameters) and bcrypt hashes.
func CheckPassword(password, hash string) bool {
	if strings.HasPrefix(hash, "$2a$") || strings.HasPrefix(hash, "$2b$") || strings.HasPrefix(hash, "$2y$") {
		return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
	}
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var memory, iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}
