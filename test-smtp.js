require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

console.log("SMTP_PORT:", SMTP_PORT);
console.log("SMTP_USER:", SMTP_USER);
console.log("SMTP_PASS:", SMTP_PASS ? "length: " + SMTP_PASS.length : "undefined");

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

transporter.verify()
  .then(() => console.log('Transporter verification successful!'))
  .catch(err => console.error('Verification failed:', err.message));
