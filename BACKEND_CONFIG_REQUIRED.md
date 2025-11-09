# 🔴 URGENT: Backend Configuration Required

## Issues Found During Testing

The submissions are **working correctly** - the app is now properly showing backend validation errors! 

However, **backend configuration is missing**. Here's what needs to be fixed on the Frappe/ERPNext side:

---

## 1. ❌ Expense Claim Type - Missing Default Account

### Error Message:
```
Set the default account for the Expense Claim Type "Business Meals"
```

### What's Wrong:
The Expense Claim Type "Business Meals" exists in the system, but doesn't have a default expense account configured.

### How to Fix:

1. **Login to Frappe** (https://hr.deepgrid.in)
2. **Navigate to:** HR → Expense Claim Type → Business Meals
3. **Add Default Account:**
   - Click "Edit"
   - Look for "Accounts" or "Default Account" section
   - Add a default expense account for the company
   - Common accounts: "Travel Expenses", "Employee Benefits", etc.
4. **Save**

### SQL Check (if needed):
```sql
-- Check expense claim types
SELECT name, default_account 
FROM `tabExpense Claim Type` 
WHERE name = 'Business Meals';

-- Update default account (replace with actual account)
UPDATE `tabExpense Claim Type` 
SET default_account = 'Travel Expenses - YourCompany' 
WHERE name = 'Business Meals';
```

### Proper Configuration:
Each **Expense Claim Type** must have:
- ✅ Default Account for each company
- ✅ Description
- ✅ Status: Active

**To configure all expense types:**
1. Go to: **Setup → Expense Claim Type**
2. For each type (Travel, Meals, Accommodation, etc.):
   - Set default account per company
   - Example: "Business Meals" → "Travel Expenses - DeepGrid"

---

## 2. ✅ Travel Funding Options - FIXED in App

### Error Message (Original):
```
Travel Funding cannot be "Company Sponsored". 
It should be one of "", "Require Full Funding", "Fully Sponsored", 
"Partially Sponsored, Require Partial Funding"
```

### What Was Wrong:
App was using incorrect values: "Company Sponsored", "Self Sponsored", "Third Party Sponsored"

### Fix Applied:
Updated `TravelRequestScreen.js` to use correct backend values:
- ✅ **"Fully Sponsored"** (default)
- ✅ **"Require Full Funding"**
- ✅ **"Partially Sponsored, Require Partial Funding"**

---

## 3. 📋 Complete Backend Checklist

### ✅ **Employee Records:**
- [ ] All employees have `user_id` linked to Frappe users
- [ ] Employee status = "Active"
- [ ] Company field populated
- [ ] Department assigned

**Check in Frappe:**
```
HR → Employee → [Employee Name]
- User ID: <linked user email>
- Status: Active
- Company: DeepGrid (or your company)
```

### ✅ **Expense Claim Configuration:**
- [ ] **Expense Claim Types** exist (Travel, Meals, Accommodation, etc.)
- [ ] Each type has **default account** configured
- [ ] Accounts are valid for the company
- [ ] Types are enabled/active

**Navigate to:**
```
Setup → Expense Claim Type
```

**Required Types:**
| Type | Default Account Example |
|------|------------------------|
| Travel | Travel Expenses - DeepGrid |
| Business Meals | Entertainment Expenses - DeepGrid |
| Accommodation | Travel Expenses - DeepGrid |
| Fuel | Vehicle Expenses - DeepGrid |
| Telephone | Telephone Expenses - DeepGrid |

### ✅ **Travel Request Configuration:**
- [ ] **Purpose of Travel** list populated
- [ ] Travel modes configured (if custom)
- [ ] Travel request approval workflow (optional)

**Navigate to:**
```
HR → Purpose of Travel
```

**Common Purposes:**
- Annual General Meeting ✅
- Client Meeting
- Training
- Conference
- Site Visit
- Team Building

### ✅ **Chart of Accounts:**
- [ ] Expense accounts exist under "Expenses" group
- [ ] Accounts linked to correct company
- [ ] Account types set correctly

**Navigate to:**
```
Accounting → Chart of Accounts
```

**Check these accounts exist:**
- Travel Expenses
- Entertainment Expenses
- Employee Benefits
- Telephone Expenses
- Vehicle Expenses

---

## 4. 🔧 Quick Fix Commands (Frappe Console)

### Create Missing Expense Account (Example):
```python
import frappe

# Create expense account if missing
frappe.get_doc({
    "doctype": "Account",
    "account_name": "Travel Expenses",
    "parent_account": "Indirect Expenses - DG",  # Adjust parent
    "company": "DeepGrid",  # Your company
    "account_type": "Expense Account",
    "is_group": 0
}).insert()

# Link to Expense Claim Type
expense_type = frappe.get_doc("Expense Claim Type", "Business Meals")
expense_type.append("accounts", {
    "company": "DeepGrid",
    "default_account": "Travel Expenses - DG"
})
expense_type.save()
frappe.db.commit()
```

### Verify Employee Configuration:
```python
import frappe

# Check employee
emp = frappe.get_doc("Employee", "HR-EMP-00008")
print(f"Employee: {emp.employee_name}")
print(f"User ID: {emp.user_id}")
print(f"Status: {emp.status}")
print(f"Company: {emp.company}")
```

### Create Purpose of Travel:
```python
import frappe

purposes = [
    "Annual General Meeting",
    "Client Meeting",
    "Training",
    "Conference",
    "Site Visit"
]

for purpose in purposes:
    if not frappe.db.exists("Purpose of Travel", purpose):
        frappe.get_doc({
            "doctype": "Purpose of Travel",
            "purpose": purpose,
            "description": purpose
        }).insert()

frappe.db.commit()
```

---

## 5. 🧪 Test Again After Backend Fix

### **Test Expense Claim:**
1. Fix the default account for "Business Meals" in Frappe
2. In the app, submit the same expense claim
3. Should now succeed!

### **Test Travel Request:**
1. The app is already fixed (using "Fully Sponsored")
2. Submit a travel request
3. Should now succeed!

### **Expected Success Response:**
```javascript
LOG  Expense claim response: {
    success: true,
    data: {
        message: {
            claim_id: "HR-EXP-2025-00001",
            total_claimed_amount: 500,
            status: "Draft"
        }
    }
}
```

---

## 6. 📞 Backend Team Action Items

### **Priority 1: Fix Expense Account (Blocking submissions)**
1. Open Frappe
2. Go to: Setup → Expense Claim Type → Business Meals
3. Add default account for your company
4. Save

### **Priority 2: Verify Other Expense Types**
Check all expense types have default accounts:
```bash
bench --site hr.deepgrid.in console
>>> types = frappe.get_all("Expense Claim Type", fields=["name", "default_account"])
>>> for t in types:
...     print(f"{t.name}: {t.default_account or 'MISSING!'}")
```

### **Priority 3: Validate Setup**
```bash
# Check employees
>>> frappe.db.sql("SELECT name, user_id FROM `tabEmployee` WHERE user_id IS NULL")

# Check expense types
>>> frappe.db.sql("SELECT name FROM `tabExpense Claim Type` WHERE default_account IS NULL")

# Check purposes
>>> frappe.db.sql("SELECT name FROM `tabPurpose of Travel`")
```

---

## 7. ✅ Summary

### App Changes Made:
- ✅ Fixed error handling (shows backend errors now)
- ✅ Fixed Travel Funding options to match backend values
- ✅ Added console logging for debugging

### Backend Changes Needed:
- ❌ **URGENT:** Configure default account for "Business Meals" expense type
- ⚠️ Verify all expense types have default accounts
- ⚠️ Ensure Purpose of Travel list is populated
- ⚠️ Verify employee records are properly configured

### After Backend Fix:
Both Expense Claims and Travel Requests will work perfectly! 🎉
