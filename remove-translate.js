const fs = require('fs');
const path = require('path');

const translations = {
  'COMMON.WELCOME': 'Welcome',
  'COMMON.CLOSE': 'Close',
  'COMMON.EDIT': 'Edit',
  'COMMON.SEARCH': 'Search',
  'COMMON.FILTER': 'Filter',
  'COMMON.LOADING': 'Loading',
  'DASHBOARD.REFERRED_BY': 'Referred By',
  'DASHBOARD.VIEW_CONTACT_INFO': 'View Contact Info',
  'DASHBOARD.LICENSING_PROGRESS': 'Licensing Progress',
  'DASHBOARD.COMPLETE_LICENSING': 'Complete your licensing requirements',
  'DASHBOARD.DAYS_REMAINING': 'days remaining',
  'DASHBOARD.REMAINING': 'Remaining',
  'DASHBOARD.PROGRESS': 'Progress',
  'DASHBOARD.VIEW_CHECKLIST': 'View Checklist',
  'DASHBOARD.LICENSED': 'Licensed!',
  'DASHBOARD.LICENSE_COMPLETE': 'You have completed all licensing requirements',
  'DASHBOARD.YOUR_REFERRAL_LINK': 'Your Referral Link',
  'DASHBOARD.SHARE_REFERRAL': 'Share your referral link to recruit new agents',
  'DASHBOARD.REFERRAL_CODE': 'Referral Code',
  'DASHBOARD.REFERRAL_URL': 'Referral URL',
  'DASHBOARD.COPY': 'Copy',
  'DASHBOARD.SHARE_INFO': 'Share your unique referral link with potential recruits',
  'DASHBOARD.QUICK_ACTIONS': 'Quick Actions',
  'DASHBOARD.MY_RECRUITS': 'My Recruits',
  'DASHBOARD.MY_RECRUITS_DESC': 'Manage your direct recruits',
  'DASHBOARD.VIEW_RECRUITS': 'View Recruits',
  'DASHBOARD.DOWNLINE_TREE': 'Downline Tree',
  'DASHBOARD.DOWNLINE_DESC': 'View your complete downline structure',
  'DASHBOARD.VIEW_DOWNLINE': 'View Downline',
  'DASHBOARD.TRAINING_MATERIALS': 'Training Materials',
  'DASHBOARD.TRAINING_DESC': 'Access training resources and materials',
  'DASHBOARD.ACCESS_TRAINING': 'Access Training',
  'DASHBOARD.SYSTEM_OVERVIEW': 'System Overview',
  'DASHBOARD.TOTAL_USERS': 'Total Users',
  'DASHBOARD.TOTAL_ADMINS': 'Total Admins',
  'DASHBOARD.TOTAL_AGENTS': 'Total Agents',
  'DASHBOARD.ACTIVE_USERS': 'Active Users',
  'DASHBOARD.INACTIVE_USERS': 'Inactive Users',
  'DASHBOARD.NEW_THIS_MONTH': 'New This Month',
  'DASHBOARD.ADMIN_CONTROLS': 'Admin Controls',
  'DASHBOARD.USER_MANAGEMENT': 'User Management',
  'DASHBOARD.USER_MANAGEMENT_DESC': 'Manage user accounts and permissions',
  'DASHBOARD.MANAGE_USERS': 'Manage Users',
  'DASHBOARD.FULL_HIERARCHY': 'Full Hierarchy',
  'DASHBOARD.FULL_HIERARCHY_DESC': 'View complete organizational hierarchy',
  'DASHBOARD.VIEW_HIERARCHY': 'View Hierarchy',
  'DASHBOARD.TRAINING_MANAGEMENT': 'Training Management',
  'DASHBOARD.TRAINING_MANAGEMENT_DESC': 'Manage training materials and courses',
  'DASHBOARD.MANAGE_TRAINING': 'Manage Training',
  'DASHBOARD.WELCOME_MESSAGE': 'Welcome to Escape',
  'DASHBOARD.GET_STARTED': 'Get started with your journey',
  'DASHBOARD.VIEW_TRAINING': 'View Training',
  'DASHBOARD.UPDATE_PROFILE': 'Update Profile',
  'DASHBOARD.QUICK_TIPS': 'Quick Tips',
  'DASHBOARD.TIP_1': 'Complete your onboarding documents as soon as possible',
  'DASHBOARD.TIP_2': 'Keep your profile information up to date',
  'DASHBOARD.TIP_3': 'Review training materials regularly',
  'DASHBOARD.TIP_4': 'Stay connected with your upline for guidance',
  'DASHBOARD.REFERRER_CONTACT': 'Referrer Contact Information',
  'DASHBOARD.NAME': 'Name',
  'DASHBOARD.EMAIL': 'Email',
  'DASHBOARD.PHONE': 'Phone',
  'AUTH.YOUR_PARTNER': 'Your Partner in Success',
  'AUTH.WELCOME_BACK': 'Welcome Back',
  'AUTH.SIGN_IN_ACCOUNT': 'Sign in to your account',
  'AUTH.EMAIL_ADDRESS': 'Email Address',
  'AUTH.ENTER_EMAIL': 'Enter your email',
  'AUTH.VALID_EMAIL_REQUIRED': 'Valid email required',
  'AUTH.PASSWORD': 'Password',
  'AUTH.ENTER_PASSWORD': 'Enter your password',
  'AUTH.PASSWORD_REQUIRED': 'is required',
  'AUTH.FORGOT_PASSWORD': 'Forgot Password?',
  'AUTH.SIGNING_IN': 'Signing In...',
  'AUTH.SIGN_IN': 'Sign In',
  'PROFILE.MY_PROFILE': 'My Profile',
  'PROFILE.ACCOUNT_INFO': 'View and update your account information',
  'PROFILE.PERSONAL_INFO': 'Personal Information',
  'PROFILE.ADDRESS': 'Address',
  'PROFILE.CITY': 'City',
  'PROFILE.STATE': 'State',
  'PROFILE.ZIP_CODE': 'Zip Code',
  'TRAINING.TITLE': 'Training Materials'
};

function replaceTranslations(content) {
  // Replace quoted keys with actual text
  Object.keys(translations).forEach(key => {
    const escapedKey = key.replace(/\./g, '\\.');
    content = content.replace(new RegExp(`"${escapedKey}"`, 'g'), `"${translations[key]}"`);
    content = content.replace(new RegExp(`'${escapedKey}'`, 'g'), `'${translations[key]}'`);
  });
  return content;
}

function removeTranslatePipes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remove translate pipe from interpolations {{ 'KEY' | translate }}
  content = content.replace(/\{\{\s*'([^']+)'\s*\|\s*translate\s*\}\}/g, '{{ "$1" }}');
  
  // Remove translate pipe from attribute bindings [attr]="'KEY' | translate"
  content = content.replace(/\[([^\]]+)\]="'([^']+)'\s*\|\s*translate"/g, '[$1]="\'$2\'"');
  
  // Remove translate pipe from ternary expressions
  content = content.replace(/\(\s*'([^']+)'\s*\|\s*translate\s*\)/g, '"$1"');
  
  // Replace translation keys with actual text
  content = replaceTranslations(content);
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated: ${filePath}`);
}

const componentsDir = path.join(__dirname, 'frontend', 'src', 'app', 'components');

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.html')) {
      try {
        removeTranslatePipes(filePath);
      } catch (e) {
        console.error(`Error processing ${filePath}:`, e.message);
      }
    }
  });
}

walkDir(componentsDir);
console.log('Done!');
