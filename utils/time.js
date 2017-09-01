export const hourToNumber = (hour, pm) => {
  if (hour === 12) {
    if (pm) {
      return hour;
    }

    return 0;
  }

  if (pm) {
    return hour + 12;
  }

  return hour;
};
