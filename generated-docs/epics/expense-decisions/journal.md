# Journal — Approve or reject a request (`expense-decisions`)

What changed in this epic, in plain language.

## Story 1: Record a decision as the person who made it

- The app now has one safe way to record an approval or a rejection. The name attached to a decision is looked up from the person's own signed-in session on the server, so nobody can record a decision under someone else's name — even if they craft the request by hand. Only an Approver gets through; anyone else is refused before anything reaches the payments service.
- The general-purpose forwarding address the app uses for the payments service used to pass on whatever name the caller sent, which would have made the safeguard above pointless. It now refuses the two "decide" addresses outright — everything else it carries, including cancelling a file, still works exactly as before.
