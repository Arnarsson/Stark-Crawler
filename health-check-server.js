import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import pg from 'pg';
import chalk from 'chalk';

const { Client } = pg;

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.HEALTH_CHECK_PORT || 3001;

// Middleware
app.use(express.json());

// Main health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };
  
  try {
    // Check Supabase
    const supabaseHealth = await checkSupabase();
    health.services.supabase = supabaseHealth;
    
    // Check PostgreSQL (if configured for local)
    const pgHealth = await checkPostgres();
    if (pgHealth) {
      health.services.postgres = pgHealth;
    }
    
    // Determine overall health
    const critical = health.services.supabase.status === 'healthy';
    health.status = critical ? 'healthy' : 'degraded';
    
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    res.status(503).json(health);
  }
});

// Supabase health check
app.get('/health/supabase', async (req, res) => {
  const health = await checkSupabase();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// PostgreSQL health check
app.get('/health/postgres', async (req, res) => {
  const health = await checkPostgres();
  if (!health) {
    return res.status(404).json({ 
      status: 'not_configured',
      message: 'PostgreSQL not configured for direct access' 
    });
  }
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Crawler status endpoint
app.get('/status', async (req, res) => {
  try {
    const supabaseHealth = await checkSupabase();
    const productCount = await getProductCount();
    
    res.json({
      crawler: {
        name: 'STARK Crawler',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      },
      database: {
        connected: supabaseHealth.status === 'healthy',
        productCount: productCount,
        lastCheck: new Date().toISOString()
      },
      configuration: {
        concurrency: process.env.CRAWLER_CONCURRENCY || '2',
        headless: process.env.CRAWLER_HEADLESS || 'true',
        logLevel: process.env.LOG_LEVEL || 'info'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Statistics endpoint
app.get('/stats', async (req, res) => {
  try {
    const productCount = await getProductCount();
    const recentProducts = await getRecentProducts();
    
    res.json({
      products: {
        total: productCount,
        recent: recentProducts.length,
        lastUpdated: recentProducts[0]?.updated_at || null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe (for Kubernetes/Docker)
app.get('/ready', async (req, res) => {
  const supabaseHealth = await checkSupabase();
  if (supabaseHealth.status === 'healthy') {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

// Liveness probe (for Kubernetes/Docker)
app.get('/alive', (req, res) => {
  res.status(200).json({ alive: true });
});

// Helper functions
async function checkSupabase() {
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        },
        timeout: 5000
      }
    );
    
    return {
      status: 'healthy',
      responseTime: response.headers['x-response-time'] || 'N/A',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function checkPostgres() {
  if (!process.env.DB_HOST || process.env.DB_HOST === 'localhost') {
    return null; // PostgreSQL not configured for direct access
  }
  
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD_DIRECT || process.env.DB_PASSWORD
  });
  
  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    await client.end();
    
    return {
      status: 'healthy',
      serverTime: res.rows[0].now,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function getProductCount() {
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?select=id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    
    return parseInt(response.headers['content-range']?.split('/')[1] || '0');
  } catch (error) {
    console.error('Error getting product count:', error.message);
    return 0;
  }
}

async function getRecentProducts() {
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?limit=10&order=updated_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );
    
    return response.data || [];
  } catch (error) {
    console.error('Error getting recent products:', error.message);
    return [];
  }
}

// Start server
app.listen(PORT, () => {
  console.log(chalk.green.bold(`\n🏥 Health Check Server running on port ${PORT}`));
  console.log(chalk.gray('=' .repeat(50)));
  console.log(chalk.cyan('Available endpoints:'));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/health       - Overall health`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/health/supabase - Supabase health`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/health/postgres - PostgreSQL health`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/status       - Crawler status`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/stats        - Product statistics`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/ready        - Readiness probe`));
  console.log(chalk.gray(`  GET http://localhost:${PORT}/alive        - Liveness probe`));
  console.log(chalk.gray('=' .repeat(50)));
  console.log(chalk.blue('Press Ctrl+C to stop the server\n'));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  SIGTERM received, shutting down gracefully...'));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  SIGINT received, shutting down...'));
  process.exit(0);
});