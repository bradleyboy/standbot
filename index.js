import fs from 'fs';

import client from './lib/client';
import parser from './lib/parser';
import { User, Room, Schedule, Standup } from './lib/db';

import { INTERVAL } from './constants';

import {
  closeStandup,
  startScheduledStandup,
  warnStandup,
  threatenStandup,
  setChannelActiveStatus,
} from './actions';

process.on('unhandledRejection', (err) => {
  if (process.env.DEBUG) {
    throw err;
  } else {
    console.log('unhandledRejection:', err);
  }
});

let intervalId;

async function migrateUsers() {
  const data = JSON.parse(
    fs.readFileSync(process.env.USER_MIGRATIONS_FILE, 'utf8')
  );

  let total = 0;
  let migrated = 0;

  for (let i = 0; i < data.length; i++) {
    const { oldId, newId } = data[i];
    const user = await User.findOne({ where: { userId: oldId } });
    if (user) {
      migrated++;
      user.userId = newId;
      await user.save();
    }

    total++;
  }

  console.log(`User migration complete: ${migrated} migrated out of ${total}`);
}

function start() {
  client.joined((channel) => {
    setChannelActiveStatus(channel.id, true);
  });

  client.left((channelId) => {
    setChannelActiveStatus(channelId, false);
  });

  client.listen(parser);

  intervalId = setInterval(async () => {
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
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received.');
  client.stop();
  clearInterval(intervalId);
});

if (process.env.USER_MIGRATIONS_FILE) {
  migrateUsers().then(() => start());
} else {
  start();
}
