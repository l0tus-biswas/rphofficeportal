# Branding Management Feature

## Overview
The branding management feature allows administrators to customize the application's brand identity by managing the app name and logo. Changes are automatically reflected across all pages and email templates.

## Features

### Admin Interface
- **Location**: Admin dropdown → Branding Management (`/admin/branding`)
- **Capabilities**:
  - Update application name
  - Upload custom logo (JPEG, PNG, GIF, SVG)
  - Preview logo before saving
  - Maximum file size: 2MB

### Automatic Propagation
Branding changes automatically appear in:
- ✅ Navbar (all pages)
- ✅ Login page
- ✅ Email templates (Welcome, Password Reset)
- ✅ All admin pages
- ✅ User-facing components

## Setup Instructions

### 1. Database Configuration
Run the seed script to initialize the branding configuration:
```bash
cd backend
node scripts/seed-branding.js
```

This creates the `app_name` configuration with the default value "Escape".

### 2. Upload Directory
The logo upload directory is automatically created at:
```
backend/uploads/branding/
```

Uploaded logos are served via: `http://localhost:5000/uploads/branding/filename.jpg`

### 3. Access the Feature
1. Log in as an admin user
2. Navigate to **Admin** dropdown → **Branding Management**
3. Update the app name and/or upload a logo
4. Click **Save Changes**

## Technical Details

### Backend

#### API Endpoints
- `GET /api/admin/config/branding` - Get current branding (public)
- `POST /api/admin/config/branding` - Update branding (admin only)

#### Configuration Storage
Branding is stored in the `SystemConfig` collection:
- `app_name` - Application name (string)
- `app_logo` - Logo file path (string, optional)

#### Email Integration
Email templates automatically fetch branding configuration:
- Welcome email: Displays logo and uses dynamic app name
- Password reset email: Displays logo and uses dynamic app name

### Frontend

#### Branding Service
- **Location**: `frontend/src/app/services/branding.service.ts`
- **Purpose**: Manages branding state and provides reactive updates
- **Key Features**:
  - `branding$` observable for reactive updates
  - Automatic loading on app initialization
  - Cache management

#### Components Using Branding
- **Navbar**: Displays logo and app name
- **Login**: Displays logo and app name
- **Admin Branding**: Management interface

#### Styling
- Logo dimensions: Max 150px width, auto height
- Navbar logo: 35px height
- Login logo: Max 200px width
- Object-fit: contain (preserves aspect ratio)

## File Structure

```
backend/
├── routes/
│   └── config.routes.js          # Branding endpoints
├── scripts/
│   └── seed-branding.js          # Initialize branding config
├── uploads/
│   └── branding/                 # Logo storage
└── utils/
    └── email.js                  # Email templates with branding

frontend/
└── src/
    └── app/
        ├── components/
        │   ├── admin/
        │   │   └── branding/     # Branding management UI
        │   ├── login/            # Uses branding
        │   └── shared/
        │       └── navbar/       # Uses branding
        └── services/
            └── branding.service.ts  # Branding service
```

## Usage Examples

### Update App Name
1. Navigate to Admin → Branding Management
2. Enter new name in "Application Name" field
3. Click "Save Changes"
4. Refresh any page to see the updated name

### Upload Logo
1. Navigate to Admin → Branding Management
2. Click "Choose File" under "Upload New Logo"
3. Select an image file (JPEG, PNG, GIF, or SVG, max 2MB)
4. Preview appears automatically
5. Click "Save Changes"
6. Logo appears in navbar and login page

### Replace Logo
1. Upload a new logo (same process as above)
2. Old logo file is automatically deleted from server
3. New logo replaces the old one everywhere

## Security Considerations

- ✅ Only admin users can modify branding
- ✅ File type validation (images only)
- ✅ File size limit (2MB)
- ✅ Secure file upload with multer
- ✅ Old logo files are cleaned up automatically

## Troubleshooting

### Logo Not Displaying
1. Check if logo file exists in `backend/uploads/branding/`
2. Verify `app_logo` configuration in SystemConfig collection
3. Ensure static file serving is enabled in `server.js`
4. Check browser console for 404 errors

### Logo Upload Fails
1. Verify file type is JPEG, PNG, GIF, or SVG
2. Check file size is under 2MB
3. Ensure `backend/uploads/branding/` directory exists and is writable
4. Check backend logs for detailed error messages

### Branding Not Updating
1. Hard refresh the page (Ctrl+F5)
2. Check if BrandingService is properly injected in components
3. Verify API endpoints are responding correctly
4. Check browser console for errors

## Future Enhancements

Potential improvements:
- [ ] Add favicon management
- [ ] Support for multiple theme colors
- [ ] Email template color customization
- [ ] Logo variations (light/dark mode)
- [ ] Brand guidelines section
- [ ] Preview mode before saving
- [ ] Rollback to previous branding

## API Documentation

### Get Branding (Public)
```http
GET /api/admin/config/branding
```

**Response:**
```json
{
  "appName": "Escape",
  "appLogo": "/uploads/branding/logo-1234567890.png"
}
```

### Update Branding (Admin Only)
```http
POST /api/admin/config/branding
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body:**
- `appName` (string, optional): New application name
- `logo` (file, optional): Logo image file

**Response:**
```json
{
  "message": "Branding updated successfully",
  "appName": "My Company",
  "appLogo": "/uploads/branding/logo-1234567890.png"
}
```

## Notes

- Default app name is "Escape" if no configuration exists
- Logo is optional - app will display icon if no logo uploaded
- Changes take effect immediately after save
- Email templates fetch branding at send time (not cached)
- Frontend caches branding in BehaviorSubject for performance
