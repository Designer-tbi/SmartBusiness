import nodemailer from "nodemailer";

// SMTP Email config
export const emailTransporter = nodemailer.createTransport({
  host: 'ssl0.ovh.net',
  port: 465,
  secure: true,
  auth: {
    user: 'demo@smart-desk.pro',
    pass: 'loub@ki2014D'
  }
});

export const FROM_EMAIL = process.env.SMTP_FROM || 'demo@smart-desk.pro';
