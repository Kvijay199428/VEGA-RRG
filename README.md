# VEGA RRG

Institutional-grade sector ingestion, ISIN resolution, Upstox historical warehousing, and backend-rendered RRG delivery.

## Layout

- `config/sectors.json`: sector universe and external source metadata
- `data/instruments/upstox/upstox.json`: preferred Upstox master instrument file
- `data/instrument/upstox/upstox.json`: legacy fallback location still supported by the backend
- `data/instruments/sector/*.csv`: downloaded Nifty sector constituent CSVs
- `data/instruments/.tmp/.sector.json`: sector CSV bootstrap status with `DONE` or `ERROR` plus error code
- `metadata/sectors.pb`: resolved sector metadata cache
- `metadata/sector_resolved.pb`: duplicated sector cache for fast startup reuse
- `metadata/mappings.pb`: resolved ISIN to instrument-key mappings
- `metadata/indexes.pb`: serialized instrument lookup indexes
- `storage/candles/<encoded-instrument-key>/*.pb`: protobuf candle warehouse

## Backend

From [backend/pom.xml](D:/VEGA/VEGA_RRG/backend/pom.xml):

```bash
cd backend
mvn spring-boot:run
```

Important endpoints:

- `GET /api/warehouse/status`
- `GET /api/sectors`
- `POST /api/sectors/sync?downloadCsvs=true&fetchCandles=true`
- `GET /api/rrg/snapshot`
- `GET /api/rrg/chart.svg`

Notes:

- The backend reads Upstox access tokens from [auth.upstox.json](D:/VEGA/VEGA_RRG/auth/upstox/auth.upstox.json).
- Candle storage uses encoded folder names because raw instrument keys contain `|`, which is invalid in Windows paths.
- Historical fetches are chunked to respect Upstox V3 retrieval limits before protobuf merge and dedupe.

## Frontend

From [frontend/package.json](D:/VEGA/VEGA_RRG/frontend/package.json):

```bash
cd frontend
npm install
npm run dev
```

The React client is intentionally thin and only consumes backend APIs plus the backend-rendered SVG chart.
