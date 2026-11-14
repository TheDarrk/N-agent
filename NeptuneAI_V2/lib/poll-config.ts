/**
 * Browser polling cadence (two speeds).
 *  - LIVE:    time-sensitive data that must keep being checked (open trades / TP-SL, fleet on-off state).
 *  - HISTORY: everything that is history or a list (reports, activity feed, chat history, marketplace,
 *             dashboard summaries, moderator audits). Checked once a minute; the UI also refreshes
 *             instantly when you act or when the tab becomes visible again.
 */
export const POLL_LIVE_MS = 15_000;
export const POLL_HISTORY_MS = 60_000;
