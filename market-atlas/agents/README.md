# Community price agents (Market Atlas › Price agents tab)

Traders, farmers, extension workers and market reporters sign up, post prices from their own market and get:

- a public page: `https://shagbaor.com/market-atlas/#agent/<their-page-name>`
- a price card image (PNG) and a ready-to-paste caption for LinkedIn, Facebook, WhatsApp and X.

## How it works

- **Accounts and data** live in the Supabase project the site already uses for LARA (same sign-in), in separate tables:
  `ma_agents`, `ma_posts`, `ma_prices` and `ma_ranges`. `schema.sql` creates them, with row-level security. It is safe to run again.
- **Publishing:** posts go live at once, labelled as community reports. A database check holds back any price that is
  outside the usual range for the item (`ma_ranges`) or far from other agents' prices in the last 60 days. Held prices
  appear only to the agent ("waiting for a check") and to the editor.
- **Editor:** the LARA admin account. Signed in, it sees a **Review** button (approve or remove held prices), and on any
  agent's page can mark them **Trusted** (badge) or **Suspend** them (hides their page and posts).
- **Limits:** 10 posts a day per agent, 30 prices per post, prices from the last 30 days only. Agents can edit their profile and
  remove their posts, but can't change a posted price.
- **Into the atlas data:** the daily price bot (`bots/sources.py`, source `community_agents`) reads live prices from the last
  45 days with the public key and adds them to `prices-latest.json`, so they show in the Prices and Tracker tabs as
  "Community price agents" (low confidence). Items outside the atlas list ("Something else…") stay on the agent pages only.

## Files

- `agents.js`: the tab (feed, agent pages, sign-in, posting form, share card, review). Loaded after the main atlas script.
- `agents.css`: its styles.
- `schema.sql`: the database tables, checks and access rules.

## Changing the usual ranges

In Supabase › SQL editor, for example:

```sql
update public.ma_ranges set min_base = 150, max_base = 2000 where commodity = 'maize';  -- naira per kg
```
