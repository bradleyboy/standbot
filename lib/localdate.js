import moment from 'moment-timezone';

export default () => {
  const raw = moment().tz('America/New_York');
  const date = Number(raw.format('D'));
  const day = Number(raw.format('d'));
  const year = Number(raw.format('YYYY'));
  const month = Number(raw.format('M'));
  const hours = Number(raw.format('H'));
  const minutes = Number(raw.format('m'));

  return {
    raw,
    date,
    day,
    year,
    month,
    hours,
    minutes,
  };
};
