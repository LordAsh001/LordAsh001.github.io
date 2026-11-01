# Community price agents (Market Atlas › Price agents tab)

Traders, farmers, extension workers and market reporters sign up, post prices from their own market and get:

- a public page: `https://shagbaor.com/market-atlas/#agent/<their-page-name>`
- a price card image (PNG) and a ready-to-paste caption for LinkedIn, Facebook, WhatsApp and X.

## How it works

- **Accounts and data** live in the Market Atlas's **own** Supabase project, separate from LARA and every other tool:
  tables `ma_agents`, `ma_posts`, `ma_prices`, `ma_ranges` and `ma_editors`. `schema.sql` creates them, with row-level
  security. It is safe to run again. The project's address and publishable key go in `config.js`; until they are filled
  in, the Price agents tab stays hidden and the price bot skips this source.
- **Publishing:** posts go live at once, labelled as community reports. A database check holds back any price that is
  outside the usual range for the item (`ma_ranges`) or far from other agents' prices in the last 60 days. Held prices
  appear only to the agent ("waiting for a check") and to the editor.
- **Editor:** any account listed in `ma_editors` (add one in the SQL editor:
  `insert into public.ma_editors (user_id) values ('<user id from Authentication > Users>');`). Signed in, it sees a **Review** button (approve or remove held prices), and on any
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
- `config.js`: the project's Supabase address and publishable key.
- `privacy.html`: the privacy notice for price agents.

## Changing the usual ranges

In Supabase › SQL editor, for example:

```sql
update public.ma_ranges set min_base = 150, max_base = 2000 where commodity = 'maize';  -- naira per kg
```
