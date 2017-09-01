import client from '../lib/client';
import { Room, User } from '../lib/db';

import { user as u, channel as c, commifyList } from '../formatters';

const addUsersToStandup = (userIds, room) => {
  return new Promise(async resolve => {
    const alreadyInRoom = [];
    const added = [];

    while (userIds.length) {
      const userId = userIds.shift();

      const [user] = await User.findOrCreate({
        where: { userId },
      });

      const exists = await room.hasUser(user);

      if (exists) {
        alreadyInRoom.push(userId);
        continue;
      }

      const result = await room.addUser(user);
      added.push(userId);
    }

    resolve({ alreadyInRoom, added });
  });
};

export default async function(driverId, channelId, arg, rawMessage) {
  const driver = u(driverId);
  const users = arg.match(/<@U[0-9A-Z]+>/g);

  if (!users) {
    client.sayAt(
      channelId,
      driverId,
      "You didn't give me any users to add. Remember to use @ when adding the users."
    );
    return;
  }

  const userIds = users.map(user => user.replace(/[^0-9A-Z]/g, ''));

  const [room] = await Room.findOrCreate({
    where: { channelId },
  });

  const result = await addUsersToStandup(userIds, room);

  var messages = [];

  if (result.added.length) {
    messages.push(
      `Ok, I've added ${commifyList(result.added, u)} to the standup for ${c(
        channelId
      )}.`
    );
  }

  if (result.alreadyInRoom.length) {
    messages.push(
      `Didn't add ${commifyList(
        result.alreadyInRoom,
        u
      )} as they are already a part of this room's standup.`
    );
  }

  client.sayAt(channelId, driverId, messages.join('\n'), {
    thread_ts: rawMessage.thread_ts,
  });
}
