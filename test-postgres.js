import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '135.181.101.70',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '65LEOEDaSVDnvzbrIzzIBGY7937RmEFV'
});

console.log('Testing PostgreSQL connection...');

try {
  await client.connect();
  const res = await client.query('SELECT version()');
  console.log('✅ PostgreSQL connection successful!');
  console.log('Version:', res.rows[0].version);
  await client.end();
} catch (err) {
  console.error('❌ PostgreSQL connection failed:', err.message);
  process.exit(1);
}
