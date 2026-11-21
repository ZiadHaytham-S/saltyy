import nodemailer from 'nodemailer';
import { environment } from '../dist/config/env.js';
const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: environment.APPLICATION_EMAIL,
    pass: environment.APPLICATION_PASSWORD,
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 10000,
  logger: false,
  debug: false,
  disableFileAccess: true,
  disableUrlAccess: true,
});
try {
  if (!environment.APPLICATION_EMAIL || !environment.APPLICATION_PASSWORD)
    throw new Error('MAIL_NOT_CONFIGURED');
  await transport.verify();
  if (process.argv.includes('--send-test')) {
    await transport.sendMail({
      from: { name: 'Sallty | سلتي', address: environment.APPLICATION_EMAIL },
      to: environment.APPLICATION_EMAIL,
      subject: 'Sallty — اختبار إعداد الإرسال',
      text: 'إعداد Nodemailer وGmail اشتغل بنجاح. دي رسالة اختبار تقنية لنفس عنوان الإرسال، مش كود تأكيد حساب.',
    });
    console.log(
      'PASS: Gmail SMTP authenticated and test email accepted for the configured sender address. Inbox delivery still needs checking by the owner.',
    );
  } else console.log('PASS: Gmail SMTP authentication. No email was sent.');
} catch (error) {
  const reason =
    error instanceof Error && error.message === 'MAIL_NOT_CONFIGURED'
      ? 'MAIL_NOT_CONFIGURED'
      : typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ['EAUTH', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS'].includes(
            error.code,
          )
        ? error.code
        : 'SMTP_ERROR';
  console.error(
    'FAIL: Gmail SMTP check (' +
      reason +
      '). Verify APPLICATION_EMAIL, the new App Password, 2-Step Verification and network access. Credentials were not printed.',
  );
  process.exitCode = 1;
} finally {
  transport.close();
}
