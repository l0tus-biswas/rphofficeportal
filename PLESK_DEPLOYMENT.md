# Plesk Deployment Guide

## Prerequisites
- Node.js 18.x or higher
- MongoDB connection string

## Deployment Steps

### 1. Upload Project
Upload the entire project to your Plesk file manager or via Git.

### 2. Plesk Node.js Settings
- **Application mode**: Production
- **Application root**: Your project root directory
- **Application URL**: Your domain (e.g., https://yourdomain.com)
- **Application startup file**: `index.js`
- **Node.js version**: 18.x or higher

### 3. Environment Variables
Add these in Plesk → Node.js → Environment Variables:

```
NODE_ENV=production
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
APP_URL=https://yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM_NAME=Escape
```

### 4. Build & Install
SSH into your server or use Plesk terminal:

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies & build
cd frontend && npm install && npm run build --configuration=production && cd ..
```

Or simply run:
```bash
npm run install-all
npm run build
```

### 5. Start Application
In Plesk Node.js settings:
- Click "Enable Node.js"
- Click "Restart App"

The application will start at `index.js` which serves:
- API endpoints at `/api/*`
- Angular frontend at all other routes

### 6. Domain Configuration
Make sure your domain points to the Node.js application in Plesk.

## Scripts Available

- `npm start` - Start production server (runs index.js)
- `npm run build` - Build Angular frontend for production
- `npm run deploy` - Build and start in one command
- `npm run install-all` - Install all dependencies
- `npm run dev` - Run backend in development mode
- `npm run backend` - Run backend only
- `npm run frontend` - Run frontend only (dev mode)

## Important Notes

1. The backend now serves the built Angular app from `/frontend/dist/rhpoffice-frontend`
2. All API routes use `/api` prefix
3. Environment variables must be set in Plesk Node.js settings
4. Make sure MongoDB is accessible from your Plesk server
5. For file uploads, ensure the `uploads/` directory has write permissions

## Troubleshooting

- Check application logs in Plesk → Node.js → Logs
- Verify environment variables are set correctly
- Ensure MongoDB connection string is correct
- Check that the frontend is built: `frontend/dist/rhpoffice-frontend` should exist
- Verify Node.js version is compatible (18.x+)
