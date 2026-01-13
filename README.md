# RHP Office - Insurance Agent Recruiting Platform

## 📋 Project Overview

RHP Office is a comprehensive full-stack MERN (MongoDB, Express, Angular, Node.js) insurance agent recruiting and onboarding platform. The system features role-based authentication, APA (Agent Producer Agreement) application processing, DocuSign integration for e-signatures, Stripe payment processing, genealogy tracking, and complete agent management.

## 🚀 Features

### Core Features
- **Role-Based Authentication**: Admin and Agent roles with JWT tokens
- **Public Recruiting Links**: Each agent has a unique 5-character referral code (e.g., `/apply?ref=ADM2X`)
- **APA Application**: 5-section comprehensive application form
  - Personal Information (names, DOB, SSN, addresses)
  - Recruiting Information (recruiter details, team info)
  - Compliance Questions (background checks with conditional explanations)
  - Financial Background (judgments, liens, bankruptcy history)
  - Licensing Status (current licenses, states, numbers)
- **DocuSign Integration**: Email-based remote signing for APA agreements
- **Stripe Payment Processing**: One-time setup fee ($179) and monthly subscriptions ($25)
- **Coupon System**: Discount codes for signup fees and subscriptions
- **Genealogy Tree**: Complete downline/hierarchy tracking with referrer information
- **Training Management**: Admin can upload and manage training materials
- **Branding Management**: Custom brand colors and styling per admin
- **User Management**: Admin can activate/deactivate users and view statistics
- **Profile Management**: Users can update their profiles
- **Password Reset**: Secure forgot/reset password flow with email

### Application Workflow
1. **Application Submission**: User fills 5-section APA form at `/apply?ref=XXXXX`
2. **Success Page**: User sees confirmation with next steps
3. **DocuSign Email**: User receives signing email from DocuSign
4. **Document Signing**: User signs APA agreement via email link
5. **Payment Email**: System auto-sends payment link after signing
6. **Payment Setup**: User completes $179 setup fee and subscribes
7. **Account Activation**: Admin reviews and activates account

### Role Permissions

#### Admin
- View full hierarchy (all agents)
- Manage all users (create, edit, activate/deactivate)
- Review APA applications
- Upload and manage training materials
- Create and manage discount coupons (setup fee & subscription)
- Configure branding (colors, logo)
- Access all statistics and analytics
- View payment history

#### Agent
- Submit APA application via referral link
- Sign documents via DocuSign email
- Complete payment setup (Stripe)
- View their profile and update it
- See their complete downline tree
- Access training materials
- Get their unique referral link
- View recruiting statistics

## 🏗️ Architecture

```
rhpoffice/
├── backend/                 # Node.js + Express API
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   ├── middleware/         # Auth, validation, rate limiting
│   ├── utils/              # Helper functions, email
│   ├── tests/              # Jest unit tests
│   └── server.js           # Entry point
│
├── frontend/               # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/    # UI components
│   │   │   ├── services/      # API services
│   │   │   ├── guards/        # Route guards
│   │   │   ├── interceptors/  # HTTP interceptors
│   │   │   └── models/        # TypeScript interfaces
│   │   ├── environments/      # Environment configs
│   │   └── styles.css         # Global styles
│   └── angular.json
│
└── postman/                # Postman collection
```

## 📦 Installation & Setup

### Prerequisites
- Node.js (v16+)
- MongoDB (v5+)
- Angular CLI (v17+)
- Git

### Backend Setup

1. **Navigate to backend directory**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rhpoffice

# JWT Secret Keys
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRE=30d

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=RHP Office

# Application URLs
APP_URL=http://localhost:4200
BACKEND_URL=http://localhost:5000

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_ONE_TIME_PRICE=17900  # $179 setup fee in cents
STRIPE_MONTHLY_SUBSCRIPTION_PRICE=2500  # $25 monthly in cents

# DocuSign Integration
DOCUSIGN_INTEGRATION_KEY=your-integration-key
DOCUSIGN_ACCOUNT_ID=your-account-id
DOCUSIGN_USER_ID=your-user-id
DOCUSIGN_PRIVATE_KEY_PATH=./config/docusign_private.key
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_TEMPLATE_ID=your-template-id
DOCUSIGN_WEBHOOK_SECRET=your-webhook-hmac-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
APPLY_RATE_LIMIT_MAX=3
```

4. **Start MongoDB**
```bash
mongod
```

5. **Run backend server**
```bash
npm run dev
```

Backend will run on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend directory**
```bash
cd frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
Edit `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  appUrl: 'http://localhost:4200'
};
```

4. **Start Angular development server**
```bash
npm start
```

Frontend will run on `http://localhost:4200`

## 🔑 Initial Admin Account

Create your first admin account manually in MongoDB:

```javascript
use rhpoffice

db.users.insertOne({
  name: "Admin User",
  email: "admin@rhpoffice.com",
  password: "$2a$10$hashed_password_here", // Use bcrypt to hash
  phone: "1234567890",
  role: "admin",
  referralCode: "ADMIN001",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Or use the backend to create one:
```bash
node scripts/createAdmin.js
```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication
Most endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### Endpoints Overview

#### Public Endpoints (No Auth Required)
- `POST /api/public/apa-application` - Submit APA application
- `GET /api/public/apa-application/:id` - Get application by ID
- `POST /api/public/apa-application/docusign-webhook` - DocuSign webhook
- `GET /api/public/apa-application/docusign-webhook` - Webhook status info
- `GET /api/public/verify-referral/:code` - Verify referral code
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password

#### Payment Endpoints
- `POST /api/payment/create-checkout-session` - Create Stripe checkout
- `POST /api/payment/webhook` - Stripe webhook
- `GET /api/payment/verify/:applicationId` - Verify payment status

#### APA Application Endpoints (Admin)
- `GET /api/admin-apa/applications` - List all applications
- `GET /api/admin-apa/applications/:id` - Get application details
- `PUT /api/admin-apa/applications/:id/approve` - Approve application
- `PUT /api/admin-apa/applications/:id/reject` - Reject application

#### Agent Endpoints (Agent/Admin Auth Required)
- `GET /api/agent/profile` - Get profile
- `PUT /api/agent/profile` - Update profile
- `POST /api/agent/change-password` - Change password
- `GET /api/agent/recruits` - Get direct recruits
- `GET /api/agent/downline` - Get downline tree
- `GET /api/agent/stats` - Get statistics
- `GET /api/agent/referral-link` - Get referral link

#### Admin Endpoints (Admin Auth Required)
- `GET /api/admin/hierarchy` - Get full hierarchy
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user details
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `PUT /api/admin/users/:id/activate` - Activate user
- `PUT /api/admin/users/:id/deactivate` - Deactivate user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/stats` - Get admin statistics
- `GET /api/admin/audit-logs` - Get audit logs

#### Training Endpoints (Auth Required)
- `GET /api/training/materials` - List training materials
- `GET /api/training/materials/:id` - Get material details
- `GET /api/training/categories` - Get categories
- `POST /api/training/materials` - Create material (Admin)
- `PUT /api/training/materials/:id` - Update material (Admin)
- `DELETE /api/training/materials/:id` - Delete material (Admin)

## 🔌 Third-Party Integrations

### DocuSign Integration

DocuSign handles the APA (Agent Producer Agreement) e-signature process.

#### Setup Steps:

1. **Create DocuSign Developer Account**
   - Go to https://developers.docusign.com/
   - Sign up for a free developer account
   - You'll get a demo environment

2. **Create Integration Key**
   - Navigate to Settings → Apps and Keys
   - Click "Add App and Integration Key"
   - Save the Integration Key (this is `DOCUSIGN_INTEGRATION_KEY`)
   - Save your Account ID and User ID

3. **Generate RSA Key Pair**
   ```bash
   cd backend/config
   openssl genrsa -out docusign_private.key 2048
   openssl rsa -in docusign_private.key -pubout -out docusign_public.key
   ```

4. **Add Public Key to DocuSign**
   - In DocuSign, go to your Integration Key
   - Click "Add RSA Key Pair"
   - Paste contents of `docusign_public.key`
   - Save

5. **Grant Consent**
   - Use this URL (replace YOUR_INTEGRATION_KEY):
   ```
   https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=http://localhost:5000/callback
   ```
   - Visit in browser and click "Allow Access"

6. **Create APA Template**
   - Go to Templates in DocuSign
   - Create new template
   - Upload APA PDF document
   - Add fields: recipient name, date, signature, etc.
   - Map field names to match your form data
   - Save template and copy Template ID

7. **Configure Webhook (Connect)**
   - Go to Settings → Connect → Custom
   - Click "Add Configuration"
   - Name: "RHP APA Webhook"
   - URL: `https://your-domain.com/api/public/apa-application/docusign-webhook`
   - Enable events: Envelope Sent, Envelope Completed, Envelope Declined, Envelope Voided
   - Enable "Include HMAC Signature"
   - Click "Manage Keys" to get the HMAC secret
   - Save the secret as `DOCUSIGN_WEBHOOK_SECRET`

#### How It Works:
1. User submits APA application
2. Backend creates DocuSign envelope using template
3. DocuSign sends signing email to applicant
4. User signs document via email link
5. DocuSign webhook notifies backend on completion
6. Backend updates application status to `pending_payment`
7. Backend sends payment link email to user

### Stripe Integration

Stripe processes the one-time setup fee ($179) and monthly subscriptions ($25).

#### Setup Steps:

1. **Create Stripe Account**
   - Go to https://stripe.com/
   - Sign up for account
   - Use test mode for development

2. **Get API Keys**
   - Go to Developers → API Keys
   - Copy Secret Key (starts with `sk_test_`)
   - Copy Publishable Key (starts with `pk_test_`)

3. **Create Products & Prices**
   ```bash
   # One-time setup fee
   - Product: "Agent Setup Fee"
   - Price: $179 (one-time)
   
   # Monthly subscription
   - Product: "Agent Monthly Subscription"
   - Price: $25 (recurring monthly)
   ```

4. **Configure Webhook**
   - Go to Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/payment/webhook`
   - Select events: 
     - `checkout.session.completed`
     - `invoice.paid`
     - `customer.subscription.deleted`
   - Copy webhook signing secret (starts with `whsec_`)

5. **Update Environment Variables**
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

#### How It Works:
1. User completes DocuSign signing
2. Backend sends payment link email
3. User clicks link → redirected to payment page
4. Frontend creates Stripe Checkout session
5. User completes payment on Stripe's hosted page
6. Stripe webhook notifies backend
7. Backend updates user status to `active`
8. User can now log in

### Email Configuration (SMTP)

The system sends transactional emails via SMTP.

#### Gmail Setup:
1. Enable 2-Factor Authentication on Gmail
2. Go to Account → Security → App Passwords
3. Generate new app password for "Mail"
4. Use in `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=generated-app-password
   ```

#### Email Types:
- **Application Confirmation**: Sent after APA submission
- **Payment Link**: Sent after DocuSign completion  
- **Welcome Email**: Sent after payment completion with login credentials
- **Password Reset**: Sent with reset token link

## 🧪 Testing

### Run Unit Tests
```bash
cd backend
npm test
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Import Postman Collection
1. Open Postman
2. Click Import
3. Select `postman/RHPOffice-API.postman_collection.json`
4. Set the `baseUrl` variable to `http://localhost:5000/api`
5. Login using the Login endpoint
6. The token will be automatically saved for subsequent requests

## 🔒 Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **JWT Authentication**: Secure token-based auth
3. **Rate Limiting**: 
   - Login: 5 attempts per 15 minutes
   - Apply form: 3 submissions per hour
   - General API: 100 requests per 15 minutes
4. **Input Validation**: Joi schemas for all inputs
5. **Helmet**: Security headers
6. **CORS**: Configured for specific origins
7. **Audit Logging**: All admin actions logged

## 🌳 Genealogy System

### How It Works

1. **Agent Referral Code**: Each agent has a unique code (e.g., `AGT12345`)
2. **Referral Link**: `https://RHPOffice.com/apply/?ref=AGT12345`
3. **Application**: When someone applies using this link:
   - New user account is created
   - `referredBy` field points to the agent
   - Agent's `children` array is updated
4. **Tree Structure**: 
   - Each user has `referredBy` (parent)
   - Each user has `children` array (direct recruits)
   - Recursive queries build the full tree

### Example Tree
```
Admin (AGT001)
├── Agent 1 (AGT123)
│   ├── Recruit 1
│   ├── Recruit 2
│   └── Agent 2 (AGT456)
│       ├── Recruit 3
│       └── Recruit 4
└── Agent 3 (AGT789)
    └── Recruit 5
```

## 📧 Email Configuration

The system uses Nodemailer for sending emails. Configure SMTP in `.env`:

### Gmail Setup
1. Enable 2-Factor Authentication
2. Generate App Password
3. Use in `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Email Templates
- **Welcome Email**: Sent on account creation with credentials
- **Password Reset**: Sent with reset link (10-minute expiry)

## 🎨 Frontend Components

### Public Components
- **LoginComponent**: User authentication
- **ApplyComponent**: Public application form
- **ForgotPasswordComponent**: Request password reset
- **ResetPasswordComponent**: Reset password with token

### Authenticated Components
- **DashboardComponent**: Role-specific dashboard
- **ProfileComponent**: User profile management
- **RecruitsComponent**: View direct recruits (Agent)
- **DownlineComponent**: View complete downline tree (Agent)
- **TrainingComponent**: Access training materials

### Admin Components
- **AdminDashboardComponent**: Admin overview
- **UserManagementComponent**: CRUD operations on users
- **HierarchyComponent**: Full genealogy tree
- **TrainingManagementComponent**: Manage training materials

### Shared Components
- **NavbarComponent**: Top navigation
- **SidebarComponent**: Side navigation menu

## 🚀 Deployment

### Backend Deployment (Heroku Example)

1. **Install Heroku CLI**
```bash
npm install -g heroku
```

2. **Login and create app**
```bash
heroku login
heroku create rhpoffice-api
```

3. **Set environment variables**
```bash
heroku config:set MONGODB_URI=your-mongo-atlas-uri
heroku config:set JWT_SECRET=your-secret
heroku config:set NODE_ENV=production
```

4. **Deploy**
```bash
git subtree push --prefix backend heroku master
```

### Frontend Deployment (Netlify/Vercel)

1. **Build for production**
```bash
cd frontend
npm run build
```

2. **Deploy dist folder**
- Netlify: Drag `dist/rhpoffice-frontend` to Netlify
- Vercel: `vercel --prod`

3. **Update environment**
Edit `environment.prod.ts` with production API URL

## 📊 Database Schema

### APAApplication Collection
```javascript
{
  _id: ObjectId,
  personalInfo: {
    firstName: String,
    middleName: String,
    lastName: String,
    suffix: String,
    dateOfBirth: Date,
    ssn: String (encrypted),
    phone: String,
    email: String,
    residentialAddress: { street, city, state, zip },
    mailingAddress: { street, city, state, zip, sameAsResidential }
  },
  recruitingInfo: {
    recruiterName: String,
    referralCode: String,
    teamName: String
  },
  complianceQuestions: {
    criminalHistory: Boolean,
    regulatoryAction: Boolean,
    civilJudgment: Boolean,
    bankruptcy: Boolean,
    felonyConviction: Boolean,
    bondDenial: Boolean,
    explanations: { ... }
  },
  financialBackground: {
    unsatisfiedJudgment: Boolean,
    outstandingTaxLien: Boolean,
    bankruptcy: Boolean,
    bankruptcyDetails: { ... }
  },
  licensingStatus: {
    currentlyLicensed: Boolean,
    licenseStates: [String],
    licenseNumbers: [String],
    yearsExperience: String
  },
  docusign: {
    envelopeId: String,
    status: String (enum: sent, completed, declined, voided),
    sentDate: Date,
    signedDate: Date,
    signedDocumentPath: String
  },
  payment: {
    setupFeeAmount: Number (default: 179),
    subscriptionFeeAmount: Number (default: 25),
    couponCode: String,
    discountAmount: Number,
    stripeCustomerId: String,
    stripePaymentIntentId: String,
    stripeSubscriptionId: String,
    paymentStatus: String (enum: pending, completed, failed),
    authorizedAt: Date
  },
  status: String (enum: pending_signature, pending_payment, completed, declined, voided),
  createdAt: Date,
  updatedAt: Date
}
```

### User Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  phone: String,
  password: String (hashed),
  role: String (enum: admin, agent),
  referralCode: String (unique, 5 chars like ADM2X, AGTH9),
  referredBy: ObjectId (ref: User),
  children: [ObjectId] (refs: User),
  isActive: Boolean,
  address: String,
  city: String,
  state: String,
  zipCode: String,
  apaApplicationId: ObjectId (ref: APAApplication),
  metadata: Map,
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date
}
```

### Payment Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  applicationId: ObjectId (ref: APAApplication),
  type: String (enum: setup_fee, subscription),
  amount: Number,
  currency: String (default: USD),
  status: String (enum: pending, succeeded, failed, refunded),
  stripePaymentIntentId: String,
  stripeSubscriptionId: String,
  couponCode: String,
  discountAmount: Number,
  metadata: Map,
  createdAt: Date,
  updatedAt: Date
}
```

### Subscription Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  stripeSubscriptionId: String,
  stripePriceId: String,
  status: String (enum: active, canceled, past_due, unpaid),
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Coupon Collection
```javascript
{
  _id: ObjectId,
  code: String (unique),
  description: String,
  discountType: String (enum: percentage, fixed),
  discountValue: Number,
  appliesTo: String (enum: setup_fee, subscription, both),
  maxUses: Number,
  usedCount: Number,
  expiresAt: Date,
  isActive: Boolean,
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### TrainingMaterial Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  phone: String,
  password: String (hashed),
  role: String (enum: admin, agent, recruit),
  referralCode: String (unique, for agents),
  referredBy: ObjectId (ref: User),
  children: [ObjectId] (refs: User),
  isActive: Boolean,
  address: String,
  city: String,
  state: String,
  zipCode: String,
  metadata: Map,
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date
}
```

### TrainingMaterial Collection
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  type: String (enum: link, youtube, document, video),
  url: String,
  category: String,
  tags: [String],
  accessLevel: String (enum: all, agent, recruit),
  uploadedBy: ObjectId (ref: User),
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## 🐛 Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Ensure MongoDB is running: `mongod` or `brew services start mongodb-community`

### Email Sending Error
```
Error: Invalid login
```
**Solution**: Check SMTP credentials and enable "Less secure app access" or use App Password

### CORS Error
```
Access to XMLHttpRequest has been blocked by CORS policy
```
**Solution**: Ensure backend CORS is configured for frontend URL in `server.js`

### JWT Token Error
```
401 Unauthorized - Token is invalid
```
**Solution**: Token may be expired. Login again to get a new token.

## 📝 Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **Passwords**: Always use strong passwords and bcrypt hashing
3. **Rate Limiting**: Adjust limits based on your needs
4. **Database Indexes**: Created for performance on common queries
5. **Error Handling**: All routes have try-catch blocks
6. **Validation**: Both client-side (Angular) and server-side (Joi)
7. **Audit Trail**: Admin actions are logged
8. **Testing**: Write tests for new features

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/NewFeature`
3. Commit changes: `git commit -m 'Add NewFeature'`
4. Push to branch: `git push origin feature/NewFeature`
5. Submit pull request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Email: support@rhpoffice.com

## 🎯 Roadmap

- [x] APA application system with 5 sections
- [x] DocuSign integration for e-signatures
- [x] Stripe payment processing
- [x] Coupon system for discounts
- [x] Email-based remote signing
- [x] Automated payment emails after signing
- [x] Genealogy/downline tracking
- [x] Branding management
- [ ] Real-time notifications (Socket.io)
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Commission tracking
- [ ] Video conferencing integration
- [ ] Gamification features
- [ ] Multi-language support
- [ ] SMS notifications

---

## 📜 Quick Reference

### Useful Scripts

```bash
# Create admin user
node backend/scripts/createAdmin.js

# Create test users
node backend/scripts/createTestUsers.js

# Add referral codes to existing users
node backend/scripts/addReferralCodes.js

# Check database connectivity
node backend/scripts/check-database.js

# Seed branding data
node backend/scripts/seed-branding.js

# Verify DocuSign fields
node backend/scripts/verify-docusign-fields.js
```

### Common Tasks

**Start Development:**
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm start
```

**Deploy to Production:**
```bash
# Commit changes
git add .
git commit -m "Your message"
git push

# On production server
git pull
pm2 restart all
```

**Check Logs:**
```bash
# Backend logs
pm2 logs backend

# Nginx logs
tail -f /var/log/nginx/error.log
```

---

**Built with ❤️ using MEAN Stack (MongoDB, Express, Angular, Node.js)**
