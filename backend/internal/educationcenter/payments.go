package educationcenter

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ============================================================
// ÖDƏNİŞLƏR — qaimə üzrə hər ödəniş ayrıca qeyd olunur (tarixçə, qəbz).
// Qaimənin paid_amount / status sahələri bunun cəmidir.
// ============================================================

type Payment struct {
	BaseModel
	InvoiceID uint      `json:"invoice_id" gorm:"index;not null"`
	StudentID uint      `json:"student_id" gorm:"index;not null"`
	Amount    float64   `json:"amount"`
	Currency  string    `json:"currency" gorm:"size:10"`
	Method    string    `json:"method" gorm:"size:50"` // cash | card | transfer | online
	PaidAt    time.Time `json:"paid_at" gorm:"index"`
	Reference string    `json:"reference" gorm:"size:255"`
	Note      string    `json:"note" gorm:"type:text"`
	CreatedBy *uint     `json:"created_by"`
}

func (Payment) TableName() string { return "edu_payments" }

var methodAz = map[string]string{"cash": "nağd", "card": "kartla", "transfer": "köçürmə ilə", "online": "onlayn"}

func money(v float64) string { return strings.Replace(fmt.Sprintf("%.2f", v), ".", ",", 1) }

// POST /sf/ops/record-payment {invoice_id, amount, method, paid_at, reference, note}
func (h *Handler) RecordPayment(c *gin.Context) {
	var req struct {
		InvoiceID uint     `json:"invoice_id"`
		Amount    *float64 `json:"amount"`
		Method    string   `json:"method"`
		PaidAt    string   `json:"paid_at"`
		Reference string   `json:"reference"`
		Note      string   `json:"note"`
	}
	if c.ShouldBindJSON(&req) != nil || req.InvoiceID == 0 {
		c.JSON(400, gin.H{"error": "Qaimə seçilməlidir"})
		return
	}
	db, err := h.tenantDB(c)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	when := time.Now()
	if s := strings.TrimSpace(req.PaidAt); s != "" {
		if len(s) >= 10 {
			if t, ok := parseDate(s[:10]); ok {
				when = t
			}
		}
	}
	method := req.Method
	if method == "" {
		method = "cash"
	}
	if _, ok := methodAz[method]; !ok {
		c.JSON(400, gin.H{"error": "Ödəniş üsulu düzgün deyil"})
		return
	}

	var inv Invoice
	var pay Payment
	uid := currentUserID(c)
	err = db.Transaction(func(tx *gorm.DB) error {
		if tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&inv, req.InvoiceID).Error != nil {
			return errors.New("Qaimə tapılmadı")
		}
		if inv.Status == "cancelled" {
			return errors.New("Qaimə ləğv edilib")
		}
		if inv.Status == "paid" {
			return errors.New("Qaimə artıq ödənilmiş kimi işarələnib")
		}
		remaining := math.Round((inv.Amount-inv.PaidAmount)*100) / 100
		if remaining <= 0 {
			return errors.New("Qaimə artıq tam ödənilib")
		}
		amount := remaining
		if req.Amount != nil {
			amount = math.Round(*req.Amount*100) / 100
		}
		if amount <= 0 {
			return errors.New("Məbləğ sıfırdan böyük olmalıdır")
		}
		if amount > remaining+0.001 {
			return fmt.Errorf("Məbləğ qalıqdan çoxdur (qalıq: %s %s)", money(remaining), inv.Currency)
		}
		pay = Payment{InvoiceID: inv.ID, StudentID: inv.StudentID, Amount: amount, Currency: inv.Currency, Method: method,
			PaidAt: when, Reference: strings.TrimSpace(req.Reference), Note: strings.TrimSpace(req.Note)}
		if uid != 0 {
			pay.CreatedBy = &uid
		}
		if err := tx.Create(&pay).Error; err != nil {
			return err
		}
		inv.PaidAmount = math.Round((inv.PaidAmount+amount)*100) / 100
		inv.Status = "partial"
		if inv.PaidAmount >= inv.Amount-0.001 {
			inv.Status = "paid"
		}
		inv.Method = method
		inv.PaidAt = &when
		up := map[string]interface{}{"paid_amount": inv.PaidAmount, "status": inv.Status, "method": method, "paid_at": when}
		if pay.Reference != "" {
			up["reference"] = pay.Reference
		}
		return tx.Model(&Invoice{}).Where("id = ?", inv.ID).Updates(up).Error
	})
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	left := math.Max(0, inv.Amount-inv.PaidAmount)
	body := fmt.Sprintf("%s qaiməsi üzrə %s %s %s ödəniş qəbul edildi.", firstNonEmpty(inv.Number, "#"+fmt.Sprint(inv.ID)), money(pay.Amount), inv.Currency, methodAz[method])
	if left > 0.001 {
		body += fmt.Sprintf(" Qalıq: %s %s.", money(left), inv.Currency)
	} else {
		body += " Qaimə tam ödənilib."
	}
	notifyAboutStudent(db, inv.StudentID, "payment", "Ödəniş qəbul edildi", body, "normal")
	audit(c, db, "payment", "invoices", &inv.ID, money(pay.Amount)+" "+inv.Currency+" ("+methodAz[method]+")")
	c.JSON(200, gin.H{"success": true, "payment_id": pay.ID, "paid_amount": inv.PaidAmount, "status": inv.Status})
}
