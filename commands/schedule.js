import moment from 'moment-timezone';

import client from '../lib/client';
import { Room } from '../lib/db';
import { hourToNumber } from '../utils/time';

import { dayToString, prettyTime, channel } from '../formatters';

const map = {
  sun: 0,
  sunday: 0,
  m: 1,
  mon: 1,
  monday: 1,
  t: 2,
  tue: 2,
  tuesday: 2,
  w: 3,
  wed: 3,
  wednesday: 3,
  th: 4,
  thu: 4,
  thursday: 4,
  f: 5,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const validDaysForRegex = Object.keys(map).join('|');
const regex = new RegExp(
  `^(${validDaysForRegex})\\s+(?:(cancel)|(?:(\\d{1,2})(?:\\:(\\d{2}))?(am|pm)))`
);

export default async function(userId, channelId, args, rawMessage) {
  const [room] = await Room.findOrCreate({
    where: { channelId },
  });

  const sayOpts = {
    thread_ts: rawMessage.thread_ts,
  };

  if (!args) {
    const schedules = await room.getSchedules({
      order: 'day asc',
    });

    if (!schedules.length) {
      client.sayAt(
        channelId,
        userId,
        "You haven't scheduled any standups yet.",
        sayOpts
      );
      return;
    }

    const string = schedules
      .map(standup => {
        return `${dayToString(standup.day)}s at ${prettyTime(
          standup.hour,
          standup.minutes
        )}`;
      })
      .join('\n');

    const msgs = [
      `Ok, here's the schedule for ${channel(
        channelId
      )}. Times are shown in each individual user's timezone.`,
      string,
    ];

    client.sayAt(channelId, userId, msgs.join('\n'), sayOpts);
    return;
  }

  const timeString = args.toLowerCase().trim();
  const matches = timeString.match(regex);

  if (!matches) {
    client.sayAt(
      channelId,
      userId,
      "I don't understand that schedule. Ex: .standup schedule Monday 10:30am",
      sayOpts
    );
    return;
  }

  const [, dayString, cancel, hourRaw, minutesRaw, timeOfDay] = matches;

  const day = map[dayString];
  const hour = hourToNumber(Number(hourRaw), timeOfDay === 'pm');
  const minutes = Number(minutesRaw || 0);

  const scheduled = await room.getSchedules({
    where: { day },
  });

  const user = client.getUser(userId);

  const userTime = moment().tz(user.tz).hours(hour).minutes(minutes);

  const time = `<!date^${userTime.unix()}^ For everyone else, that'll be {time} in your timezone.| >`;
  const timeDisplay = `${userTime.format('h:mm A z')}.${time}`;

  const easternTime = userTime.tz('America/New_York');

  if (cancel) {
    if (!scheduled.length) {
      client.sayAt(
        channelId,
        userId,
        `No standups scheduled for ${dayToString(day)}.`,
        sayOpts
      );
      return;
    }

    scheduled[0].destroy();

    client.sayAt(
      channelId,
      userId,
      `Ok, removed the standup for ${dayToString(day)}.`,
      sayOpts
    );

    return;
  }

  if (scheduled.length) {
    scheduled[0].update({
      minutes: easternTime.minutes(),
      hour: easternTime.hours(),
    });

    client.sayAt(
      channelId,
      userId,
      `Ok, updated the ${dayToString(day)} standup to be at ${timeDisplay}`,
      sayOpts
    );

    return;
  }

  room
    .createSchedule({
      day,
      minutes: easternTime.minutes(),
      hour: easternTime.hours(),
    })
    .then(() => {
      client.sayAt(
        channelId,
        userId,
        `Ok, added a standup on ${dayToString(day)}s at ${timeDisplay}`,
        sayOpts
      );
    });
}
