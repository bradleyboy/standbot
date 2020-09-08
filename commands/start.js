import client from '../lib/client';
import localdate from '../lib/localdate';

import {
  getRoomAndStandupAndUser,
  setScheduleLast,
  startStandup,
} from '../actions';

export default async function (userId, channelId, _, rawMessage) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );

  if (rawMessage.thread_ts) {
    client.sayAt(
      channelId,
      userId,
      "Sorry, standups can't be started inside a thread. Please start the standup in the channel.",
      {
        thread_ts: rawMessage.thread_ts,
      }
    );
    return;
  }

  if (!room) {
    client.sayAt(
      channelId,
      userId,
      "I haven't been configured for this room yet. Start by adding users with `.standup add`"
    );
    return;
  }

  // Make sure user is in room's standup
  const inRoom = await room.hasUser(user);

  if (!inRoom) {
    client.sayAt(
      channelId,
      userId,
      "Sorry, only users who are a part of this room's standup can use `.standup start`"
    );
    return;
  }

  // Is there a standup in progress? bail
  if (standup) {
    client.sayAt(channelId, userId, 'Already a standup in progress!');
    return;
  }

  // Is there a scheduled standup for today? setScheduleLast
  const { day } = localdate();

  const scheduled = await room.getSchedules({
    where: { day },
  });

  if (scheduled.length) {
    setScheduleLast(scheduled[0]);
  }

  startStandup(room);
}
