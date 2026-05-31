#!/usr/bin/env python3

"""
Upstox NSE INDEX Historical Candle Downloader
=============================================

Features
--------
- Reads access token from:
    auth/upstox/auth.upstox.json

- Filters instruments from:
    data/instruments/upstox/upstox.json

    segment == "NSE_INDEX"
    instrument_type == "INDEX"

- Downloads candles using Upstox V3 API

- Automatically splits historical downloads
  into multiple requests based on API limits

- Stores protobuf binary files into:

    /root/storage/{instrument_key}/{timeframe}.pb

Examples:
---------
/root/storage/NSE_INDEX|Nifty 50/day.pb

Requirements
------------
pip install requests protobuf grpcio-tools

Generate protobuf:
------------------
python -m grpc_tools.protoc ^
  -I backend/src/main/proto ^
  --python_out=. ^
  backend/src/main/proto/warehouse.proto

This generates:
    warehouse_pb2.py
"""

import json
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

import warehouse_pb2


# ============================================================
# CONFIG
# ============================================================

AUTH_FILE = Path("auth/upstox/auth.upstox.json")
INSTRUMENTS_FILE = Path("data/instruments/upstox/upstox.json")

STORAGE_ROOT = Path("storage/candles/sector")
CONFIG_FILE = Path("storage/config/candle_config.json")

# ============================================================
# USER CONFIG
# ============================================================

# Rate limiting configuration: 2000 requests per 30 minutes PER TOKEN
MAX_REQUESTS_PER_30_MINS = 2000
SECONDS_IN_30_MINS = 30 * 60
REQUESTS_PER_SECOND = MAX_REQUESTS_PER_30_MINS / SECONDS_IN_30_MINS

# Request chunk years
#
# Upstox daily candle limit:
# 1 decade per request
#
# Safe chunk:
CHUNK_YEARS = 10

FETCH_CONFIGS = [
    {
        "timeframe": "day",
        "start_date": datetime(2000, 1, 1),
        "end_date": datetime(2021, 12, 31),
    },
    {
        "timeframe": "1m",
        "start_date": datetime(2022, 1, 1),
        "end_date": datetime.now(),
    }
]

# ============================================================
# API CONFIG
# ============================================================

BASE_URL = "https://api.upstox.com/v3/historical-candle"

REQUEST_TIMEOUT = 30
MAX_RETRIES = 3

# ============================================================
# TIMEFRAME CONFIG
# ============================================================

TIMEFRAME_CONFIG = {
    "1m": {
        "unit": "minutes",
        "interval": "1",
        "chunk_days": 28,
    },
    "5m": {
        "unit": "minutes",
        "interval": "5",
        "chunk_days": 28,
    },
    "15m": {
        "unit": "minutes",
        "interval": "15",
        "chunk_days": 28,
    },
    "1h": {
        "unit": "hours",
        "interval": "1",
        "chunk_days": 28,
    },
    "4h": {
        "unit": "hours",
        "interval": "4",
        "chunk_days": 28,
    },
    "day": {
        "unit": "days",
        "interval": "1",
        "chunk_days": CHUNK_YEARS * 365,
    },
    "week": {
        "unit": "weeks",
        "interval": "1",
        "chunk_days": 3650,
    },
    "month": {
        "unit": "months",
        "interval": "1",
        "chunk_days": 3650,
    },
}

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger(__name__)

# ============================================================
# RATE LIMITER
# ============================================================

# Delay between batches — each batch sends one request per token
REQUEST_DELAY = 1 / REQUESTS_PER_SECOND


# ============================================================
# CONFIG MANAGEMENT
# ============================================================

def load_candle_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_candle_config(config_data):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=4)


# ============================================================
# AUTH
# ============================================================

def load_all_access_tokens():
    """Load ALL access tokens from the auth file.

    Returns a list of valid access token strings.
    """

    with open(AUTH_FILE, "r", encoding="utf-8") as f:
        auth_data = json.load(f)

    accounts = auth_data.get("accounts", {})

    if not accounts:
        raise Exception("No accounts found")

    tokens = []

    for account_id, account in accounts.items():
        access_token = account.get("accessToken")
        if access_token:
            tokens.append(access_token)
        else:
            logger.warning(f"Account {account_id} has no accessToken, skipping")

    if not tokens:
        raise Exception("No valid access tokens found")

    logger.info(f"Loaded {len(tokens)} access tokens")

    return tokens


# ============================================================
# INSTRUMENT FILTER
# ============================================================

def load_index_instruments():

    with open(INSTRUMENTS_FILE, "r", encoding="utf-8") as f:
        instruments = json.load(f)

    filtered = []

    for instrument in instruments:

        if (
            instrument.get("segment") == "NSE_INDEX"
            and instrument.get("instrument_type") == "INDEX"
        ):

            filtered.append({
                "instrument_key": instrument.get("instrument_key"),
                "trading_symbol": instrument.get("trading_symbol"),
                "name": instrument.get("name"),
            })

    logger.info(f"Filtered NSE index instruments: {len(filtered)}")

    return filtered


# ============================================================
# DATE RANGE SPLITTER
# ============================================================

def split_date_ranges(
    start_date,
    end_date,
    chunk_days,
):

    ranges = []

    current_start = start_date

    while current_start < end_date:

        current_end = min(
            current_start + timedelta(days=chunk_days),
            end_date
        )

        ranges.append({
            "from_date": current_start.strftime("%Y-%m-%d"),
            "to_date": current_end.strftime("%Y-%m-%d"),
        })

        current_start = current_end + timedelta(days=1)

    return ranges


# ============================================================
# FETCH CANDLES
# ============================================================

def fetch_candle_chunk(
    access_token,
    instrument_key,
    timeframe,
    from_date,
    to_date,
):

    config = TIMEFRAME_CONFIG[timeframe]

    unit = config["unit"]
    interval = config["interval"]

    encoded_instrument = quote(
        instrument_key,
        safe=""
    )

    url = (
        f"{BASE_URL}/"
        f"{encoded_instrument}/"
        f"{unit}/"
        f"{interval}/"
        f"{to_date}/"
        f"{from_date}"
    )

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
    }

    for attempt in range(1, MAX_RETRIES + 1):

        try:

            response = requests.get(
                url,
                headers=headers,
                timeout=REQUEST_TIMEOUT,
            )

            if response.status_code == 200:

                payload = response.json()

                candles = payload.get(
                    "data",
                    {}
                ).get(
                    "candles",
                    []
                )

                return candles

            logger.error(
                f"[{instrument_key}] "
                f"HTTP {response.status_code} "
                f"{response.text}"
            )

            # Invalid request -> no retry
            if response.status_code == 400:
                return []

        except Exception as e:

            logger.exception(
                f"[{instrument_key}] "
                f"Request failed: {e}"
            )

        if attempt < MAX_RETRIES:
            time.sleep(2)

    return []


# ============================================================
# FETCH FULL HISTORY (MULTI-TOKEN PARALLEL)
# ============================================================

def fetch_full_history(
    access_tokens,
    instrument_key,
    timeframe,
    start_date,
    end_date,
):
    """Fetch candle history using all available tokens in parallel.

    Sends one request per token per rate-limit window (~1.12s),
    achieving N× throughput where N = number of tokens.
    """

    config = TIMEFRAME_CONFIG[timeframe]

    chunk_days = config["chunk_days"]

    ranges = split_date_ranges(
        start_date=start_date,
        end_date=end_date,
        chunk_days=chunk_days,
    )

    total_chunks = len(ranges)
    num_tokens = len(access_tokens)

    logger.info(
        f"[{instrument_key}] "
        f"Total chunks: {total_chunks}, "
        f"Tokens: {num_tokens}, "
        f"Batches: {(total_chunks + num_tokens - 1) // num_tokens}"
    )

    all_candles = []

    # Process chunks in batches of num_tokens
    for batch_start in range(0, total_chunks, num_tokens):

        batch = ranges[batch_start : batch_start + num_tokens]
        batch_num = (batch_start // num_tokens) + 1
        total_batches = (total_chunks + num_tokens - 1) // num_tokens

        logger.info(
            f"[{instrument_key}] "
            f"Batch {batch_num}/{total_batches} "
            f"({len(batch)} parallel requests)"
        )

        # Fire all requests in this batch concurrently
        with ThreadPoolExecutor(max_workers=num_tokens) as executor:

            futures = {}

            for i, date_range in enumerate(batch):
                token = access_tokens[i]
                chunk_idx = batch_start + i + 1

                logger.info(
                    f"[{instrument_key}] "
                    f"  Chunk {chunk_idx}/{total_chunks} "
                    f"{date_range['from_date']} "
                    f"-> "
                    f"{date_range['to_date']} "
                    f"(token #{i + 1})"
                )

                future = executor.submit(
                    fetch_candle_chunk,
                    access_token=token,
                    instrument_key=instrument_key,
                    timeframe=timeframe,
                    from_date=date_range["from_date"],
                    to_date=date_range["to_date"],
                )

                futures[future] = chunk_idx

            # Collect results
            for future in as_completed(futures):
                chunk_idx = futures[future]
                try:
                    candles = future.result()
                    if candles:
                        all_candles.extend(candles)
                except Exception as e:
                    logger.exception(
                        f"[{instrument_key}] "
                        f"Chunk {chunk_idx} failed: {e}"
                    )

        # Rate limit — wait before next batch
        if batch_start + num_tokens < total_chunks:
            time.sleep(REQUEST_DELAY)

    return all_candles





# ============================================================
# BUILD PROTOBUF
# ============================================================

def sanitize_filename(name: str) -> str:
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, "_")
    return name

def build_and_merge_proto_file(
    instrument_key,
    timeframe,
    new_candles,
):
    proto_file = warehouse_pb2.ProtoCandleFile()
    
    safe_instrument_key = sanitize_filename(instrument_key)
    file_path = STORAGE_ROOT / safe_instrument_key / f"{timeframe}.pb"
    
    if file_path.exists():
        with open(file_path, "rb") as f:
            proto_file.ParseFromString(f.read())
    else:
        proto_file.instrument_key = instrument_key
        proto_file.timeframe = timeframe
        
    proto_file.updated_at_epoch_millis = int(time.time() * 1000)

    seen = set([c.epoch_millis for c in proto_file.candles])

    # Upstox returns latest first
    new_candles = list(reversed(new_candles))

    for candle in new_candles:
        timestamp = candle[0]
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        epoch_millis = int(dt.timestamp() * 1000)

        # Deduplicate overlaps
        if epoch_millis in seen:
            continue

        seen.add(epoch_millis)

        proto_candle = proto_file.candles.add()
        proto_candle.epoch_millis = epoch_millis
        proto_candle.open = float(candle[1])
        proto_candle.high = float(candle[2])
        proto_candle.low = float(candle[3])
        proto_candle.close = float(candle[4])
        proto_candle.volume = float(candle[5])
        proto_candle.open_interest = float(candle[6])

    # Sort candles to ensure chronological order
    sorted_candles = sorted(proto_file.candles, key=lambda c: c.epoch_millis)
    del proto_file.candles[:]
    proto_file.candles.extend(sorted_candles)

    return proto_file


# ============================================================
# SAVE PROTOBUF
# ============================================================


def save_proto_file(
    instrument_key,
    timeframe,
    proto_file,
):

    safe_instrument_key = sanitize_filename(
        instrument_key
    )

    storage_dir = (
        STORAGE_ROOT /
        safe_instrument_key
    )

    storage_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_path = storage_dir / f"{timeframe}.pb"

    with open(file_path, "wb") as f:
        f.write(
            proto_file.SerializeToString()
        )

    logger.info(
        f"Saved protobuf: {file_path}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    logger.info("Loading access tokens...")
    access_tokens = load_all_access_tokens()

    logger.info("Loading instruments...")
    instruments = load_index_instruments()

    logger.info(f"Starting historical downloads with {len(FETCH_CONFIGS)} configurations")
    logger.info(f"Tokens: {len(access_tokens)}, Rate per token: {REQUESTS_PER_SECOND:.2f} req/s")
    logger.info(f"Effective throughput: ~{len(access_tokens) * REQUESTS_PER_SECOND:.2f} req/s")

    config_data = load_candle_config()

    for idx, instrument in enumerate(instruments, start=1):

        instrument_key = instrument["instrument_key"]
        trading_symbol = instrument["trading_symbol"]

        logger.info(f"[{idx}/{len(instruments)}] {trading_symbol}")

        if instrument_key not in config_data:
            config_data[instrument_key] = {}

        for fetch_conf in FETCH_CONFIGS:
            tf = fetch_conf["timeframe"]
            sd = fetch_conf["start_date"]
            ed = fetch_conf["end_date"]

            if tf not in config_data[instrument_key]:
                config_data[instrument_key][tf] = {
                    "start_date": None,
                    "end_date": None,
                    "completed": False
                }

            existing = config_data[instrument_key][tf]

            existing_start_str = existing.get("start_date")
            existing_end_str = existing.get("end_date")
            completed = existing.get("completed", False)

            fetch_start = sd
            fetch_end = ed

            # Already fully covered
            if (
                completed
                and existing_start_str
                and existing_end_str
            ):
                existing_start = datetime.strptime(existing_start_str, "%Y-%m-%d")
                existing_end = datetime.strptime(existing_end_str, "%Y-%m-%d")

                # Requested range fully inside stored range
                if (
                    fetch_start.date() >= existing_start.date()
                    and fetch_end.date() <= existing_end.date()
                ):
                    logger.info(
                        f"[{instrument_key}] "
                        f"{tf} already fully available in config. Skipping."
                    )
                    continue

                # Incremental forward fetch
                if fetch_end.date() > existing_end.date():
                    fetch_start = existing_end + timedelta(days=1)

                # Incremental backward fetch
                elif fetch_start.date() < existing_start.date():
                    fetch_end = existing_start - timedelta(days=1)

            if fetch_start > fetch_end:
                logger.info(f"[{instrument_key}] {tf} fetch_start > fetch_end. Skipping.")
                continue

            logger.info(f"[{instrument_key}] Fetching {tf} from {fetch_start.date()} to {fetch_end.date()}")

            candles = fetch_full_history(
                access_tokens=access_tokens,
                instrument_key=instrument_key,
                timeframe=tf,
                start_date=fetch_start,
                end_date=fetch_end,
            )

            if not candles:
                logger.warning(f"No candles fetched for {instrument_key} in {tf}")
                continue

            logger.info(f"[{instrument_key}] Total {tf} candles fetched: {len(candles)}")

            proto_file = build_and_merge_proto_file(
                instrument_key=instrument_key,
                timeframe=tf,
                new_candles=candles,
            )

            save_proto_file(
                instrument_key=instrument_key,
                timeframe=tf,
                proto_file=proto_file,
            )
            
            existing_start = existing.get("start_date")
            existing_end = existing.get("end_date")
            
            if existing_start:
                merged_start = min(
                    datetime.strptime(existing_start, "%Y-%m-%d").date(),
                    fetch_start.date()
                )
            else:
                merged_start = fetch_start.date()
            
            if existing_end:
                merged_end = max(
                    datetime.strptime(existing_end, "%Y-%m-%d").date(),
                    fetch_end.date()
                )
            else:
                merged_end = fetch_end.date()
            
            config_data[instrument_key][tf] = {
                "start_date": merged_start.strftime("%Y-%m-%d"),
                "end_date": merged_end.strftime("%Y-%m-%d"),
                "completed": True
            }

    save_candle_config(config_data)
    logger.info("Completed all downloads")


if __name__ == "__main__":
    main()