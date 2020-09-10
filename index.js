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
    console.trace(err);
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

let loopStart = Date.now();
async function runLoop() {
  console.log('Loop begin, time since last run: ', Date.now() - loopStart);
  loopStart = Date.now();

  const schedules = await Schedule.scope('shouldStart').findAll({
    limit: 10,
  });

  await Promise.all(schedules.map(startScheduledStandup));

  const nagWarn = await Standup.scope('shouldWarn').findAll({
    include: [Room],
  });

  await Promise.all(nagWarn.map(warnStandup));

  const nagThreat = await Standup.scope('shouldThreat').findAll({
    include: [Room],
  });

  await Promise.all(nagThreat.map(threatenStandup));

  const standups = await Standup.scope('shouldClose').findAll({
    include: [Room],
    limit: 1,
  });

  await Promise.all(standups.map(closeStandup));

  console.log('Loop end, time spent: ', Date.now() - loopStart);
  setTimeout(runLoop, INTERVAL);
}

function start() {
  client.joined((channel) => {
    setChannelActiveStatus(channel.id, true);
  });

  client.left((channelId) => {
    setChannelActiveStatus(channelId, false);
  });

  client.listen(parser);

  setTimeout(runLoop, INTERVAL);
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
