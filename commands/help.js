import client from '../lib/client';

export default function (userId, channelId, arg, rawMessage) {
  const out = [
    'Here are the commands I respond to.',
    '*.standup add &lt;@user&gt;* _Add a user to the standup. Adding multiple users at once is supported._',
    '*.standup remove &lt;@user&gt;* _Permanently remove a user from the standup_',
    '*.standup skip &lt;@user&gt; <reason>* _Skip a user for the running standup_',
    '*.standup schedule <day> <time>* _Add a standup for this room. Ex: .standup schedule monday 10:30am will schedule a standup every Monday at 10:30am and start it automatically for you._',
    '*.standup schedule <day> cancel* _Remove the standup scheduled for a particular day._',
    '*.standup schedule* _Output the standup schedule for this room._',
    '*.standup update <status>* _Add your update to the current standup. Also, you can just @ reply directly to me._',
    '*.standup cancel* _Cancel the standup for today._',
    '*.standup time <length of time, like 1h or 30m>* _How long the standup should last._',
    '*.standup end* _End the current standup early._',
    '*.standup topic <off|on>* _Set whether to track the status of the standup in the channel topic._',
    '*.standup start* _Starts an adhoc standup._',
    '*.standup email <ldap>* _Send the standup summary via email._',
    '*.standup announce <off|on>* _Set whether to announce the start/end of the standup in the channel._',
    '*.standup threading <off|on>* _Set whether to use a Slack thread for the standup._',
    '*.standup broadcast <off|on>* _Set whether to send threaded Slackbot reples to the channel._',
  ];

  client.sayAt(channelId, userId, out.join('\n'), {
    thread_ts: rawMessage.thread_ts,
  });
}
