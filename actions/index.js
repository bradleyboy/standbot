/**
 * TODO: Clean this up. functions.php is not cool, not even in node.
 */

import client from '../lib/client';
import { Room, Update, User, sequelize } from '../lib/db';
import uniqueArray from 'unique-random-array';
import transport from '../lib/email';
import localdate from '../lib/localdate';
import emoji from 'node-emoji';
import moment from 'moment-timezone';

import {
  formatForEmail,
  user as u,
  commifyList,
  preventAlerts,
} from '../formatters';

import {
  STANDUP_CLOSED,
  STANDUP_COMPLETE,
  NAGGED_NO,
  NAGGED_WARN,
  NAGGED_THREAT,
  UPDATE_NORMAL,
  UPDATE_SKIP,
  HOLIDAYS,
  SUMMARY_EMAIL_FROM_ADDRESS,
} from '../constants';

const formatUpdateMessage = async ({ type, message, meta }) => {
  if (type === UPDATE_SKIP) {
    if (meta && meta.reporter) {
      const reporter = await client.getUser(meta.reporter);
      return `${message} (according to @${reporter.profile.display_name})`;
    } else {
      return `${message} (according to their Slack status)`;
    }
  }

  return client.formatMessageAsPlain(message);
};

export const closeStandup = (standup) => {
  standup
    .update({
      state: STANDUP_CLOSED,
    })
    .then(async () => {
      const updates = await standup.getUpdates({
        include: [User],
        order: 'type asc, updates.userId asc, updates.id asc',
      });

      const room = await standup.getRoom();

      if (room.topic || standup.threaded) {
        restoreTopic(standup);
      }

      if (standup.threaded) {
        client.unpin(room.channelId, standup.threadRoot);
      }

      if (!updates.length) {
        client.say(
          room.channelId,
          "Ending standup. No updates were given, so there isn't a summary.",
          {
            thread_ts: standup.threadRoot,
          }
        );

        return;
      }

      if (room.email) {
        sendStandupSummaryEmail(standup);
      } else {
        const out = ["Ending standup. Here's a summary:"];

        for (let i = 0; i < updates.length; i++) {
          const update = updates[i];
          const message = await formatUpdateMessage(update);
          out.push(`${u(update.user.userId)}: ${message}`);
        }

        const summary = out.join('\n');
        client.say(room.channelId, summary, {
          thread_ts: standup.threadRoot,
        });
      }
    });
};

export const sendStandupSummaryEmail = async (standup) => {
  const [room, updates] = await Promise.all([
    standup.getRoom(),
    standup.getUpdates({
      include: [User],
      order: 'type asc, updates.id asc',
    }),
  ]);

  const map = {};
  const alternateBackground = uniqueArray(['#fbfbfb', '#ffffff']);

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    if (!map[update.user.userId]) {
      map[update.user.userId] = [];
    }

    const updateMessage = await formatUpdateMessage(update);
    const message = formatForEmail(updateMessage);

    map[update.user.userId].push(message);
  }

  const fragments = [];
  const channel = await client.getChannel(room.channelId);

  for (let i of Object.keys(map)) {
    const updates = map[i]
      .map(
        (update) => `<p style="margin: 0 0 10px;">${emoji.emojify(update)}</p>`
      )
      .join('');
    const user = await client.getUser(i);

    fragments.push(`
      <tr style="background: ${alternateBackground()};">
        <td width="120" style="padding: 10px 0; text-align: center;">
          <img width="72" style="border-radius: 50%" src="${
            user.profile.image_192
          }">
          <p style="margin:0; font-weight: bold;">${
            user.profile.display_name
          }</p>
        </td>
        <td style="padding-top: 10px">${updates}</td>
      </tr>
    `);
  }

  const html = `
<html>
<head></head>
<body style="padding: 5px;">
  <h1 style="margin: 0; font-size: 16px; font-weight: normal; padding: 5px; border-bottom: 1px solid #444;">Today's standup summary for <b>${
    channel.name
  }</b></h1>
  <table cellspacing="0" width="100%">${fragments.join('')}</table>
</body>
  `;

  const date = moment.tz('America/New_York').format('MMMM Do YYYY');

  transport.sendMail(
    {
      from: SUMMARY_EMAIL_FROM_ADDRESS,
      to: room.email,
      subject: `Standup summary for ${channel.name} (${date})`,
      replyTo: room.email,
      html,
    },
    (error, info) => {
      if (error) {
        console.error('Could not send email: ', error);

        client.say(room.channelId, 'Error sending summary email.', {
          thread_ts: standup.threadRoot,
        });
        return;
      }

      client.say(
        room.channelId,
        `Ending standup, summary sent to ${room.email}`,
        {
          thread_ts: standup.threadRoot,
        }
      );
    }
  );
};

export const restoreTopic = async (standup) => {
  const room = await standup.getRoom();

  if (standup.threaded) {
    if (!standup.threadRoot) {
      return;
    }

    const date = moment.tz('America/New_York');
    client.update(
      room.channelId,
      standup.threadRoot,
      `:white_check_mark: Standup for <!date^${date.unix()}^{date}|today>`
    );

    return;
  }

  return client.setTopic(room.channelId, standup.topic);
};

export const setScheduleLast = (schedule) => {
  const now = localdate();
  const last = `${now.month}/${now.date}`;

  schedule.update({ last });
};

/*
 * Try to be somewhat smart about how the bot nags.
 * No nags for standups that last less than 10 min
 * Only do the final nag if the standup is <= 15 min long.
 * All others do both nags.
 */
const getInitialNagState = (minutes) => {
  if (minutes < 10) {
    return NAGGED_THREAT;
  }

  if (minutes <= 15) {
    return NAGGED_WARN;
  }

  return NAGGED_NO;
};

export const rollbackStandup = async (standup) => {
  const room = await standup.getRoom();

  const { day, raw } = localdate();

  const scheduled = await room.getSchedules({
    where: { day },
  });

  if (scheduled.length) {
    const last = raw.subtract(1, 'days').format('M/D');
    scheduled[0].update({
      last,
    });
  }

  standup.destroy();
};

const getActiveRoomUsers = async (room, options = {}) => {
  const users = await room.getUsers(options);
  const activeUsers = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const slackUser = await client.getUser(user.userId);

    if (slackUser && slackUser.deleted === false) {
      activeUsers.push(user);
    }
  }

  return activeUsers;
};

const shouldSkip = (slackUser) => {
  const text = slackUser.profile.status_text.toLowerCase();

  return (
    slackUser.profile.status_emoji === ':palm_tree:' ||
    slackUser.profile.status_emoji === ':face_with_thermometer:' ||
    text.indexOf('vacation') !== -1 ||
    text.indexOf('vacay') !== -1 ||
    text.indexOf('pto') !== -1 ||
    text.indexOf('ooo') !== -1 ||
    text.indexOf('sick') !== -1
  );
};

const getSlackStatus = async (user) => {
  const slackUser = await client.getUser(user.userId);
  return slackUser.profile.status_emoji + ' ' + slackUser.profile.status_text;
};

export const startStandup = async (room) => {
  const users = await getActiveRoomUsers(room);

  if (users.length === 0) {
    return;
  }

  const actives = [];
  const aways = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const slackUser = await client.getUser(user.userId);

    if (shouldSkip(slackUser)) {
      aways.push(user);
    } else {
      actives.push(user);
    }
  }

  const alert = actives.map((user) => u(user.userId)).join(' ');

  const now = localdate();

  const standup = await room.createStandup({
    day: now.date,
    hour: now.hours,
    minutes: now.minutes,
    nagged: getInitialNagState(room.length),
    year: now.year,
    endTime: sequelize.literal(`datetime('now', '+${room.length} minutes')`),
    threaded: room.threading,
  });

  if (aways.length) {
    for (let i = 0; i < aways.length; i++) {
      const u = aways[i]
      const message = await getSlackStatus(u);

      await addUpdateToStandup(standup, u, message, UPDATE_SKIP);
    }
  }

  const ends = moment().utc().add(room.length, 'minutes').unix();

  const NICK = await client.nick();

  // Slack magic to format the date in the user's timezone
  const endsText = `<!date^${ends}^standup ends at {time}|standup ends in ${room.length} minutes>`;
  let ping = `${alert}, it's time for standup!\nClock is ticking, ${endsText}.\nUsage: \`${NICK} I am working on...\``;

  if (aways.length) {
    const displayNames = [];
    for (let i = 0; i < aways.length; i++) {
      displayNames.push(await getDisplayName(aways[i]));
    }

    ping += `\nI've automatically skipped ${commifyList(
      displayNames
    )} due to their Slack status.`;
  }

  if (room.threading) {
    let resp;

    try {
      resp = await client.say(
        room.channelId,
        ':hourglass: Beginning standup...'
      );
    } catch (e) {
      return rollbackStandup(standup);
    }

    client.say(room.channelId, ping, {
      thread_ts: resp.ts,
      reply_broadcast: true,
    });

    client.pin(room.channelId, resp.ts);

    standup.update({
      threadRoot: resp.ts,
    });
  } else if (room.announce) {
    try {
      const resp = await client.say(room.channelId, ping);
    } catch (e) {
      return rollbackStandup(standup);
    }
  }

  const topic = await client.getTopic(room.channelId);

  standup.update({ topic }).then(() => updateTopic(standup));
};

export const isHoliday = () => {
  const { date, month } = localdate();

  return HOLIDAYS.includes(`${month}/${date}`);
};

export const startScheduledStandup = async (schedule) => {
  const room = await schedule.getRoom();
  const users = await getActiveRoomUsers(room);

  if (users.length === 0) {
    return;
  }

  setScheduleLast(schedule);

  if (isHoliday()) {
    client.say(
      room.channelId,
      "Standup scheduled, but today is a US company holiday. If you'd still like to have a standup, use `.standup start`, otherwise enjoy your day off!"
    );
    return;
  }

  startStandup(room);
};

export const standupHasUpdatesFromAllUsers = async (standup) => {
  const room = await standup.getRoom();

  // Be nice to figure out a way to do this via sequelize model
  const [countResult, activeUsers] = await Promise.all([
    sequelize.query(
      'SELECT COUNT(DISTINCT userId) AS count FROM updates WHERE standupId = ?',
      {
        replacements: [standup.id],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    getActiveRoomUsers(room),
  ]);

  const [{ count }] = countResult;

  return count === activeUsers.length;
};

export const standupHasUpdateFromUserOfType = async (standup, user, type) => {
  const updates = await standup.getUpdates({
    where: {
      userId: user.id,
      type,
    },
  });

  return updates.length;
};

export const deleteUpdatesFromUserOfType = (standup, user, type) => {
  return Update.destroy({
    where: {
      standupId: standup.id,
      userId: user.id,
      type,
    },
  });
};

export const completeStandup = async (standup) => {
  const room = await standup.getRoom();

  standup
    .update({
      state: STANDUP_COMPLETE,
    })
    .then(() => {
      if (room.announce) {
        const msg =
          "Standup's complete! If you have anything to add, add another update in the next few minutes.";

        client.say(room.channelId, msg, {
          thread_ts: standup.threadRoot,
        });
      }

      const end = new Date(standup.endTime);
      const now = new Date();
      now.setMinutes(now.getMinutes() + 10);

      if (now < end) {
        standup.update({
          endTime: now,
        });
      }
    });
};

export const getRoomAndStandupAndUser = (channelId, userId) => {
  return new Promise(async (resolve, reject) => {
    const room = await Room.findOne({ where: { channelId } });

    if (!room) {
      return resolve([null, null, null]);
    }

    const [standups, user] = await Promise.all([
      room.getActiveStandups(),
      User.findOne({ where: { userId } }),
    ]);

    const [standup] = standups;

    resolve([room, standup, user]);
  });
};

export const addUpdateToStandup = (
  standup,
  user,
  message,
  type = UPDATE_NORMAL,
  meta = null
) => {
  const messages = message.split('\n');

  // Store multiline messages as separate updates
  const promises = messages.map((message) => {
    const update = Update.build({
      message,
      type,
      meta,
    });

    update.setUser(user, { save: false });
    update.setStandup(standup, { save: false });

    return update.save();
  });

  return Promise.all(promises);
};

export const maybeCloseStandup = async (standup) => {
  if (standup.state === STANDUP_COMPLETE) {
    return;
  }

  const done = await standupHasUpdatesFromAllUsers(standup);

  if (done) {
    completeStandup(standup);
  }

  updateTopic(standup);
};

export const getDisplayName = async (user) => {
  const clientUser = await client.getUser(user.userId);
  const displayName = clientUser.profile.display_name.length
    ? clientUser.profile.display_name
    : clientUser.profile.real_name;

  return preventAlerts(displayName);
};

export const updateTopic = async (standup) => {
  const [room, updates] = await Promise.all([
    standup.getRoom(),
    standup.getUpdates({ attributes: ['userId'] }),
  ]);

  // Threaded standups don't update channel topic,
  // they fake it by updating the original message,
  // so always do this for threaded standups.
  if (!room.topic && !standup.threaded) {
    return;
  }

  const users = await getActiveRoomUsers(room);

  const ids = updates.map((update) => update.userId);

  const nicks = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const display = await getDisplayName(user);

    if (ids.indexOf(user.id) === -1) {
      nicks.push(display);
      continue;
    }

    nicks.push(`~${display}~`);
  }

  const topic = `Standup in progress: ${nicks.join(' ')}`;

  if (standup.threaded) {
    if (standup.threadRoot) {
      client.update(room.channelId, standup.threadRoot, topic);
    }
  } else {
    client.setTopic(room.channelId, topic);
  }
};

export const getDeliquentUserIds = async (standup) => {
  const updates = await standup.getUpdates({ attributes: ['userId'] });
  const filterIds = updates.map((update) => update.userId);

  const options = filterIds.length
    ? {
        where: {
          id: {
            $notIn: filterIds,
          },
        },
      }
    : {};

  const users = await getActiveRoomUsers(standup.room, options);

  return users.map((user) => user.userId);
};

export const warnStandup = async (standup) => {
  const userIds = await getDeliquentUserIds(standup);
  const NICK = await client.nick();

  const opts = standup.threaded
    ? { thread_ts: standup.threadRoot, reply_broadcast: true }
    : {};

  client.say(
    standup.room.channelId,
    `${commifyList(
      userIds,
      u
    )} :wave: Can I trouble you for a standup update? Use: \`${NICK} Your update here...\``,
    opts
  );

  standup.update({
    nagged: NAGGED_WARN,
  });
};

export const threatenStandup = async (standup) => {
  const userIds = await getDeliquentUserIds(standup);
  const NICK = await client.nick();

  const opts = standup.threaded
    ? { thread_ts: standup.threadRoot, reply_broadcast: true }
    : {};

  client.say(
    standup.room.channelId,
    `${commifyList(
      userIds,
      u
    )} :clock11: Standup is almost over. Anything to report? Use: \`${NICK} Your update here....\``,
    opts
  );

  standup.update({
    nagged: NAGGED_THREAT,
  });
};

export const setChannelActiveStatus = async (channelId, active) => {
  const room = await Room.findOne({
    where: {
      channelId,
    },
  });

  if (room) {
    room.update({
      active,
    });
  }
};
