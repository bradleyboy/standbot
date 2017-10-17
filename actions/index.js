/**
 * TODO: Clean this up. functions.php is not cool, not even in node.
 */

import client from '../lib/client';
import { Room, Update, User, sequelize } from '../lib/db';
import uniqueArray from 'unique-random-array';
import transport from '../lib/email';
import localdate from '../lib/localdate';
import fetch from 'node-fetch';
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
  NICK,
  SUMMARY_EMAIL_FROM_ADDRESS,
} from '../constants';

const formatUpdateMessage = ({ type, message, meta }) => {
  if (type === UPDATE_SKIP) {
    const reporter = client.getUser(meta.reporter);
    return `${message} (according to @${reporter.name})`;
  }

  return client.formatMessageAsPlain(message);
};

export const closeStandup = standup => {
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

        updates.forEach(update => {
          const message = formatUpdateMessage(update);
          out.push(`${u(update.user.userId)}: ${message}`);
        });

        const summary = out.join('\n');
        client.say(room.channelId, summary, {
          thread_ts: standup.threadRoot,
        });
      }
    });
};

export const sendStandupSummaryEmail = async standup => {
  const [room, updates] = await Promise.all([
    standup.getRoom(),
    standup.getUpdates({
      include: [User],
      order: 'type asc, updates.id asc',
    }),
  ]);

  const map = {};
  const alternateBackground = uniqueArray(['#fbfbfb', '#ffffff']);

  updates.forEach(update => {
    if (!map[update.user.userId]) {
      map[update.user.userId] = [];
    }

    const message = formatForEmail(formatUpdateMessage(update));

    map[update.user.userId].push(message);
  });

  const fragments = [];
  const channel = client.getChannel(room.channelId);

  for (let i of Object.keys(map)) {
    const updates = map[i]
      .map(
        update => `<p style="margin: 0 0 10px;">${emoji.emojify(update)}</p>`
      )
      .join('');
    const user = client.getUser(i);

    fragments.push(`
      <tr style="background: ${alternateBackground()};">
        <td width="120" style="padding: 10px 0; text-align: center;">
          <img width="72" style="border-radius: 50%" src="${user.profile
            .image_72}">
          <p style="margin:0; font-weight: bold;">${user.name}</p>
        </td>
        <td style="padding-top: 10px">${updates}</td>
      </tr>
    `);
  }

  const html = `
<html>
<head></head>
<body style="padding: 5px;">
  <h1 style="margin: 0; font-size: 16px; font-weight: normal; padding: 5px; border-bottom: 1px solid orange;">Today's standup summary for <b>${channel.name}</b></h1>
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

export const restoreTopic = async standup => {
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

  client.setTopic(room.channelId, standup.topic);
};

export const setScheduleLast = schedule => {
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
const getInitialNagState = minutes => {
  if (minutes < 10) {
    return NAGGED_THREAT;
  }

  if (minutes <= 15) {
    return NAGGED_WARN;
  }

  return NAGGED_NO;
};

export const rollbackStandup = async standup => {
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

export const startStandup = async room => {
  const users = await room.getUsers();
  const alert = users.map(user => u(user.userId)).join(' ');

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

  const ends = moment().utc().add(room.length, 'minutes').unix();

  // Slack magic to format the date in the user's timezone
  const endsText = `<!date^${ends}^standup ends at {time}|standup ends in ${room.length} minutes>`;
  const ping = `${alert}, it's time for standup!\nClock is ticking, ${endsText}.\nUsage: \`${NICK} I am working on...\``;

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

export const startScheduledStandup = async schedule => {
  setScheduleLast(schedule);

  const room = await schedule.getRoom();

  if (isHoliday()) {
    client.say(
      room.channelId,
      "Standup scheduled, but today is a US company holiday. If you'd still like to have a standup, use `.standup start`, otherwise enjoy your day off!"
    );
    return;
  }

  startStandup(room);
};

export const standupHasUpdatesFromAllUsers = async standup => {
  const room = await standup.getRoom();

  // Be nice to figure out a way to do this via sequelize model
  const [countResult, usersCount] = await Promise.all([
    sequelize.query(
      'SELECT COUNT(DISTINCT userId) AS count FROM updates WHERE standupId = ?',
      {
        replacements: [standup.id],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    room.countUsers(),
  ]);

  const [{ count }] = countResult;

  return count === usersCount;
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

export const completeStandup = async standup => {
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
  const promises = messages.map(message => {
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

export const maybeCloseStandup = async standup => {
  if (standup.state === STANDUP_COMPLETE) {
    return;
  }

  const done = await standupHasUpdatesFromAllUsers(standup);

  if (done) {
    completeStandup(standup);
  }

  updateTopic(standup);
};

export const updateTopic = async standup => {
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

  const users = await room.getUsers();

  const ids = updates.map(update => update.userId);

  const nicks = users
    .map(user => {
      const clientUser = client.getUser(user.userId);
      const display = `${preventAlerts(clientUser.profile.display_name)}`;

      if (ids.indexOf(user.id) === -1) {
        return display;
      }

      return `~${display}~`;
    })
    .join(' ');

  const topic = `Standup in progress: ${nicks}`;

  if (standup.threaded) {
    if (standup.threadRoot) {
      client.update(room.channelId, standup.threadRoot, topic);
    }
  } else {
    client.setTopic(room.channelId, topic);
  }
};

export const getDeliquentUserIds = async standup => {
  const updates = await standup.getUpdates({ attributes: ['userId'] });
  const filterIds = updates.map(update => update.userId);

  const options = filterIds.length
    ? {
        where: {
          id: {
            $notIn: filterIds,
          },
        },
      }
    : {};

  const users = await standup.room.getUsers(options);

  return users.map(user => user.userId);
};

export const warnStandup = async standup => {
  const userIds = await getDeliquentUserIds(standup);

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

export const threatenStandup = async standup => {
  const userIds = await getDeliquentUserIds(standup);

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
