import client from '../lib/client';
import { Room } from '../lib/db';

import { getRoomAndStandupAndUser } from '../actions';

export default async function (userId, channelId, rawFlag, rawMessage) {
  const [room] = await getRoomAndStandupAndUser(channelId, userId);
  const flag = rawFlag.trim();

  if (flag !== 'on' && flag !== 'off') {
    client.sayAt(
      channelId,
      userId,
      "I don't understand. Set the broadcast option using `on` or `off`."
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

  const broadcast = flag === 'on';
  const message = broadcast
    ? 'Ok, threaded standupbot replies will be shared to channel.'
    : 'Ok, threaded standupbot replies will no longer be shared to channel.';

  Room.update(
    {
      broadcast,
    },
    { where: { channelId } }
  ).then(() => {
    client.sayAt(channelId, userId, message, {
      thread_ts: rawMessage.thread_ts,
    });
  });
}
