import nodemailer from 'nodemailer';
import sendmailTransport from 'nodemailer-sendmail-transport';

const transporter = nodemailer.createTransport(sendmailTransport());

export default transporter;
