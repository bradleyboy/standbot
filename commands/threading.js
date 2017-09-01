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
      "I don't understand. Set the threading option using `on` or `off`."
    );
    return;
  }

  if (!room) {
    client.sayAt(
      channelId,
      userId,
      "Uh, this room doesn't have any standups scheduled. See .standup help for more info."
    );
    return;
  }

  const threading = flag === 'on';
  const message = threading
    ? 'Ok, standups in this room will now use Slack threads.'
    : 'Ok, standups in this room will no longer use Slack threads.';

  Room.update(
    {
      threading,
    },
    { where: { channelId } }
  ).then(() => {
    client.sayAt(channelId, userId, message, {
      thread_ts: rawMessage.thread_ts,
    });
  });
}
