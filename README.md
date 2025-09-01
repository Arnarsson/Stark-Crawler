# STARK Product Crawler Pipeline

A robust, compliant web crawler for collecting STARK building materials product data (SKU, EAN, prices) with automated scheduling via n8n.

## Features

- ✅ **Compliant Crawling**: Respects robots.txt, rate limiting
- 📊 **Comprehensive Data**: SKU, EAN, VVS numbers, prices, stock status
- 🔄 **Change Tracking**: Monitors price changes and new products
- 🤖 **Automation Ready**: n8n workflow for scheduled runs
- 📈 **Monitoring**: Slack/email alerts, crawl logs, statistics
- 🐳 **Docker Support**: Full containerization available
- 🔒 **Production Ready**: Error handling, retries, logging

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Test single product
npm run test

# Run full crawl
npm run crawl
```

## Project Structure

```
├── crawler/            # Main crawler implementation
├── workflows/          # n8n automation workflows
├── sql/               # Database schema
├── scripts/           # Utility scripts
├── docker/            # Containerization
├── docs/              # Documentation
└── exports/           # CSV exports
```

## Setup Guide

See [docs/SETUP.md](docs/SETUP.md) for detailed installation instructions.

## n8n Workflow

Import `workflows/stark-nightly.json` directly into n8n for automated daily crawling with notifications.

## Compliance

This crawler follows web scraping best practices and respects robots.txt. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md) for details.

## Tech Stack

- **Node.js 20+** - Runtime
- **Playwright** - Browser automation
- **Supabase/PostgreSQL** - Database
- **n8n** - Workflow automation
- **Docker** - Containerization

## License

MIT