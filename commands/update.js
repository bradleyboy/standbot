import client from '../lib/client';
import randomResponses from '../utils/randomResponses';

import {
  getRoomAndStandupAndUser,
  addUpdateToStandup,
  maybeCloseStandup,
  standupHasUpdateFromUserOfType,
  deleteUpdatesFromUserOfType,
} from '../actions';

import { UPDATE_SKIP, UPDATE_REGULAR } from '../constants';

export default async function(userId, channelId, message, rawMessage) {
  const [room, standup, user] = await getRoomAndStandupAndUser(
    channelId,
    userId
  );

  if (!room) {
    client.sayAt(
      channelId,
      userId,
      "Oops, this room doesn't have any standups scheduled. See .standup help for more info."
    );
    return;
  }

  if (!standup) {
    client.sayAt(
      channelId,
      userId,
      "Sorry, there isn't a standup in progress.",
      {
        thread_ts: rawMessage.thread_ts,
      }
    );
    return;
  }

  const inRoom = await room.hasUser(user);

  if (!inRoom) {
    client.sayAt(
      channelId,
      userId,
      `:wave: I don't believe we've met. Use \`.standup add \<@${userId}>\` to join this room's standups.`,
      {
        thread_ts: rawMessage.thread_ts,
      }
    );
    return;
  }

  if (standup.threaded && rawMessage.thread_ts !== standup.threadRoot) {
    // Threaded standup, so ignore messages in the channel
    // add PM the user linking them to the thread.
    const link = await client.link(
      `/conversation/${channelId}/p${standup.threadRoot.replace('.', '')}`
    );
    client.pm(
      userId,
      `Hey, the standup is happening in this thread, please add your status here: ${link}`
    );
    return;
  }

  const userAlreadyUpdated = await standupHasUpdateFromUserOfType(
    standup,
    user,
    UPDATE_REGULAR
  );

  addUpdateToStandup(standup, user, message).then(async () => {
    const userAlreadySkipped = await standupHasUpdateFromUserOfType(
      standup,
      user,
      UPDATE_SKIP
    );

    if (userAlreadySkipped) {
      deleteUpdatesFromUserOfType(standup, user, UPDATE_SKIP);
    }

    client.reactTo(rawMessage);

    if (!userAlreadyUpdated) {
      // We don't need to do the maybeCloseStandup stuff unless this is a new user
      // update. Saves unnecessary topic updates, etc.
      maybeCloseStandup(standup);
    }
  });
}
