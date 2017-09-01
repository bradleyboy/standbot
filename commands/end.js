import client from '../lib/client';

import { getRoomAndStandupAndUser, closeStandup } from '../actions';

export default async function(userId, channelId, message, rawMessage) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );

  if (!standup) {
    client.sayAt(
      channelId,
      userId,
      "Sorry, there isn't a standup in progress.",
      {
        thread_ts: rawMessage.thread_ts,
      }
    );
    return;
  }

  closeStandup(standup);
}
