# Graph Report - VEGA_RRG  (2026-05-24)

## Corpus Check
- 94 files · ~21,527,604 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 915 nodes · 1493 edges · 93 communities (85 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_React Frontend UI|React Frontend UI]]
- [[_COMMUNITY_Data Fetcher Pipeline|Data Fetcher Pipeline]]
- [[_COMMUNITY_RRG Computation Service|RRG Computation Service]]
- [[_COMMUNITY_Script Copier Utility|Script Copier Utility]]
- [[_COMMUNITY_REST API Controller|REST API Controller]]
- [[_COMMUNITY_RRG Data Model|RRG Data Model]]
- [[_COMMUNITY_Spring Boot Application|Spring Boot Application]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]

## God Nodes (most connected - your core abstractions)
1. `start_date` - 57 edges
2. `end_date` - 57 edges
3. `start_date` - 56 edges
4. `end_date` - 56 edges
5. `completed` - 56 edges
6. `completed` - 48 edges
7. `accounts` - 23 edges
8. `compilerOptions` - 17 edges
9. `compilerOptions` - 16 edges
10. `useRrgStore` - 16 edges

## Surprising Connections (you probably didn't know these)
- `useViewportHandler()` --calls--> `useViewportStore`  [EXTRACTED]
  frontend/src/components/chart/RrgScene.tsx → frontend/src/stores/useViewportStore.ts
- `WatchlistSettingsModal()` --calls--> `useRrgStore`  [EXTRACTED]
  frontend/src/components/terminal/WatchlistSettingsModal.tsx → frontend/src/stores/useRrgStore.ts
- `App()` --calls--> `useAutoFetch()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useAutoFetch.ts
- `App()` --calls--> `useKeyboardShortcuts()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useKeyboardShortcuts.ts
- `useAutoFetch()` --calls--> `useRrgStore`  [EXTRACTED]
  frontend/src/hooks/useAutoFetch.ts → frontend/src/stores/useRrgStore.ts

## Communities (93 total, 8 thin omitted)

### Community 0 - "React Frontend UI"
Cohesion: 0.05
Nodes (55): RrgScene, MetricsPanel, RankingPanel, SortKey, RrgGraphProps, SidebarProps, cleanSectorName(), computeCurvature() (+47 more)

### Community 1 - "Data Fetcher Pipeline"
Cohesion: 0.23
Nodes (15): build_and_merge_proto_file(), build_proto_file(), fetch_candle_chunk(), fetch_full_history(), load_access_token(), load_all_access_tokens(), load_candle_config(), load_index_instruments() (+7 more)

### Community 2 - "RRG Computation Service"
Cohesion: 0.05
Nodes (19): DataNotFoundException, RrgController, build, RrgPoint, TrailPoint, getValue(), RuntimeException, CandleService (+11 more)

### Community 3 - "Script Copier Utility"
Cohesion: 0.31
Nodes (8): build_markdown(), collect_files(), lang_tag(), main(), r""" script-copier.py Recursively scans d:\VEGA\VEGA_AUTH\backend\src\main\jav, Recursively collect all script/source files, sorted by path., Return the markdown language tag for a file extension., Build the full markdown string with all file contents.

### Community 4 - "REST API Controller"
Cohesion: 0.02
Nodes (82): code:xml (// File: pom.xml), code:java (// File: src\main\java\com\vega\rrg\service\RrgService.java), code:java (// File: src\main\java\com\vega\rrg\service\RrgSnapshotCache), code:java (// File: src\main\java\com\vega\rrg\service\RrgWindowCalcula), code:java (// File: src\main\java\com\vega\rrg\service\SectorComputatio), code:java (// File: src\main\java\com\vega\rrg\service\SnapshotRefreshS), code:java (// File: src\main\java\com\vega\rrg\service\TimeframeAggrega), code:java (// File: src\main\java\com\vega\rrg\service\TimeframeParser.) (+74 more)

### Community 5 - "RRG Data Model"
Cohesion: 0.06
Nodes (45): useViewportHandler(), catmullRomPath(), trailOpacities(), trailWidths(), LabelRect, resolveScreenSpaceCollisions(), smartLabelPlacement(), computeDomain() (+37 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (39): accessToken, clientId, generatedTs, userId, validityTs, accessToken, clientId, generatedTs (+31 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (29): dependencies, axios, d3, html-to-image, react, react-dom, @types/d3, zustand (+21 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (3): RrgConfigController, RrgConfigurationService, RrgConfigValidator

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (25): camera, autoFitEnabled, fitPadding, maxZoom, minInteractionZoom, smoothInterpolation, interaction, hoverHighlight (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (16): completed, NSE_INDEX|Nifty Consumption, 1m, day, day, NSE_INDEX|Nifty Multi MQ 50, 1m, day (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (14): completed, 1m, NSE_INDEX|Nifty FPI 150, 1m, day, NSE_INDEX|Nifty MNC, 1m, day (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (14): end_date, NSE_INDEX|Nifty200 Alpha 30, 1m, day, day, NSE_INDEX|Nifty IPO, 1m, day (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (14): start_date, NSE_INDEX|Nifty500 LowVol50, 1m, day, day, NSE_INDEX|Nifty New Consump, 1m, day (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (13): NSE_INDEX|NIFTY CONSR DURBL, 1m, day, NSE_INDEX|Nifty EV, 1m, day, NSE_INDEX|Nifty FinSrv25 50, NSE_INDEX|Nifty InfraLog (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (12): end_date, NSE_INDEX|Nifty AQLV 30, 1m, day, NSE_INDEX|Nifty CoreHousing, 1m, NSE_INDEX|Nifty REITs Realty, 1m (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (12): start_date, NSE_INDEX|NIFTY50 EQL Wgt, 1m, day, NSE_INDEX|Nifty50 TR 2x Lev, 1m, NSE_INDEX|Nifty50 Value 20, 1m (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (11): timeframes, active, bookmarked, toggles, normalized, trailsEnabled, trailLengths, active (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.18
Nodes (10): accessToken, clientId, feedToken, generatedTs, refreshToken, validityTs, accounts, 1 (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.2
Nodes (9): accessToken, clientId, expiryTime, generatedTs, validityTs, accounts, 1, broker (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.2
Nodes (9): accessToken, clientId, generatedTs, lastAccessTime, validityTs, accounts, 1, broker (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (6): Backend, code:bash (cd backend), code:bash (cd frontend), Frontend, Layout, VEGA RRG

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (5): CameraSettings, InteractionSettings, OptimizationSettings, RenderingSettings, SettingsConfig

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (5): code:js (export default defineConfig([), code:js (// eslint.config.js), Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 10

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 11

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 12

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 13

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 14

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 15

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 16

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 17

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 18

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 19

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 1

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 20

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 21

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 22

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 2

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 3

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 4

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 5

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 6

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 7

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 8

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (6): accessToken, clientId, generatedTs, refreshToken, validityTs, 9

### Community 54 - "Community 54"
Cohesion: 0.4
Nodes (4): CommandBarConfig, Timeframes, Toggles, TrailLengths

### Community 55 - "Community 55"
Cohesion: 0.4
Nodes (4): updatedAt, version, watchlistOnlyResampling, watchlists

### Community 56 - "Community 56"
Cohesion: 0.5
Nodes (3): accounts, broker, generatedTs

### Community 57 - "Community 57"
Cohesion: 0.5
Nodes (3): SectorEntry, WatchlistConfig, WatchlistProfile

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (3): NSE_INDEX|India VIX, 1m, day

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NIFTY100 ESG, 1m, day

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty100 Liq 15, 1m, day

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NIFTY100 Qualty30, 1m, day

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty100ESGSecLdr, 1m, day

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty500 Flexicap, 1m, day

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty500 LMS Eql, 1m, day

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty500 Qlty50, 1m, day

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty 50, 1m, day

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty AQL 30, 1m, day

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Cement, 1m, day

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty GS 10Yr Cln, 1m, day

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty GS 8 13Yr, 1m, day

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty HighBeta 50, 1m, day

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Ind Defence, 1m, day

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NIFTY IND DIGITAL, 1m, day

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NIFTY INDIA MFG, 1m, day

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Internet, 1m, day

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty IT, 1m, day

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Low Vol 50, 1m, day

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty MidSmall 50 50, 1m, day

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Next 50, 1m, day

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NIFTY OIL AND GAS, 1m, day

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Pvt Bank, 1m, day

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Realty, 1m, day

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (3): NSE_INDEX|Nifty Top 10 EW, 1m, day

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (3): NSE_INDEX|NiftyM150Momntm50, 1m, day

## Knowledge Gaps
- **409 isolated node(s):** `broker`, `clientId`, `accessToken`, `refreshToken`, `feedToken` (+404 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `accounts` connect `Community 56` to `Community 32`, `Community 33`, `Community 34`, `Community 35`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 51`, `Community 52`, `Community 53`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `build` connect `RRG Computation Service` to `Community 13`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Load ALL access tokens from the auth file.      Returns a list of valid access`, `Fetch candle history using all available tokens in parallel.      Sends one re`, `r""" script-copier.py Recursively scans d:\VEGA\VEGA_AUTH\backend\src\main\jav` to the rest of the system?**
  _415 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React Frontend UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `RRG Computation Service` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `REST API Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `RRG Data Model` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._