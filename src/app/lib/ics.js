/* .ics export (spec §12): Phase 2 has no server to push a reminder before a
   cancellation deadline passes, so hand the dated items to the phone's own
   calendar, which already knows how to remind. */

const pad = (n) => String(n).padStart(2, '0');

/* All-day events use DATE values; timed events convert to UTC, which is
   unambiguous in every calendar client. */
function dateValue(iso, allDay) {
  if (allDay) return iso.slice(0, 10).replace(/-/g, '');
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0, 10).replace(/-/g, '');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T`
       + `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

const esc = (v) => String(v || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/* RFC 5545 folds at 75 octets and clients are strict about it. */
function fold(line) {
  if (line.length <= 73) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 73) { parts.push(rest.slice(0, 73)); rest = rest.slice(73); }
  parts.push(rest);
  return parts.join('\r\n ');
}

export function buildICS(items, tripName) {
  const now = dateValue(new Date().toISOString(), false);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jugni//Trip//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(tripName || 'Trip')}`,
  ];

  for (const it of items) {
    const allDay = !!it.allDay;
    lines.push('BEGIN:VEVENT', `UID:${it.id}@jugni`, `DTSTAMP:${now}`);
    lines.push(allDay ? `DTSTART;VALUE=DATE:${dateValue(it.date, true)}`
                      : `DTSTART:${dateValue(it.date, false)}`);
    if (it.end) {
      lines.push(allDay ? `DTEND;VALUE=DATE:${dateValue(it.end, true)}`
                        : `DTEND:${dateValue(it.end, false)}`);
    }
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.ref) lines.push(`DESCRIPTION:${esc(`Booking ref: ${it.ref}`)}`);
    /* A deadline with no reminder is just a date. */
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`,
               `TRIGGER:${it.kind === 'deadline' ? '-P1D' : '-PT3H'}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}
