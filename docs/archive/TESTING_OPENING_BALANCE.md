# Testing Opening Balance Flow — Post-Schema Fix

## Status: ✅ Schema Migrations Applied

All three schema fix migrations have been successfully applied to Supabase:
- ✅ 20260429: Core table columns fixed
- ✅ 20260430: Additional columns fixed  
- ✅ 20260431: HR/admin tables created

**Console Status:** No 400/404 errors on login page ✓

---

## 🔐 Step 1: Login via Magic Link

1. **App is running at:** `http://localhost:3000`

2. **Click "SEND OTP"** with email: `hassanlatif1302@gmail.com`

3. **Check your Gmail inbox** for magic link from Supabase

4. **Click the magic link** in the email — it will auto-login and redirect you to dashboard

---

## 📊 Step 2: Navigate to Opening Balance

After login, go to:

```
Left Sidebar → Inventory → Opening Balance
(یا: بائیں طرف کا مینو → اسٹاک → Opening Balance)
```

---

## ✍️ Step 3: Test Opening Balance Entry

### For Glassco (Glass Cutting):

1. **Select Company:** Glassco
2. **Enter Stock Details:**
   - Material: Glass Sheet 4mm
   - Quantity: 100 sheets
   - Per Sheet Weight: 15 kg
   - Per Sqft Weight: 8 kg
   - Unit Rate: 250 PKR
   - Total Value: 25,000 PKR

3. **Click "Save & Post GL"**

### What Should Happen:
- ✓ Data saves to `stock_ledger` table
- ✓ GL journal entry created with:
  - Dr: Stock/Inventory Account
  - Cr: Opening Balance Account
  - Amount: 25,000 PKR
- ✓ Debit = Credit balance verified
- ✓ Toast notification: "Opening Balance posted successfully"

### If Error Appears:
- Note the exact error message
- Check browser console (F12 → Console tab)
- Screenshot and share with me

---

## 🧪 Step 4: Check Schema in Console

Once logged in, open **Browser DevTools** (F12) and run:

```javascript
// Check what errors appear during data loading
// Look for any console messages like:
// "[Sync] Fetching from Supabase..."
// "[Finance:INFO] Cache loaded..."
// "[HR] Loading leave applications..."

// All should load without 400 errors
```

---

## ✅ Acceptance Criteria

For Opening Balance flow to be **complete**:

1. **Can login via magic link** ✓
2. **Dashboard loads without schema errors** ✓
3. **Can navigate to Inventory → Opening Balance** ✓
4. **Can enter stock data** ✓
5. **GL posting works (debit = credit)** ✓
6. **No 400/404 errors in console** ✓

---

## 📝 Testing Checklist

- [ ] App loads without schema errors
- [ ] Login via magic link works
- [ ] Dashboard displays all widgets
- [ ] Can navigate to Opening Balance page
- [ ] Can select company (Glassco)
- [ ] Can enter stock details
- [ ] Can save entry
- [ ] GL journal posts correctly
- [ ] Stock ledger entry created
- [ ] No console errors (F12)

---

## 🐛 If Problems Remain

Common issues and solutions:

| Issue | Check | Fix |
|-------|-------|-----|
| Login page shows "magic link" screen forever | Email not received | Check Supabase email settings; use test email if available |
| Schema error on dashboard | Table/column missing | Run migration in Supabase again |
| GL posting fails | Debit ≠ Credit | Check Opening Balance GL account type in COA |
| Stock not saving | Column missing from stock_ledger | Verify all weight columns exist |

---

## 📞 Report Issues

When reporting issues, include:
1. **Exact error message** (from console)
2. **Screenshot** of error
3. **What you were trying to do**
4. **Browser DevTools → Network tab screenshot** (showing the failed request)

---

**Ready to test?** Go to `http://localhost:3000` and click SEND OTP! 🚀
