# Detecting bookable quotes from email

This describes the rules used to build the quote scheduler demo (`demo/quote-scheduler.html`), and what a real, always-on version of this would need.

## What counts as "ready to book"

A quote is ready to schedule once either of these turns up in the inbox:

1. **Invoice2go approval notification**
   Sent from `notifications.invoice2go.com`, subject line matches:
   `Estimate <QT#####> was approved`
   The notification body does **not** include the client's name — only the quote number. The client/job details have to be looked up in Invoice2go by quote number.

2. **Client reply naming a quote number**
   An email from a client (not from Invoice2go, not an internal forward) whose body contains a quote number matching `QT\d{5,}` alongside intent language — e.g. "go ahead", "happy to proceed", "accept", "please book us in". Quote number and intent phrase should appear in the same message to avoid false positives (e.g. a client asking a question that happens to reference an old quote number).

Quote numbers are consecutive from `QT10001`, which is what the demo uses to sort the list oldest-first.

## Regex used for extraction

```
Invoice2go approval subject: /Estimate\s+(QT\d{5,})\s+was approved/i
Quote number anywhere in body: /QT\d{5,}/g
Go-ahead intent (near a quote number): /(go\s*ahead|proceed|accept(ed)?|book (us|it) in|happy to)/i
```

## Current state (this demo)

The list in `demo/quote-scheduler.html` is populated by hand, from a one-off Gmail search over `fostersfencing.aus@gmail.com`. Only one real match exists there so far: `QT11019`, approved 12 Jul 2026. Everything else in the demo is fictional placeholder data, clearly labeled "Example".

Note: most day-to-day enquiry and reply traffic currently lands in `fostersfencing@hotmail.com.au`, a separate mailbox, and only reaches this Gmail account when manually forwarded. A real integration needs to watch whichever mailbox Invoice2go and clients actually reply to.

## What a real app version needs

To make this run unattended instead of being populated by hand:

- **Gmail access**: a Google Cloud project with the Gmail API enabled, OAuth consent screen, and a stored refresh token for the mailbox being watched (needs to be set up once in Google Cloud Console — this can't be done on the user's behalf).
- **A poll or push trigger**: either a scheduled job (e.g. every 15–60 min) calling `users.messages.list` with a query like `newer_than:1d (from:notifications.invoice2go.com OR -in:sent)`, or a Gmail push notification via Pub/Sub for near-real-time updates.
- **A small store** (even a spreadsheet or SQLite table) keyed by quote number, tracking: source email id, detected date, scheduled date/time (once picked), and calendar event id (once created) — so the same email doesn't produce a duplicate list entry or duplicate calendar event on the next poll.
- **Calendar write**: either keep the current "click to open a pre-filled Google Calendar event" pattern (no extra OAuth scope needed beyond the user having Calendar open in their browser), or add the `calendar.events` scope to create events directly — the user asked to keep the manual date-pick step for now rather than auto-creating events.
