# standbot

Because the world needs one more bot.

## Hacking on standbot

Clone the repo, cd into it, then run:

```
npm install
```

Before running it, copy config.template.js to config.js and edit the values. You will need a Slack API token for the bot. The rest of the configuration is well documented in the template.

To start it up:

```
npm run reset
npm start
```

Data is persisted in a sqlite database at `storage/db.sqlite`. Note that running a reset will delete and recreate that database.

Code formatting consitency is maintained via `prettier`. Please make sure any changes you propose have been run through prettier with the following options: `--single quote --trailing-comma es5`.

## Running on Docker

In this directory, build the image:

```
docker built -t standbot .
```

To run it, create your config.js file and also create a directory to mount for the sqlite database. Then run the container:

```
docker run -d \
  -v /path/to/config.js:/usr/src/app/config.js \
  -v /path/to/storage/directory:/usr/src/app/storage \
  standbot
```
