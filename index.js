import fs from 'fs';

import client from './lib/client';
import parser from './lib/parser';
import { User, Room, Schedule, Standup } from './lib/db';

import { INTERVAL } from './constants';
import { isPaused } from './config';

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

let timeoutId;

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
  let errors = 0;

  const schedules = await Schedule.scope('shouldStart').findAll({
    limit: 5,
  });

  if (!isPaused) {
    for (let i = 0; i < schedules.length; i++) {
      try {
        await startScheduledStandup(schedules[i]);
      } catch (e) {
        errors++;
        console.log('unexpected error when starting scheduled standup', e);
      }
    }
  }

  const nagWarn = await Standup.scope('shouldWarn').findAll({
    include: [Room],
    limit: 5,
  });

  if (!isPaused) {
    for (let i = 0; i < nagWarn.length; i++) {
      try {
        await warnStandup(nagWarn[i]);
      } catch (e) {
        errors++;
        console.log('unexpected error when reminding standup', e);
      }
    }
  }

  const nagThreat = await Standup.scope('shouldThreat').findAll({
    include: [Room],
    limit: 5,
  });

  if (!isPaused) {
    for (let i = 0; i < nagThreat.length; i++) {
      try {
        await threatenStandup(nagThreat[i]);
      } catch (e) {
        errors++;
        console.log('unexpected error when warning standup', e);
      }
    }
  }

  const standups = await Standup.scope('shouldClose').findAll({
    include: [Room],
    limit: 1,
  });

  if (!isPaused) {
    for (let i = 0; i < standups.length; i++) {
      try {
        await closeStandup(standups[i]);
      } catch (e) {
        errors++;
        console.log('unexpected error when closing standup', e);
      }
    }
  }

  console.log(
    'Loop end, time spent:',
    Date.now() - loopStart,
    `stats: ${schedules.length} started, ${nagWarn.length} reminded, ${nagThreat.length} warned, ${standups.length} closed. errors: ${errors}`
  );

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
  clearTimeout(timeoutId);
});

if (process.env.USER_MIGRATIONS_FILE) {
  migrateUsers().then(() => start());
} else {
  start();
}
