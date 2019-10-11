import client from '../lib/client';
import { Room } from '../lib/db';

import {
  getRoomAndStandupAndUser,
  updateTopic,
  restoreTopic,
} from '../actions';

export default async function(userId, channelId, rawFlag, rawMessage) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );
  const flag = rawFlag.trim();

  const sayOpts = {
    thread_ts: rawMessage.thread_ts,
  };

  if (flag !== 'on' && flag !== 'off') {
    client.sayAt(
      channelId,
      userId,
      "I don't understand. Set the topic option using `on` or `off`.",
      sayOpts
    );
    return;
  }

  if (!room) {
    client.sayAt(
      channelId,
      userId,
      "Oops, this room doesn't have any standups scheduled. See .standup help for more info.",
      sayOpts
    );
    return;
  }

  const topic = flag === 'on';
  const message = topic
    ? "Ok, I'll update the topic with the status of the standup."
    : "Ok, I won't update the topic anymore.";

  Room.update(
    {
      topic,
    },
    { where: { channelId } }
  ).then(() => {
    client.sayAt(channelId, userId, message, sayOpts);

    if (standup) {
      if (topic) {
        updateTopic(standup);
      } else {
        restoreTopic(standup);
      }
    }
  });
}
