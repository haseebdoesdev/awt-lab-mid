import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Emails "sent" without SMTP configured – lets tests (and developers) read them. */
export const outbox: Mail[] = [];

let transporter: Transporter | null = null;

function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Sends through SMTP when SMTP_HOST is set. Otherwise the email is kept in
 * `outbox` and printed to the log, so password resets work in development.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.SMTP_HOST) {
    await smtp().sendMail({ from: env.MAIL_FROM, ...mail });
    return;
  }
  outbox.push(mail);
  if (!isTest) {
    console.log(`\n[mail] SMTP not configured – email to ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
  }
}
