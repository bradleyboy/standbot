import client from '../lib/client';
import { Room } from '../lib/db';

import { getRoomAndStandupAndUser } from '../actions';

export default async function(userId, channelId, rawFlag, rawMessage) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );
  const flag = rawFlag.trim();

  if (flag !== 'on' && flag !== 'off') {
    client.sayAt(
      channelId,
      userId,
      "I don't understand. Set the announce option using `on` or `off`."
    );
    return;
  }

  if (!room) {
    client.sayAt(
      channelId,
      userId,
      "Oops, this room doesn't have any standups scheduled. See .standup help for more info."
    );
    return;
  }

  const announce = flag === 'on';
  const message = announce
    ? "Ok, I'll announce the start and end of the standup."
    : "Ok, I won't announce the start and end of the standup anymore.";

  Room.update(
    {
      announce,
    },
    { where: { channelId } }
  ).then(() => {
    client.sayAt(channelId, userId, message, {
      thread_ts: rawMessage.thread_ts,
    });
  });
}
