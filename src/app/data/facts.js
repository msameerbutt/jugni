/* Country facts for the Destination screen. REST Countries is free and
   key-less; local time comes from the timezone the weather call already
   resolved, so it costs no extra request. */
import { get } from './net.js';

export async function country(name) {
  if (!name) return { data: null, at: null, state: 'never' };
  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`
    + '?fields=name,currencies,languages,capital,timezones,flag,idd';
  return get(`cty.${name.toLowerCase()}`, url, {
    pick: (j) => {
      const c = Array.isArray(j) ? j[0] : j;
      if (!c) return null;
      const cur = c.currencies ? Object.keys(c.currencies)[0] : '';
      return {
        name: c.name?.common,
        capital: c.capital?.[0] || '',
        languages: Object.values(c.languages || {}).join(', '),
        currency: cur ? cur + (c.currencies[cur].symbol ? ` (${c.currencies[cur].symbol})` : '') : '',
        timezone: c.timezones?.[0] || '',
        dialCode: c.idd?.root ? c.idd.root + (c.idd.suffixes?.[0] || '') : '',
      };
    },
  });
}

export function localTime(tz) {
  if (!tz) return '';
  try { return new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
