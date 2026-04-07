# Hydration Browser Matrix Results

Date:
Commit:
Runner:

## Matrix

| Engine | Runtime | Event options support | Notes |
|---|---|---|---|
| Chromium | Puppeteer/Playwright | | |
| Firefox | Playwright | | |
| WebKit | Playwright | | |

## Semantic Checks

| Case | Chromium | Firefox | WebKit | Notes |
|---|---|---|---|---|
| delegate attach/dispose | | | | |
| native attach/dispose | | | | |
| capture/passive/once | | | | |
| fallback to capture boolean | | | | |
| dedupe by options dimension | | | | |

## Performance Snapshot

| Scale | attach ms | dispose ms | attached | deduped | skipped |
|---:|---:|---:|---:|---:|---:|
| 100 | | | | | |
| 500 | | | | | |
| 1000 | | | | | |

## Risks / Follow-ups

- Cross-engine inconsistencies:
- Real page A/B validation candidates:
- Next optimization target:
