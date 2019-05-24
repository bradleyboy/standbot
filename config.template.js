// Slack API token for the bot
export const token = '';

// How often to check for scheduled standups and standups due to close.
// Unit: milliseconds
export const interval = 10000;

// Environment to run the bot in. DEVELOPMENT or PRODUCTION
export const environment = 'DEVELOPMENT';

// List of holidays your company observes. m/d format
// Example: export const holidays = [ '1/1', '12/25' ];
export const holidays = [];

// When users add an email for the standup, this is the domain that is inferred
// if they omit one. If this is set, only emails at this domain can be used for
// summary emails.
export const summaryEmailDomain = 'gmail.com';

// The domain the summary email is sent from. The email's reply-to will
// be equal to the address the summary is sent to.
export const summaryEmailFromAddress = '"Standupbot" <no-reply@mydomain.com>';

// List of channels the bot should ignore messages from. Effectively no-ops
// the bot in any of these channels. Should be in the form of C123456, not
// the human readable version of the channel name.
// Example: export const ignoreChannels = ['C1234567'];
export const ignoreChannels = [];
