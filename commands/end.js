import client from '../lib/client';

import { getRoomAndStandupAndUser, closeStandup } from '../actions';

export default async function (userId, channelId, _, rawMessage) {
  const [room, standup] = await getRoomAndStandupAndUser(channelId, userId);

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
