/** Last instant of the current calendar day in an IANA time zone. Searching
 * for the date transition handles short/long DST days without a fixed offset. */
export function endOfLocalDay(now: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateKey = (time: number) => formatter.format(time);
  let low = now.getTime();
  if (!Number.isFinite(low)) throw new Error('Invalid current time');
  const today = dateKey(low);
  let high = low + 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateKey(middle) === today) low = middle;
    else high = middle;
  }
  return new Date(high - 1);
}
