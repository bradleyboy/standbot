import client from '../lib/client';
import localdate from '../lib/localdate';

import {
  getRoomAndStandupAndUser,
  setScheduleLast,
  restoreTopic,
} from '../actions';

export default async function(userId, channelId, message) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );

  if (standup) {
    restoreTopic(standup);
    standup.destroy();

    client.sayAt(channelId, userId, 'Standup cancelled, see you next time.', {
      thread_ts: standup.threadRoot,
    });

    if (standup.threaded) {
      client.unpin(channelId, standup.threadRoot);
    }

    return;
  }

  const day = localdate().day;

  const schedules = await room.getSchedules({
    where: {
      day: day,
    },
  });

  if (!schedules.length) {
    client.sayAt(
      channelId,
      userId,
      "Good news, there isn't a standup scheduled for today."
    );
    return;
  }

  setScheduleLast(schedules[0]);

  client.sayAt(channelId, userId, 'Standup cancelled, see you next time.');
}
