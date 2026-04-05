import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys, SendSmtpEmail } from '@getbrevo/brevo'
import { getAppUrl } from '@/lib/auth-helper'

const brevoApi = new TransactionalEmailsApi()

// Configure API key
if (process.env.BREVO_API_KEY) {
  brevoApi.setApiKey(TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)
}

export interface EmailVerificationData {
  email: string
  businessName: string
  verificationUrl: string
}

export async function sendVerificationEmail(data: EmailVerificationData) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Brevo API key not configured')
  }

  const emailData: SendSmtpEmail = {
    to: [{ email: data.email, name: data.businessName }],
    sender: {
      email: process.env.BREVO_FROM_EMAIL || 'noreply@yourdomain.com',
      name: process.env.BREVO_FROM_NAME || 'FX Payment Tracker'
    },
    subject: 'Verify your email address - FX Payment Tracker',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e1e5e9; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e1e5e9; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
            .button:hover { opacity: 0.9; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">💰 FX Payment Tracker</div>
              <h1>Verify Your Email Address</h1>
            </div>
            <div class="content">
              <p>Hello ${data.businessName},</p>
              <p>Thank you for registering with FX Payment Tracker! To complete your account setup and start tracking your foreign currency payments, please verify your email address by clicking the button below:</p>
              <div style="text-align: center;">
                <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
              </div>
              <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">${data.verificationUrl}</p>
              <p><strong>Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
              <p>If you didn't create an account with us, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The FX Payment Tracker Team</p>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">
                This email was sent from an unmonitored address. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    textContent: `
      Verify Your Email Address - FX Payment Tracker
      
      Hello ${data.businessName},
      
      Thank you for registering with FX Payment Tracker! To complete your account setup and start tracking your foreign currency payments, please verify your email address by visiting the following link:
      
      ${data.verificationUrl}
      
      Important: This verification link will expire in 24 hours for security reasons.
      
      If you didn't create an account with us, please ignore this email.
      
      Best regards,
      The FX Payment Tracker Team
    `
  }

  try {
    const response = await brevoApi.sendTransacEmail(emailData)
    return { success: true, messageId: response.body?.messageId || 'sent' }
  } catch (error) {
    console.error('Error sending verification email:', error)
    const body =
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'body' in error.response
        ? (error.response as { body?: unknown }).body
        : undefined
    if (body !== undefined) console.error('Brevo API response body:', body)
    throw new Error('Failed to send verification email')
  }
}

export async function sendWelcomeEmail(data: { email: string; businessName: string }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Brevo API key not configured')
  }

  const emailData: SendSmtpEmail = {
    to: [{ email: data.email, name: data.businessName }],
    sender: {
      email: process.env.BREVO_FROM_EMAIL || 'noreply@yourdomain.com',
      name: process.env.BREVO_FROM_NAME || 'FX Payment Tracker'
    },
    subject: 'Welcome to FX Payment Tracker!',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e1e5e9; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e1e5e9; }
            .feature { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">💰 FX Payment Tracker</div>
              <h1>Welcome to FX Payment Tracker!</h1>
            </div>
            <div class="content">
              <p>Hello ${data.businessName},</p>
              <p>Congratulations! Your email has been verified and your FX Payment Tracker account is now active.</p>
              
              <h3>What you can do now:</h3>
              <div class="feature">
                <strong>📊 Track Foreign Currency Payments</strong><br>
                Monitor your foreign currency transactions and payments efficiently.
              </div>
              <div class="feature">
                <strong>💳 Manage Credit Cards</strong><br>
                Keep track of credit cards that provide access to foreign currency.
              </div>
              <div class="feature">
                <strong>📈 View Analytics</strong><br>
                Get insights into your payment patterns and trends.
              </div>
              <div class="feature">
                <strong>⚙️ Customize Settings</strong><br>
                Set your default exchange rates and business preferences.
              </div>
              
              <p>Ready to get started? <a href="${getAppUrl()}/dashboard" style="color: #667eea;">Visit your dashboard</a> to begin tracking your payments.</p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The FX Payment Tracker Team</p>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">
                This email was sent from an unmonitored address. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    textContent: `
      Welcome to FX Payment Tracker!
      
      Hello ${data.businessName},
      
      Congratulations! Your email has been verified and your FX Payment Tracker account is now active.
      
      What you can do now:
      
      📊 Track Foreign Currency Payments
      Monitor your foreign currency transactions and payments efficiently.
      
      💳 Manage Credit Cards
      Keep track of credit cards that provide access to foreign currency.
      
      📈 View Analytics
      Get insights into your payment patterns and trends.
      
      ⚙️ Customize Settings
      Set your default exchange rates and business preferences.
      
      Ready to get started? Visit your dashboard to begin tracking your payments.
      
      Best regards,
      The FX Payment Tracker Team
    `
  }

  try {
    const response = await brevoApi.sendTransacEmail(emailData)
    return { success: true, messageId: response.body?.messageId || 'sent' }
  } catch (error) {
    console.error('Error sending welcome email:', error)
    const body =
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'body' in error.response
        ? (error.response as { body?: unknown }).body
        : undefined
    if (body !== undefined) console.error('Brevo API response body:', body)
    throw new Error('Failed to send welcome email')
  }
}
