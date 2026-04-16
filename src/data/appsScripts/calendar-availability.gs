/**
 * ZENKI DOJO — CALENDAR AVAILABILITY APPS SCRIPT
 *
 * PURPOSE
 *   Receives a date from the app and returns the busy intervals on the
 *   owner's Google Calendar for that day. The app uses this to disable
 *   time slots that conflict with existing events.
 *
 * SETUP (one-time)
 *   1. Go to https://script.google.com/ and sign in as the dojo owner
 *      (the account whose calendar should be used).
 *   2. Click "New Project" and paste this entire file.
 *   3. Click "Deploy" → "New deployment".
 *      - Type: "Web app"
 *      - Execute as: "Me (your@email)"
 *      - Who has access: "Anyone"
 *   4. Authorize access to your calendar when prompted.
 *   5. Copy the deployed Web app URL.
 *   6. Paste it into CALENDAR_AVAILABILITY_URL in
 *      src/services/calendarAvailability.ts.
 *
 * The script reads from your PRIMARY calendar. To use a different
 * calendar, change getDefaultCalendar() below to
 * CalendarApp.getCalendarById('calendar-id@group.calendar.google.com').
 */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const dateStr = body.date; // YYYY-MM-DD

    if (!dateStr) {
      return _json({ error: 'Missing date' }, 400);
    }

    // Start + end of day in the script's timezone (set to America/Los_Angeles in File → Project Settings)
    const [y, m, d] = dateStr.split('-').map(Number);
    const startOfDay = new Date(y, m - 1, d, 0, 0, 0);
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59);

    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(startOfDay, endOfDay);

    const busy = events
      .filter(function (ev) {
        // Skip all-day events and events the user has declined
        return !ev.isAllDayEvent() && ev.getMyStatus() !== CalendarApp.GuestStatus.NO;
      })
      .map(function (ev) {
        return {
          start: ev.getStartTime().toISOString(),
          end: ev.getEndTime().toISOString(),
          title: ev.getTitle(),
        };
      });

    return _json({ busy: busy });
  } catch (err) {
    return _json({ error: err.message || 'Unknown error' }, 500);
  }
}

function doGet() {
  return _json({ status: 'ok', usage: 'POST a JSON body with { "date": "YYYY-MM-DD" }' });
}

function _json(obj, status) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
