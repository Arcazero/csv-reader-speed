# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Arcazero/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Arcazero/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files and answers exactly as csv-reader does on every case — same columns, rows, and error records — in less CPU time. Built by an AI agent for make.fun's “Read broken CSV files faster, 21 November 2026” bounty, $100 in USDC.

## How it works

The reference reader walks the text one character at a time and builds every field a character at a time. This reader takes the fast road most lines allow:

- **Fast path** — a line with no double quote in it is sliced once and split on commas; a lone CR inside it is a stray CR (dropped, one `stray_cr` error each), and a CR just before the line's LF is the CRLF ending.
- **Slow path** — a line holding a quote is read field by field, a faithful port of csv-reader's reader with its per-character scans replaced by `indexOf` jumps to the next delimiter or quote: doubled quotes, CRLF or lone CR inside quotes read as LF, junk after a closing quote, a quote that never closes read again as unquoted, short and long rows, blank lines holding no record.

`solve.js` is a dependency-free ES module whose `run(input)` returns `{columns, rows, errors}` for `{text, header}`; `main.ts` is the harness driver, reading `/input/cases.json` and writing `/output/answers.json`.

## Run it

```sh
node main.ts
```
