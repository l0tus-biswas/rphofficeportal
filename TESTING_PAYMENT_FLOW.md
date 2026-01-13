# Stripe Payment Flow Testing Guide

## Overview
The payment flow uses Stripe Checkout Session for a simple, secure payment process without webhooks.

## Flow Summary
1. User submits APA application
2. DocuSign sends signing email
3. User signs document
4. Payment email sent to user
5. User visits payment page
6. User redirects to Stripe Checkout
7. User completes payment
8. Stripe redirects to success page
9. Success page verifies payment and creates account
10. User auto-redirected to login

## Prerequisites
- Backend running on localhost:5000
- Frontend running on localhost:4200
- Stripe test keys configured in `.env`
- MongoDB running

## Test Steps

### 1. Start Services
```powershell
# Terminal 1 - Backend
cd C:\Users\lotus_biswas\Documents\rphoffice\backend
npm start

# Terminal 2 - Frontend
cd C:\Users\lotus_biswas\Documents\rphoffice\frontend
npm start
```

### 2. Submit APA Application
1. Navigate to http://localhost:4200/apply
2. Fill in application form:
   - Email: test@example.com
   - First Name: Test
   - Last Name: User
   - Phone: 555-555-5555
   - Address: 123 Test St
   - City: Test City
   - State: CA
   - Zip: 12345
   - SSN: 123-45-6789
   - DOB: 01/01/1990
   - License State: CA
   - License Number: TEST123
3. Submit application
4. Check email for DocuSign signing link

### 3. Sign Document
1. Open DocuSign email
2. Click "Review Document" link
3. Sign at all required signature fields
4. Click "Finish"
5. Check email for payment link

### 4. Test Payment Flow

#### Test Case 1: Payment with No Coupon
1. Open payment email
2. Click payment link
3. Verify payment page loads showing:
   - Setup Fee: $179.00
   - Monthly Subscription: $25.00/month
   - Total: $179.00
4. Click "Proceed to Payment"
5. Verify redirect to Stripe Checkout
6. Enter test card details:
   - Card: 4242 4242 4242 4242
   - Expiry: 12/34
   - CVC: 123
   - ZIP: 12345
7. Click "Pay"
8. Verify redirect to success page
9. Verify success message shows
10. Verify countdown timer
11. Wait for auto-redirect to login OR click "Go to Login"

#### Test Case 2: Payment with LICENSED Coupon (100% off setup)
1. On payment page, click "Have a coupon code?"
2. Enter: LICENSED
3. Click "Apply"
4. Verify pricing updates:
   - Setup Fee: $179.00 (100% off = $0.00)
   - Monthly Subscription: $25.00/month
   - Total: $0.00
5. Click "Proceed to Payment"
6. Complete Stripe checkout
7. Verify success page

#### Test Case 3: Payment with WELCOME50 Coupon (50% off setup)
1. Enter coupon: WELCOME50
2. Click "Apply"
3. Verify pricing:
   - Setup Fee: $179.00 (50% off = $89.50)
   - Total: $89.50
4. Complete payment flow

#### Test Case 4: Payment with FIRSTMONTHFREE Coupon (100% off first month)
1. Enter coupon: FIRSTMONTHFREE
2. Click "Apply"
3. Verify pricing:
   - Setup Fee: $179.00
   - Monthly Subscription: $25.00/month (100% off first invoice)
   - Total: $179.00
4. Complete payment flow

### 5. Verify Backend

After successful payment, verify in MongoDB:

```javascript
// Check user created
db.users.findOne({ email: 'test@example.com' })

// Check payment record
db.payments.findOne({ email: 'test@example.com' })

// Check subscription
db.subscriptions.findOne({ email: 'test@example.com' })

// Check application status
db.apaapplications.findOne({ email: 'test@example.com', status: 'active' })
```

### 6. Verify Email
Check email for welcome message containing:
- Login credentials
- Username: test@example.com
- Temporary password
- Link to login

### 7. Test Login
1. Navigate to http://localhost:4200/login
2. Enter credentials from email
3. Verify successful login
4. Verify dashboard loads

## Test Cards (Stripe Test Mode)

### Successful Payments
- **4242 4242 4242 4242** - Succeeds
- **5555 5555 5555 4444** - Succeeds (Mastercard)
- **3782 822463 10005** - Succeeds (Amex)

### Failed Payments (Test Error Handling)
- **4000 0000 0000 0002** - Card declined
- **4000 0000 0000 9995** - Insufficient funds
- **4000 0000 0000 0069** - Card expired
- **4000 0000 0000 0127** - Incorrect CVC

## Troubleshooting

### Issue: "Failed to create checkout session"
- Check backend logs for errors
- Verify Stripe keys in .env
- Verify application exists and is signed
- Check MongoDB connection

### Issue: "Payment verification failed"
- Check Stripe dashboard for session
- Verify session_id in URL
- Check backend logs
- Verify MongoDB connection

### Issue: Success page shows error
- Check browser console for errors
- Verify session_id query parameter
- Check backend /verify-payment endpoint logs
- Verify Stripe session is paid

### Issue: User not created
- Check email exists
- Verify password generation
- Check MongoDB user collection
- Review backend logs

### Issue: Email not sent
- Verify SMTP configuration in .env
- Check email service logs
- Verify recipient email is valid

## Expected Backend Logs

```
=== Processing Stripe Checkout Session ===
Application ID: [id]
Coupon Code: [code or undefined]
Creating Stripe Checkout Session...
Session created: [session_id]

=== Payment Verification Request ===
Session ID: [session_id]
Retrieving session from Stripe...
Payment verified successfully
Creating user account...
User created: [user_id]
Sending welcome email...
```

## API Endpoints Tested

- **POST** `/api/apa-application/create-checkout-session`
  - Body: `{ applicationId, couponCode? }`
  - Returns: `{ url: 'https://checkout.stripe.com/...' }`

- **GET** `/api/apa-application/verify-payment?session_id=cs_test_...`
  - Returns: `{ message, email, accountCreated: true }`

## Success Criteria

✅ Application submitted successfully
✅ DocuSign email received
✅ Document signed successfully
✅ Payment email received
✅ Checkout session created
✅ Stripe Checkout loads correctly
✅ Payment processed successfully
✅ Redirected to success page
✅ Payment verified on backend
✅ User account created
✅ Payment record created
✅ Subscription record created
✅ Application status updated to 'active'
✅ Welcome email sent
✅ Auto-redirect to login works
✅ Login successful with credentials

## Notes

- No webhook configuration needed
- Payment verification happens synchronously on success page
- All payment processing done through Stripe Checkout
- User account created after successful payment verification
- Temporary password sent via email
- User must change password on first login
