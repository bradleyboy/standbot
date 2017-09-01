import client from '../lib/client';
import randomResponses from '../utils/randomResponses';
import { User } from '../lib/db';

import {
  getRoomAndStandupAndUser,
  addUpdateToStandup,
  maybeCloseStandup,
  standupHasUpdateFromUserOfType,
} from '../actions';

import { UPDATE_SKIP, UPDATE_REGULAR } from '../constants';

import { user as u } from '../formatters';

export default async function(fromUserId, channelId, args, rawMessage) {
  const [userFragment, ...message] = args.trim().split(' ');
  const userId = client.parseUser(userFragment);
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );

  if (!standup) {
    client.sayAt(
      channelId,
      fromUserId,
      "Sorry, there isn't a standup in progress.",
      {
        thread_ts: rawMessage.thread_ts,
      }
    );
    return;
  }

  if (standup.threaded && standup.threadRoot !== rawMessage.thread_ts) {
    return;
  }

  const sayOpts = standup.threaded ? { thread_ts: standup.threadRoot } : {};

  if (!userId) {
    client.sayAt(
      channelId,
      fromUserId,
      'Hmm, does not compute. When skipping be sure to use @ when specifying the user.',
      sayOpts
    );
    return;
  }

  if (!message.length) {
    client.sayAt(
      channelId,
      fromUserId,
      "I'll need a reason. Usage: .standup skip &lt;@user&gt; <reason>",
      sayOpts
    );
    return;
  }

  const inRoom = await room.hasUser(user);

  if (!inRoom) {
    client.sayAt(channelId, fromUserId, `I don't know ${u(userId)}.`, sayOpts);
    return;
  }

  const reportingUser = await User.findOne({ where: { userId: fromUserId } });

  const reporterInRoom = await room.hasUser(reportingUser);

  if (!reporterInRoom) {
    client.sayAt(
      channelId,
      fromUserId,
      "Hey, you're not part of this room's standup.",
      sayOpts
    );
    return;
  }

  const userAlreadyUpdated = await standupHasUpdateFromUserOfType(
    standup,
    user,
    UPDATE_REGULAR
  );

  if (userAlreadyUpdated) {
    client.sayAt(
      channelId,
      fromUserId,
      `Hey, ${u(userId)} has already given an update.`,
      sayOpts
    );
    return;
  }

  const userAlreadySkipped = await standupHasUpdateFromUserOfType(
    standup,
    user,
    UPDATE_SKIP
  );

  if (userAlreadySkipped) {
    client.sayAt(
      channelId,
      fromUserId,
      `Hey, ${u(userId)} has already been skipped.`,
      sayOpts
    );
    return;
  }

  addUpdateToStandup(standup, user, message.join(' '), UPDATE_SKIP, {
    reporter: reportingUser.userId,
  }).then(() => {
    client.reactTo(rawMessage);
    maybeCloseStandup(standup);
  });
}
