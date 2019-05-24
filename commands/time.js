import client from '../lib/client';
import { Room } from '../lib/db';

export default function(userId, channelId, time, rawMessage) {
  const matches = time && time.trim().match(/(\d+)(m|h)/);

  const sayOpts = {
    thread_ts: rawMessage.thread_ts,
  };

  if (!matches) {
    client.sayAt(
      channelId,
      userId,
      "I don't understand. Set the time in either hours or minutes. Ex: .standup time 1h",
      sayOpts
    );
    return;
  }

  const [, length, type] = matches;

  const minutes = type === 'm' ? length : length * 60;

  if (minutes < 5) {
    client.sayAt(
      channelId,
      userId,
      'Standup time must be a minimum of 5 minutes.',
      sayOpts
    );
    return;
  }

  Room.update(
    {
      length: minutes,
    },
    { where: { channelId } }
  ).then(() => {
    client.sayAt(
      channelId,
      userId,
      `Ok, updated the time limit to ${time}`,
      sayOpts
    );
  });
}
