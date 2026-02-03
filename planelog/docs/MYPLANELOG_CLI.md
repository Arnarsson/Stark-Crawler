# My Plane Log CLI

This CLI lets you authenticate with My Plane Log and manage your flights from the command line. It assumes a token-based API that uses a Bearer token. If the API differs (cookie auth, different endpoints), you can override the base URL and flights endpoint via environment variables.

## Install

From the repo root:

```bash
cd planelog
npm install
```

## Usage

```bash
node myplanelog-cli.js --help
```

### Save a token

```bash
node myplanelog-cli.js login --username you@example.com --token "PASTE_TOKEN"
```

### List flights

```bash
node myplanelog-cli.js flights list --username you@example.com --limit 50 --out pretty
```

### Add a flight

```bash
node myplanelog-cli.js flights add --username you@example.com --date 2026-02-02 --flight SK123
```

### Export

```bash
node myplanelog-cli.js export --username you@example.com --format csv --output flights.csv
```

## Configuration

The CLI stores profiles in:

```
~/.config/myplanelog-cli/config.json
```

You can override endpoints using environment variables:

```bash
export MPL_BASE_URL="https://myplanelog.co"
export MPL_FLIGHTS_PATH="/api/flights"
```

## Notes

- The default flights endpoint is `/api/flights`.
- If the API expects different JSON keys, adjust the payload in `myplanelog-cli.js`.
