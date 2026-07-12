# Fosters Fencing App

Tools for turning Invoice2go quote activity into scheduled jobs.

## Quote scheduler demo

`demo/quote-scheduler.html` — open it directly in a browser, no build step. It lists quotes that are ready to book (approved via Invoice2go, or a client email saying they want to go ahead with a specific quote number), lets you pick a date/time per job, and opens a pre-filled Google Calendar event to confirm.

This is a static demo: the quote list is hardcoded (one real entry pulled from the inbox, plus clearly-labeled example rows). See `docs/email-parsing-rules.md` for the detection rules it's based on and what's needed to make it read the inbox live.
