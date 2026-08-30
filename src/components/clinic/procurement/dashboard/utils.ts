export const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '—');

export const malaysiaDateTime = new Intl.DateTimeFormat('en-MY', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Kuala_Lumpur',
});

export const humanize = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());
