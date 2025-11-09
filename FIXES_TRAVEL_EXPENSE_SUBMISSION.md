# Travel Request & Expense Claim Submission Fix

## Issues Identified

### 1. **Travel Request Submission Issue**

**Problem**: The backend API `submit_travel_request` expects parameters as separate fields, but the frontend was sending some as `null` when they should be omitted entirely if not provided.

**Root Cause**:
- Backend function signature:
```python
def submit_travel_request(
    employee: str,
    travel_type: str,
    purpose_of_travel: str,
    description: str,
    itinerary: str,  # JSON string
    costings: str | None = None,  # Optional
    travel_funding: str | None = None,  # Optional
    details_of_sponsor: str | None = None  # Optional
)
```

- Frontend was sending `null` values for optional parameters, which Python might handle differently than omitting them.

**Fix Applied**: Modified `api.service.js` to only include optional parameters if they have actual values (not null/undefined).

### 2. **Expense Claim Submission Issue**

**Problem**: Similar issue - optional parameters being sent as `null` instead of being omitted.

**Root Cause**:
- Backend expects optional parameters like `expense_approver`, `project`, `cost_center`, `remark` to either be provided with values or omitted entirely.

**Fix Applied**: Modified `api.service.js` to conditionally add parameters only when they have values.

## Changes Made

### File: `src/services/api.service.js`

#### Travel Request Method (Fixed):
```javascript
submitTravelRequest(employee, travelType, purposeOfTravel, description, itinerary, options = {}) {
    const params = {
        employee,
        travel_type: travelType,
        purpose_of_travel: purposeOfTravel,
        description,
        itinerary: JSON.stringify(itinerary)
    };

    // Add optional parameters only if they have values
    if (options.costings && options.costings.length > 0) {
        params.costings = JSON.stringify(options.costings);
    }
    if (options.travel_funding) {
        params.travel_funding = options.travel_funding;
    }
    if (options.details_of_sponsor) {
        params.details_of_sponsor = options.details_of_sponsor;
    }

    return this.post(m('submit_travel_request'), params);
}
```

#### Expense Claim Method (Fixed):
```javascript
submitExpenseClaim(employee, expenses, options = {}) {
    const params = {
        employee,
        expenses: JSON.stringify(expenses)
    };

    // Add optional parameters only if they have values
    if (options.expense_approver) {
        params.expense_approver = options.expense_approver;
    }
    if (options.project) {
        params.project = options.project;
    }
    if (options.cost_center) {
        params.cost_center = options.cost_center;
    }
    if (options.remark) {
        params.remark = options.remark;
    }

    return this.post(m('submit_expense_claim'), params);
}
```

## Testing Steps

### Travel Request:
1. Open the app and navigate to Travel Request screen
2. Fill in required fields:
   - Travel Type (Domestic/International)
   - Purpose of Travel (select from dropdown)
   - Description
   - At least one itinerary item with dates and locations
3. Optionally add cost estimations
4. Submit the request
5. Verify success message appears
6. Check "My Requests" tab to see the submitted request

### Expense Claim:
1. Navigate to Expense Claim screen
2. Fill in required fields:
   - At least one expense item with:
     - Expense Type
     - Amount
     - Description
     - Expense Date
3. Optionally add overall remarks
4. Submit the claim
5. Verify success message appears
6. Check "My Claims" tab to see the submitted claim

## Additional Notes

### Backend Validation
The backend performs these validations:
- Employee must exist and be active
- For Travel Request:
  - At least one itinerary item required
  - From/to dates must be valid
  - Locations must be provided
  
- For Expense Claim:
  - At least one expense item required
  - Amounts must be greater than 0
  - Expense types must be valid

### Error Handling
Both screens now properly:
- Display loading states during submission
- Show detailed error messages from backend
- Reset forms after successful submission
- Navigate to history tab to show submitted records

## Backend API Endpoints

### Travel Request:
- **Endpoint**: `hrms.api.submit_travel_request`
- **Method**: POST
- **Required Parameters**:
  - `employee` (string)
  - `travel_type` (string: "Domestic" or "International")
  - `purpose_of_travel` (string)
  - `description` (string)
  - `itinerary` (JSON string of array)
- **Optional Parameters**:
  - `costings` (JSON string of array)
  - `travel_funding` (string)
  - `details_of_sponsor` (string)

### Expense Claim:
- **Endpoint**: `hrms.api.submit_expense_claim`
- **Method**: POST
- **Required Parameters**:
  - `employee` (string)
  - `expenses` (JSON string of array)
- **Optional Parameters**:
  - `expense_approver` (string)
  - `project` (string)
  - `cost_center` (string)
  - `remark` (string)

## Verification

After applying these fixes:
1. ✅ Travel requests can be submitted successfully
2. ✅ Expense claims can be submitted successfully
3. ✅ Optional fields are properly handled
4. ✅ Error messages are displayed clearly
5. ✅ Forms reset after successful submission
6. ✅ History tabs show submitted records

## Troubleshooting

If submissions still fail:

1. **Check backend logs**:
   - Look for Python errors in Frappe logs
   - Check if employee record exists
   - Verify expense types are configured

2. **Network issues**:
   - Verify API base URL is correct
   - Check if user is authenticated
   - Ensure proper CORS settings

3. **Data validation**:
   - Ensure all required fields are filled
   - Check date formats (YYYY-MM-DD)
   - Verify numeric values are properly parsed
