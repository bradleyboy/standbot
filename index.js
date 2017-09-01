import client from './lib/client';
import parser from './lib/parser';
import { Room, Schedule, Standup } from './lib/db';

import { INTERVAL } from './constants';

import {
  closeStandup,
  startScheduledStandup,
  warnStandup,
  threatenStandup,
  setChannelActiveStatus,
} from './actions';

if (process.env.DEBUG) {
  process.on('unhandledRejection', err => {
    throw err;
  });
}

client.joined(channel => {
  setChannelActiveStatus(channel.id, true);
});

client.left(channelId => {
  setChannelActiveStatus(channelId, false);
});

client.listen(parser);

setInterval(async () => {
  const schedules = await Schedule.scope('shouldStart').findAll({
    limit: 10,
  });

  schedules.forEach(startScheduledStandup);

  const nagWarn = await Standup.scope('shouldWarn').findAll({
    include: [Room],
  });

  nagWarn.forEach(warnStandup);

  const nagThreat = await Standup.scope('shouldThreat').findAll({
    include: [Room],
  });

  nagThreat.forEach(threatenStandup);

  const standups = await Standup.scope('shouldClose').findAll({
    include: [Room],
    limit: 1,
  });

  standups.forEach(closeStandup);
}, INTERVAL);
