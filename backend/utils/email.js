const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  const port = parseInt(process.env.SMTP_PORT);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: port,
    secure: port === 465, // true for 465, false for other ports like 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates in development
    }
  });
};

// Send email utility
exports.sendEmail = async (options) => {
  const transporter = createTransporter();
  
  const message = {
    from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.html || options.message
  };
  
  try {
    const info = await transporter.sendMail(message);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email error:', error);
    throw new Error('Email could not be sent');
  }
};

// Welcome email template
exports.sendWelcomeEmail = async (user, password, referredByAgent) => {
  const loginUrl = `${process.env.APP_URL}/login`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: #fff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
        .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to RHP Office!</h1>
        </div>
        <div class="content">
          <h2>Hello ${user.name},</h2>
          <p>Welcome to the RHP Office recruiting platform! Your account has been created successfully.</p>
          
          ${referredByAgent ? `<p>You were referred by: <strong>${referredByAgent.name}</strong></p>` : ''}
          
          <div class="credentials">
            <h3>Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Temporary Password:</strong> ${password}</p>
          </div>
          
          <p><strong>Important:</strong> Please change your password after logging in for the first time.</p>
          
          <a href="${loginUrl}" class="button">Login Now</a>
          
          <h3>Next Steps:</h3>
          <ul>
            <li>Log in to your account</li>
            <li>Complete your profile</li>
            <li>Access training materials</li>
            <li>Start building your team</li>
          </ul>
        </div>
        <div class="footer">
          <p>© 2025 RHP Office. All rights reserved.</p>
          <p>If you have any questions, please contact our support team.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  await this.sendEmail({
    email: user.email,
    subject: 'Welcome to RHP Office - Your Account Details',
    html
  });
};

// Password reset email
exports.sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        .warning { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hello ${user.name},</h2>
          <p>You have requested to reset your password for your RHP Office account.</p>
          
          <p>Click the button below to reset your password:</p>
          
          <a href="${resetUrl}" class="button">Reset Password</a>
          
          <div class="warning">
            <p><strong>⚠ This link will expire in 10 minutes.</strong></p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          
          <p>For security reasons, the reset link is valid for only 10 minutes.</p>
        </div>
        <div class="footer">
          <p>© 2025 RHP Office. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  await this.sendEmail({
    email: user.email,
    subject: 'Password Reset Request - RHP Office',
    html
  });
};
