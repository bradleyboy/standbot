import nodemailer from 'nodemailer';
import sendmailTransport from 'nodemailer-sendmail-transport';

import { smtpOptions } from '../config';

const transporter = nodemailer.createTransport(
  smtpOptions || sendmailTransport()
);

export default transporter;
