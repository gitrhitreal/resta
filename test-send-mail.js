require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

transporter.sendMail({
  from: `"Restaurant SaaS Test" <${SMTP_USER}>`,
  to: 'rhitwiksingh16@gmail.com',
  subject: 'Test Email from Node',
  text: 'If you get this, SMTP is working perfectly!'
}).then(info => {
  console.log('Mail sent successfully:', info.messageId);
}).catch(err => {
  console.error('Mail send failed:', err);
});
