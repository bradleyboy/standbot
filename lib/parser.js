import client from './client';
import * as commands from '../commands';
import { user as u } from '../formatters';

import { COMMAND, COMMANDS, IGNORE_CHANNELS } from '../constants';

const commandRegex = new RegExp(
  `^\\.${COMMAND}\\s+(${COMMANDS.join('|')})(?:\\s+([\\s\\S]*))?$`,
  'm'
);

const parser = async (message) => {
  const NICK = await client.nick();
  const atRegex = new RegExp(`^${NICK}\:?\\s+([\\s\\S]*)$`, 'm');
  const { text, channel, user } = message;

  if (u(user) === NICK) {
    // Ignore the bots messages
    return;
  }

  if (!text) {
    return;
  }

  if (IGNORE_CHANNELS.includes(channel)) {
    return;
  }

  if (client.isPrivateChannel(channel)) {
    client.sayAt(
      channel,
      user,
      "Oh hey. I don't work well in DMs. Please try me out in a channel. A private channel works too!"
    );
    return;
  }

  const matches = text.match(commandRegex);

  if (matches) {
    const [command, arg] = matches.slice(1);
    return commands[command](user, channel, arg, message);
  }

  if (text.indexOf(`.${COMMAND}`) === 0) {
    return commands.help(user, channel, null, message);
  }

  const atMatches = text.match(atRegex);

  if (atMatches) {
    const [arg] = atMatches.slice(1);
    return commands.update(user, channel, arg, message);
  }
};

export default parser;
