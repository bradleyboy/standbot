import { RTMClient } from '@slack/rtm-api';
import { WebClient } from '@slack/web-api';

import { token } from '../config';

import randomResponses from '../utils/randomResponses';

export const USER_FRAGMENT_REGEX = /<@[UW][0-9A-Z]+>/;
const CHANNEL_FRAGMENT_REGEX = /<#C[0-9A-Z]+\|([^>]+)>/;
const LINK_FRAGMENT_REGEX = /<(https?:\/\/[^\|]+)\|[^>]+>/;

const extractIdFromFragment = (fragment) => {
  return fragment.replace(/[^0-9A-Z]/g, '');
};

const rtm = new RTMClient(token);

const web = new WebClient(token);

const subscribers = [];
const joinedSubscribers = [];
const leftSubscribers = [];

rtm.on('message', (message) => {
  subscribers.forEach((fn) => fn(message));
});

const handleJoin = ({ channel }) => {
  joinedSubscribers.forEach((fn) => fn(channel));
};

// Note: leave events only pass the channel id,
// not the full channel object
const handleLeave = ({ channel }) => {
  leftSubscribers.forEach((fn) => fn(channel));
};

rtm.on('channel_joined', handleJoin);
rtm.on('group_joined', handleJoin);

rtm.on('channel_left', handleLeave);
rtm.on('group_left', handleLeave);

rtm.start();

let nick = null;

export default {
  joined(fn) {
    joinedSubscribers.push(fn);
  },

  left(fn) {
    leftSubscribers.push(fn);
  },

  listen(fn) {
    subscribers.push(fn);
  },

  stop() {
    rtm.disconnect();
  },

  async nick() {
    if (nick) {
      return nick;
    }

    const resp = await web.auth.test();
    nick = `<@${resp.user_id}>`;
    return nick;
  },

  say(channelId, message, opts = {}) {
    return web.chat.postMessage({
      text: message,
      channel: channelId,
      as_user: true,
      ...opts,
    });
  },

  sayAt(channelId, at, message, opts = {}) {
    return this.say(channelId, `<@${at}> ${message}`, opts);
  },

  pm(userId, message) {
    return this.say(userId, message);
  },

  async link(relativeUrl) {
    const info = await web.team.info();

    return `https://${info.team.domain}.slack.com${relativeUrl}`;
  },

  update(channel, ts, text) {
    web.chat.update({ ts, channel, text });
  },

  pin(channel, timestamp) {
    web.pins.add({ channel, timestamp });
  },

  unpin(channel, timestamp) {
    web.pins.remove({ channel, timestamp });
  },

  async getChannel(channelId) {
    const { channel } = await web.conversations.info({ channel: channelId });
    return channel;
  },

  async getTopic(channelId) {
    const channel = await this.getChannel(channelId);

    return channel.topic.value;
  },

  async setTopic(channelId, topic) {
    const channel = await this.getChannel(channelId);

    const facet = channel.is_group ? 'groups' : 'channels';

    web[facet].setTopic(channelId, topic);
  },

  async getUser(user) {
    const resp = await web.users.info({ user });
    return resp.user;
  },

  isUserFragment(fragment) {
    return USER_FRAGMENT_REGEX.test(fragment);
  },

  parseUser(fragment) {
    if (this.isUserFragment(fragment)) {
      return extractIdFromFragment(fragment);
    }

    return null;
  },

  createPost(opts) {
    web.files.upload(opts);
  },

  reactTo(message, emoji = null) {
    let response = emoji;

    if (message.text.toLowerCase().includes('cake')) {
      response = ':cake:';
    } else if (response == null) {
      response = randomResponses();
    }

    web.reactions.add({
      name: response.replace(/:/g, ''),
      timestamp: message.ts,
      channel: message.channel,
    });
  },

  async formatMessageAsPlain(message) {
    const usernames = message.match(new RegExp(USER_FRAGMENT_REGEX, 'g'));
    const displayNames = [];

    if (usernames) {
      for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];
        const id = extractIdFromFragment(username);
        const user = await this.getUser(id);
        displayNames[id] = `@${user.profile.display_name}`;
      }

      message = message.replace(
        new RegExp(USER_FRAGMENT_REGEX, 'g'),
        (match) => {
          const id = extractIdFromFragment(match);
          return displayNames[id];
        }
      );
    }

    return message
      .replace(new RegExp(CHANNEL_FRAGMENT_REGEX, 'g'), (_, channel) => {
        return `#${channel}`;
      })
      .replace(new RegExp(LINK_FRAGMENT_REGEX, 'g'), (_, url) => {
        return url;
      });
  },

  isPrivateChannel(channel) {
    return channel.substring(0, 1) === 'D';
  },
};
