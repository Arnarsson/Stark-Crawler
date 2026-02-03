#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

import axios from 'axios';
import chalk from 'chalk';

defineEnv();

const DEFAULT_BASE_URL = 'https://myplanelog.co';
const DEFAULT_FLIGHTS_ENDPOINT = '/api/flights';

function defineEnv() {
  if (!process.env.MPL_BASE_URL) {
    process.env.MPL_BASE_URL = DEFAULT_BASE_URL;
  }
}

function printUsage() {
  console.log(`\n${chalk.bold('My Plane Log CLI')}\n`);
  console.log('Usage:');
  console.log('  myplanelog login --username <email> --token <token> [--base-url <url>]');
  console.log('  myplanelog logout --username <email>');
  console.log('  myplanelog flights list --username <email> [--limit 50] [--base-url <url>] [--out json|pretty]');
  console.log('  myplanelog flights add --username <email> --date YYYY-MM-DD --flight <number> [--base-url <url>]');
  console.log('  myplanelog export --username <email> --format csv|json [--limit 1000] [--output <path>]');
  console.log('Environment:');
  console.log('  MPL_BASE_URL      Default base URL (fallback when --base-url is omitted)');
  console.log('  MPL_FLIGHTS_PATH  Override flights endpoint (default /api/flights)');
  console.log('');
}

function readArgs(argv) {
  const args = [...argv];
  const flags = {};
  while (args.length > 0) {
    const token = args.shift();
    if (!token) break;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = args[0] && !args[0].startsWith('--') ? args.shift() : true;
      flags[key] = value;
    } else {
      if (!flags._) flags._ = [];
      flags._.push(token);
    }
  }
  return flags;
}

function configDir() {
  return path.join(os.homedir(), '.config', 'myplanelog-cli');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    return { profiles: {} };
  }
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function saveConfig(config) {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function storeProfile({ username, token, baseUrl }) {
  const config = loadConfig();
  config.profiles[username] = {
    token,
    baseUrl: baseUrl || config.profiles[username]?.baseUrl || DEFAULT_BASE_URL,
    updatedAt: new Date().toISOString(),
  };
  saveConfig(config);
}

function deleteProfile(username) {
  const config = loadConfig();
  if (!config.profiles[username]) {
    return false;
  }
  delete config.profiles[username];
  saveConfig(config);
  return true;
}

function requireProfile(username, baseUrlOverride) {
  const config = loadConfig();
  const profile = config.profiles[username];
  if (!profile) {
    console.error(chalk.red(`No saved profile for ${username}. Run: myplanelog login --username ${username} --token <token>`));
    process.exit(1);
  }
  return {
    username,
    token: profile.token,
    baseUrl: baseUrlOverride || profile.baseUrl || process.env.MPL_BASE_URL || DEFAULT_BASE_URL,
  };
}

function createClient(profile) {
  return axios.create({
    baseURL: profile.baseUrl,
    timeout: 30000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'myplanelog-cli/1.0',
      Authorization: `Bearer ${profile.token}`,
    },
  });
}

async function listFlights(profile, limit) {
  const client = createClient(profile);
  const endpoint = process.env.MPL_FLIGHTS_PATH || DEFAULT_FLIGHTS_ENDPOINT;
  const response = await client.get(endpoint, {
    params: { limit },
  });
  return response.data.flights || response.data;
}

async function addFlight(profile, date, flightNumber) {
  const client = createClient(profile);
  const endpoint = process.env.MPL_FLIGHTS_PATH || DEFAULT_FLIGHTS_ENDPOINT;
  const response = await client.post(endpoint, {
    date,
    flightNumber,
  });
  return response.data;
}

function formatCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header] ?? '';
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    });
    csvLines.push(values.join(','));
  }
  return csvLines.join('\n');
}

async function handleLogin(flags) {
  const username = flags.username;
  const token = flags.token;
  const baseUrl = flags['base-url'];
  if (!username || !token) {
    console.error(chalk.red('login requires --username and --token.'));
    printUsage();
    process.exit(1);
  }
  storeProfile({ username, token, baseUrl });
  console.log(chalk.green(`Saved token for ${username} in ${configPath()}`));
}

async function handleLogout(flags) {
  const username = flags.username;
  if (!username) {
    console.error(chalk.red('logout requires --username.'));
    printUsage();
    process.exit(1);
  }
  const removed = deleteProfile(username);
  if (removed) {
    console.log(chalk.green(`Removed profile for ${username}.`));
  } else {
    console.log(chalk.yellow(`No profile found for ${username}.`));
  }
}

async function handleFlightsList(flags) {
  const username = flags.username;
  const limit = Number(flags.limit || 50);
  const out = flags.out || 'json';
  const baseUrl = flags['base-url'];
  if (!username) {
    console.error(chalk.red('flights list requires --username.'));
    process.exit(1);
  }
  const profile = requireProfile(username, baseUrl);
  const flights = await listFlights(profile, limit);
  if (out === 'pretty') {
    console.log(JSON.stringify(flights, null, 2));
  } else {
    console.log(JSON.stringify(flights));
  }
}

async function handleFlightsAdd(flags) {
  const username = flags.username;
  const date = flags.date;
  const flightNumber = flags.flight;
  const baseUrl = flags['base-url'];
  if (!username || !date || !flightNumber) {
    console.error(chalk.red('flights add requires --username, --date, and --flight.'));
    process.exit(1);
  }
  const profile = requireProfile(username, baseUrl);
  const result = await addFlight(profile, date, flightNumber);
  console.log(JSON.stringify(result, null, 2));
}

async function handleExport(flags) {
  const username = flags.username;
  const format = flags.format;
  const limit = Number(flags.limit || 1000);
  const output = flags.output;
  const baseUrl = flags['base-url'];
  if (!username || !format) {
    console.error(chalk.red('export requires --username and --format csv|json.'));
    process.exit(1);
  }
  const profile = requireProfile(username, baseUrl);
  const flights = await listFlights(profile, limit);
  let payload = '';
  if (format === 'json') {
    payload = JSON.stringify(flights, null, 2);
  } else if (format === 'csv') {
    payload = formatCsv(flights);
  } else {
    console.error(chalk.red('Unsupported format. Use csv or json.'));
    process.exit(1);
  }
  if (output) {
    fs.writeFileSync(output, payload, 'utf8');
    console.log(chalk.green(`Exported ${format} to ${output}`));
  } else {
    console.log(payload);
  }
}

async function main() {
  const flags = readArgs(process.argv.slice(2));
  const [command, subcommand] = flags._ || [];

  if (!command) {
    printUsage();
    process.exit(0);
  }

  try {
    if (command === 'login') {
      await handleLogin(flags);
      return;
    }

    if (command === 'logout') {
      await handleLogout(flags);
      return;
    }

    if (command === 'flights' && subcommand === 'list') {
      await handleFlightsList(flags);
      return;
    }

    if (command === 'flights' && subcommand === 'add') {
      await handleFlightsAdd(flags);
      return;
    }

    if (command === 'export') {
      await handleExport(flags);
      return;
    }
  } catch (error) {
    const message = error?.response?.data ? JSON.stringify(error.response.data) : error?.message;
    console.error(chalk.red(`Request failed: ${message || error}`));
    process.exit(1);
  }

  console.error(chalk.red('Unknown command.'));
  printUsage();
  process.exit(1);
}

main();
