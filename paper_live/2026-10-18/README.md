# Paper-live run, 18 Oct 2026 (Robinhood Chain, no real money)

Started 07:03 UTC with $100, stopped 2026-10-18T13:08:23Z. Public + Goldsky RPC, MAX_FEE=10000 (pool fee <= 1%).
From 12:53 UTC (block 91783631) the bot ran the rhc-trader binary with quarter Kelly at once (KELLY_SEED =
backtest's last 100 trades); before that the backtested schedule (2%, then 9.4%).

| | |
|---|---|
| equity (market) | $127.80 |
| equity (at cost) | $127.81 |
| closed trades | 32 (24 wins) |
| open positions | 4 |
| max drawdown | 2.0% |

Notes
- The old rhc-live binary stored ~2-3% of chain events twice (public RPC nodes answer outside the requested range);
  the restart at 12:53 replayed the history without duplicates, so numbers before and after are not comparable.
- Counterfactual (same data and ML decisions, full simulation): quarter Kelly from the start gave $154 at cost
  ($185 at market, 10 trades, max DD 13.9%) vs $121 with the backtested schedule.
- `paper/`: bot state, trades, decisions, events, store (swaps/liquidity/pools), settings (RPC keys removed).
- `shadow_exec/`: simulated execution of the new live system (closed.jsonl: real_ret vs model_ret per trade).

