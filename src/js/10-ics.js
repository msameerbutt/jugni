/* .ics export (spec §12): Phase 2 has no server to push a reminder before a
   cancellation deadline passes — so hand the dated items to the phone's own
   calendar, which already knows how to remind. */

const ICS = {
  pad(n) { return String(n).padStart(2, '0'); },

  /* All-day events use DATE values; timed events keep the source's own UTC
     offset by converting to UTC (Z), which is unambiguous everywhere. */
  dateValue(iso, allDay) {
    if (allDay) return iso.slice(0, 10).replace(/-/g, '');
    const d = new Date(iso);
    if (isNaN(d)) return iso.slice(0, 10).replace(/-/g, '');
    return d.getUTCFullYear() + ICS.pad(d.getUTCMonth() + 1) + ICS.pad(d.getUTCDate()) + 'T' +
           ICS.pad(d.getUTCHours()) + ICS.pad(d.getUTCMinutes()) + '00Z';
  },

  escape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  },

  /* RFC 5545 says fold lines at 75 octets; calendars are strict about it. */
  fold(line) {
    if (line.length <= 73) return line;
    const parts = [];
    let rest = line;
    while (rest.length > 73) { parts.push(rest.slice(0, 73)); rest = rest.slice(73); }
    parts.push(rest);
    return parts.join('\r\n ');
  },

  build(items, tripName) {
    const now = ICS.dateValue(new Date().toISOString(), false);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jugni//Trip//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + ICS.escape(tripName || 'Trip')
    ];

    items.forEach(function (it) {
      const allDay = !!it.allDay;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + it.id + '@jugni');
      lines.push('DTSTAMP:' + now);
      lines.push(allDay ? 'DTSTART;VALUE=DATE:' + ICS.dateValue(it.date, true)
                        : 'DTSTART:' + ICS.dateValue(it.date, false));
      if (it.end) {
        lines.push(allDay ? 'DTEND;VALUE=DATE:' + ICS.dateValue(it.end, true)
                          : 'DTEND:' + ICS.dateValue(it.end, false));
      }
      lines.push('SUMMARY:' + ICS.escape(it.title));
      if (it.ref) lines.push('DESCRIPTION:' + ICS.escape('Booking ref: ' + it.ref));
      /* A deadline without a reminder is just a date — alarm it. */
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY',
                 'DESCRIPTION:' + ICS.escape(it.title),
                 'TRIGGER:' + (it.kind === 'deadline' ? '-P1D' : '-PT3H'),
                 'END:VALARM');
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.map(ICS.fold).join('\r\n');
  },

  download(items, tripName, filename) {
    Files.save(ICS.build(items, tripName), filename || 'jugni-trip.ics', 'text/calendar');
  }
};

/* Saving a file from a page that has no server behind it. */
const Files = {
  save(text, filename, mime) {
    const blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  },

  pick(accept, onText) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.json,application/json';
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { onText(String(reader.result), file.name); };
      reader.readAsText(file);
    });
    input.click();
  }
};
