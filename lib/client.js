import { RtmClient, WebClient, MemoryDataStore } from 'slack-client';

import { token } from '../config';

import randomResponses from '../utils/randomResponses';

const USER_FRAGMENT_REGEX = /<@[UW][0-9A-Z]+>/;
const CHANNEL_FRAGMENT_REGEX = /<#C[0-9A-Z]+\|([^>]+)>/;
const LINK_FRAGMENT_REGEX = /<(https?:\/\/[^\|]+)\|[^>]+>/;

const extractIdFromFragment = (fragment) => {
  return fragment.replace(/[^0-9A-Z]/g, '');
};

const rtm = new RtmClient(token, {
  dataStore: new MemoryDataStore(),
});

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

  nick() {
    return new Promise((resolve, reject) => {
      if (nick) {
        return resolve(nick);
      }

      web.auth.test((err, resp) => {
        if (err) {
          return reject(err);
        }

        nick = `<@${resp.user_id}>`;
        return resolve(nick);
      });
    });
  },

  say(channelId, message, opts = {}) {
    const finalOpts = {
      ...opts,
      as_user: true,
    };

    return new Promise((resolve, reject) => {
      web.chat.postMessage(channelId, message, finalOpts, (err, resp) => {
        if (err) {
          return reject(err);
        }

        if (resp.ok) {
          return resolve(resp);
        }

        reject(resp);
      });
    });
  },

  sayAt(channelId, at, message, opts = {}) {
    return this.say(channelId, `<@${at}> ${message}`, opts);
  },

  pm(userId, message) {
    web.dm.open(userId, (err, resp) => {
      this.say(resp.channel.id, message);
    });
  },

  link(relativeUrl) {
    // TODO: Could cache this.
    return new Promise((resolve, reject) => {
      web.team.info((err, resp) => {
        resolve(`https://${resp.team.domain}.slack.com${relativeUrl}`);
      });
    });
  },

  update(channelId, ts, text) {
    web.chat.update(ts, channelId, text);
  },

  pin(channelId, timestamp) {
    web.pins.add(channelId, {
      timestamp,
    });
  },

  unpin(channelId, timestamp) {
    web.pins.remove(channelId, {
      timestamp,
    });
  },

  getChannel(channelId) {
    return rtm.dataStore.channels[channelId] || rtm.dataStore.groups[channelId];
  },

  getTopic(channelId) {
    return new Promise(async (resolve, reject) => {
      const channelInfo = await this.getChannelInfo(channelId);

      resolve(channelInfo.topic.value);
    });
  },

  getChannelInfo(channelId) {
    return new Promise((resolve, reject) => {
      const channel = this.getChannel(channelId);

      const facet = channel.is_group ? 'groups' : 'channels';

      web[facet].info(channelId, (err, resp) => {
        resolve(resp.channel || resp.group);
      });
    });
  },

  setTopic(channelId, topic) {
    const channel = this.getChannel(channelId);

    const facet = channel.is_group ? 'groups' : 'channels';

    web[facet].setTopic(channelId, topic);
  },

  getUser(userId) {
    return rtm.dataStore.getUserById(userId);
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

    web.reactions.add(response.replace(/:/g, ''), {
      timestamp: message.ts,
      channel: message.channel,
    });
  },

  formatMessageAsPlain(message) {
    return message
      .replace(new RegExp(USER_FRAGMENT_REGEX, 'g'), (match) => {
        const id = extractIdFromFragment(match);
        const user = this.getUser(id);

        return `@${user.profile.display_name}`;
      })
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
