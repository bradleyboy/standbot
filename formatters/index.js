import markdown from 'markdown-it';
import moment from 'moment-timezone';

import client from '../lib/client';

import { jiraDomain, githubDomain } from '../config';

const md = markdown();

const displayMap = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const dayToString = dayInt => {
  return displayMap[dayInt];
};

export const prettyTime = (hours, minutes = 0) => {
  const time = moment()
    .tz('America/New_York')
    .hours(hours)
    .minutes(minutes)
    .unix();

  // This is all just for fallback in case the Slack client does
  // not support {time}
  const suffix = hours > 11 ? 'pm' : 'am';
  const h = hours > 12 ? hours - 12 : hours < 1 ? 12 : hours;
  const m = minutes < 10 ? `0${minutes}` : minutes;

  const fallback = `${h}:${m}${suffix}`;

  // Return date in user's timezone
  return `<!date^${time}^{time}|${fallback}>`;
};

const linkJira = message => {
  if (!jiraDomain.length) {
    return message;
  }

  return message.replace(/([=\/])?\b[A-Z]{2,}\-\d+/g, (issue, hasSlash) => {
    return hasSlash
      ? issue
      : `<a href="${jiraDomain}/browse/` + issue + '">' + issue + '</a>';
  });
};

const linkPullRequest = message => {
  if (!githubDomain.length) {
    return message;
  }

  return message.replace(/(?:#)(\d{2,})/g, (fullMatch, issue) => {
    return `<a href="${githubDomain}/pull/${issue}">${fullMatch}</a>`;
  });
};

const convertMarkdown = message => {
  return md.renderInline(message);
};

const linkers = [convertMarkdown, linkJira, linkPullRequest];

export const formatForEmail = message => {
  return linkers.reduce((formattedMessage, linker) => {
    return linker(formattedMessage);
  }, message);
};

export const user = userId => {
  return `<@${userId}>`;
};

export const channel = channelId => {
  const channel = client.getChannel(channelId);

  if (channel.is_group) {
    // private group
    return `*${channel.name}*`;
  }

  return `<#${channelId}>`;
};

export const commifyList = (list, itemFormatter = e => e) => {
  const formattedItems = list.map(itemFormatter);

  if (list.length === 1) {
    return formattedItems[0];
  }

  if (list.length === 2) {
    return formattedItems.join(' and ');
  }

  const lastItem = formattedItems.pop();

  return `${formattedItems.join(', ')} and ${lastItem}`;
};

export const preventAlerts = str => {
  if (str.length === 1) {
    // Nothing we can do here
    return str;
  }

  // Insert a zero-width space between the first two letters
  return str.substr(0, 1) + '\u200b' + str.substr(1);
};
