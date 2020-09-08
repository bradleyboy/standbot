import Sequelize from 'sequelize';
import jsonColumn from 'sequelize-json';
import localdate from './localdate';

import {
  STANDUP_OPEN,
  STANDUP_CLOSED,
  STANDUP_COMPLETE,
  NAGGED_NO,
  NAGGED_WARN,
  UPDATE_REGULAR,
  UPDATE_SKIP,
} from '../constants';

const dbPath = process.env.DB_PATH || './storage/db.sqlite';

console.log('Using DB path: ', dbPath);

export const sequelize = new Sequelize(null, null, null, {
  dialect: 'sqlite',
  storage: dbPath,
  logging: false,
});

export const Room = sequelize.define('room', {
  channelId: {
    type: Sequelize.STRING,
    unique: true,
  },
  email: {
    type: Sequelize.STRING,
  },
  length: {
    type: Sequelize.INTEGER,
    defaultValue: 30,
  },
  active: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  topic: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  announce: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  threading: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

export const User = sequelize.define('user', {
  userId: {
    type: Sequelize.STRING,
    unique: true,
  },
});

export const Schedule = sequelize.define(
  'schedules',
  {
    day: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    hour: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    minutes: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    last: {
      type: Sequelize.STRING,
    },
  },
  {
    scopes: {
      shouldStart: () => {
        const now = localdate();

        const { day, date, hours, minutes, month } = localdate();

        const last = `${month}/${date}`;

        return {
          include: [
            {
              model: Room,
              where: { active: true },
            },
          ],
          where: {
            day,
            hour: {
              $lte: hours,
            },
            minutes: {
              $lte: minutes,
            },
            last: {
              $or: {
                $eq: null,
                $ne: last,
              },
            },
          },
        };
      },
    },
  }
);

export const Standup = sequelize.define(
  'standups',
  {
    day: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    hour: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    year: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    minutes: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    state: {
      type: Sequelize.INTEGER,
      defaultValue: STANDUP_OPEN,
    },
    endTime: {
      type: Sequelize.DATE,
    },
    topic: {
      type: Sequelize.TEXT,
    },
    nagged: {
      type: Sequelize.INTEGER,
      defaultValue: NAGGED_NO,
    },
    threaded: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    threadRoot: {
      type: Sequelize.STRING,
    },
  },
  {
    scopes: {
      open: {
        where: {
          state: {
            $ne: STANDUP_CLOSED,
          },
        },
      },
      shouldClose: {
        where: {
          state: {
            $ne: STANDUP_CLOSED,
          },
          endTime: {
            $lt: sequelize.literal("datetime('now')"),
          },
        },
      },
      shouldWarn: {
        where: {
          state: STANDUP_OPEN,
          endTime: {
            $lte: sequelize.literal("datetime('now', '+10 minutes')"),
          },
          nagged: NAGGED_NO,
        },
      },
      shouldThreat: {
        where: {
          state: STANDUP_OPEN,
          endTime: {
            $lte: sequelize.literal("datetime('now', '+5 minutes')"),
          },
          nagged: NAGGED_WARN,
        },
      },
    },
  }
);

export const Update = sequelize.define('updates', {
  message: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  type: {
    type: Sequelize.INTEGER,
    defaultValue: UPDATE_REGULAR,
  },
  meta: jsonColumn(sequelize, 'Update', 'meta'),
});

const RoomUsers = sequelize.define('rooms_users');

Room.belongsToMany(User, { through: RoomUsers });
User.belongsToMany(Room, { through: RoomUsers });
Room.hasMany(Schedule);
Room.hasMany(Standup);
Room.hasMany(Standup.scope('open'), { as: 'activeStandups' });
Schedule.belongsTo(Room);
Standup.belongsTo(Room);
Standup.hasMany(Update);
Update.belongsTo(Standup);
Update.belongsTo(User);
User.hasMany(Update);

sequelize.sync();
