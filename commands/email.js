import client from '../lib/client';
import { Room } from '../lib/db';

import { SUMMARY_EMAIL_DEFAULT_DOMAIN } from '../constants';

export default function(userId, channelId, email, rawMessage) {
  if (email) {
    const hasDefaultDomain = SUMMARY_EMAIL_DEFAULT_DOMAIN.length;
    const entryHasDomain = email.indexOf('@') !== -1;

    // Slack autoformats emails to something like
    // <mailto:jane@doe.com|jane@doe.com>
    const match = email.match(/<mailto:.*\|(.*)>/);

    if (match) {
      email = match[1];
    }

    const endsWithDefaultDomain =
      entryHasDomain &&
      new RegExp(`@${SUMMARY_EMAIL_DEFAULT_DOMAIN}$`).test(email);

    if (!entryHasDomain && !hasDefaultDomain) {
      client.sayAt(channelId, userId, "I'll need a valid email address");
      return;
    }

    if (hasDefaultDomain && entryHasDomain && !endsWithDefaultDomain) {
      client.sayAt(
        channelId,
        userId,
        `Only email domains ending in @${SUMMARY_EMAIL_DEFAULT_DOMAIN} are allowed.`
      );
      return;
    }

    email = entryHasDomain ? email : `${email}@${SUMMARY_EMAIL_DEFAULT_DOMAIN}`;
  }

  const msg = email
    ? `Ok, I'll email a summary to ${email} whenever standup ends.`
    : 'Ok, email updates disabled.';

  Room.update({ email }, { where: { channelId } }).then(() => {
    client.sayAt(channelId, userId, msg, {
      thread_ts: rawMessage.thread_ts,
    });
  });
}
