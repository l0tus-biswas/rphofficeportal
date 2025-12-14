# Escape - Recruiting Platform

## 📋 Project Overview

Escape is a full-stack MERN (MongoDB, Express, React/Angular, Node.js) recruiting application with role-based authentication, onboarding document management, and genealogy tracking. The system allows agents to recruit new members through unique referral links and manages multi-step onboarding with document uploads.

## 🚀 Features

### Core Features
- **Role-Based Authentication**: Admin, Agent, and Recruit roles with JWT
- **Public Recruiting Links**: Each agent has a unique referral link (e.g., `http://localhost:4200/apply?ref=AGT12345`)
- **Multi-Step Onboarding**: 6-step document collection (W4, Driver License, SSN, Direct Deposit, Void Check, I9)
- **Document Upload & Management**: PDF uploads with local storage per user
- **Account Creation**: Deferred until after Direct Deposit step
- **Genealogy Tree**: Maintains complete downline/hierarchy tracking with referrer information
- **Training Management**: Admin can upload and manage training materials
- **Coupon System**: Admin can create and manage discount coupons
- **User Management**: Admin can activate/deactivate users
- **Profile Management**: Users can update their profiles
- **Password Reset**: Secure forgot/reset password flow
- **System Configuration**: Admin UI for managing environment variables
- **Onboarding Review**: Admin can review and approve/reject submitted documents

### Role Permissions

#### Admin
- View full hierarchy (all agents and recruits)
- Manage all users (create, edit, activate/deactivate)
- Review and manage onboarding documents (approve/reject)
- Upload and manage training materials
- Create and manage discount coupons
- Configure system settings via UI
- Access all statistics

#### Agent
- Complete multi-step onboarding with document uploads
- View their profile and update it
- See first-level recruits (direct referrals)
- View their complete downline tree with referrer information
- Access training materials
- Get their unique referral link
- View onboarding status
- Upload/re-upload documents

#### Recruit
- View and update their profile
- Access training materials
- Change password

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
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rhpoffice
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
APP_URL=http://localhost:4200
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
- `GET /api/public/apply?ref={code}` - Get agent info
- `POST /api/public/apply?ref={code}` - Submit application
- `GET /api/public/verify-referral/:code` - Verify referral code
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password

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

### User Collection
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

- [ ] Real-time notifications (Socket.io)
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Commission tracking
- [ ] Document uploads
- [ ] Video conferencing integration
- [ ] Gamification features
- [ ] Multi-language support

---

**Built with ❤️ using MEAN Stack**
