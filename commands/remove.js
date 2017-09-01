import client from '../lib/client';
import { Room, User } from '../lib/db';

import { user as u, channel as c, commifyList } from '../formatters';

const removeUsersFromStandup = (userIds, room) => {
  return new Promise(async resolve => {
    const removed = [];
    const skipped = [];

    while (userIds.length) {
      const userId = userIds.shift();

      const [user] = await User.findOrCreate({
        where: { userId },
      });

      const exists = await room.hasUser(user);

      if (exists) {
        const result = await room.removeUser(user);
        removed.push(userId);
        continue;
      }

      skipped.push(userId);
    }

    resolve({ removed, skipped });
  });
};

export default async function(driverId, channelId, arg, rawMessage) {
  const users = arg.match(/<@U[0-9A-Z]+>/g);

  if (!users) {
    client.sayAt(
      channelId,
      driverId,
      "You didn't give me any users to remove. Remember to use @ when specifying the users."
    );
    return;
  }

  const userIds = users.map(user => user.replace(/[^0-9A-Z]/g, ''));

  const room = await Room.findOne({
    where: { channelId },
  });

  if (!room) {
    client.sayAt(
      channelId,
      driverId,
      "Uh oh, doesn't look like there is a standup in that channel."
    );
    return;
  }

  const result = await removeUsersFromStandup(userIds, room);

  var messages = [];

  if (result.removed.length) {
    messages.push(
      `Ok, I've removed ${commifyList(
        result.removed,
        u
      )} from the standup for ${c(channelId)}.`
    );
  }

  if (result.skipped.length) {
    messages.push(
      `Didn't remove ${commifyList(
        result.skipped,
        u
      )} as they are not a part of this room's standup.`
    );
  }

  client.sayAt(channelId, driverId, messages.join('\n'), {
    thread_ts: rawMessage.thread_ts,
  });
}
