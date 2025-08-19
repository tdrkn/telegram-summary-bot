import express from 'express';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { SqliteDatabase, DatabaseInterface } from './database';
import TelegramBot from '@codebam/cf-workers-telegram-bot';
import { botHandlers } from './bot-handlers';
import { scheduledTask } from './scheduled-task';

// Load environment variables
dotenv.config();

// Environment interface for compatibility with existing code
export interface Env {
  SECRET_TELEGRAM_API_TOKEN: string;
  GEMINI_API_KEY: string;
  account_id: string;
  DB: DatabaseInterface;
}

class Server {
  private app: express.Application;
  private env: Env;
  private database: SqliteDatabase;

  constructor() {
    this.app = express();
    this.app.use(express.json());

    // Initialize database
    const dbPath = process.env.DATABASE_PATH || './data/messages.sqlite';
    this.database = new SqliteDatabase(dbPath);

    // Create environment object
    this.env = {
      SECRET_TELEGRAM_API_TOKEN: process.env.SECRET_TELEGRAM_API_TOKEN || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      account_id: process.env.ACCOUNT_ID || 'local',
      DB: this.database
    };

    // Validate required environment variables
    if (!this.env.SECRET_TELEGRAM_API_TOKEN) {
      throw new Error('SECRET_TELEGRAM_API_TOKEN is required');
    }
    if (!this.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.setupRoutes();
    this.setupCronJobs();
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Webhook endpoint for Telegram
    this.app.post('/webhook', async (req, res) => {
      try {
        // Create a mock Request object compatible with the existing bot handler
        const request = new Request('https://dummy-url/webhook', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(req.body),
        });

        // Create a mock ExecutionContext
        const ctx = {
          waitUntil: (promise: Promise<any>) => {
            // In a real server, you might want to handle this differently
            promise.catch(console.error);
          },
          passThroughOnException: () => {},
        };

        // Use the existing bot handlers
        const response = await botHandlers(request, this.env, ctx);
        const text = await response.text();
        
        res.status(response.status).send(text);
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Manual trigger for scheduled task (for testing)
    this.app.post('/trigger-scheduled', async (req, res) => {
      try {
        const ctx = {
          waitUntil: (promise: Promise<any>) => {
            promise.catch(console.error);
          },
        };

        await scheduledTask(this.env, ctx);
        res.json({ status: 'Scheduled task executed' });
      } catch (error) {
        console.error('Scheduled task error:', error);
        res.status(500).json({ error: 'Scheduled task failed' });
      }
    });
  }

  private setupCronJobs() {
    // Default cron schedule: every 6 hours at 16:00 UTC (like original)
    // Converts to: 0 16 */6 * * (every 6 hours starting at 16:00)
    const cronSchedule = process.env.CRON_SCHEDULE || '0 16 */6 * *';
    
    cron.schedule(cronSchedule, async () => {
      console.log('Running scheduled task via cron...');
      try {
        const ctx = {
          waitUntil: (promise: Promise<any>) => {
            promise.catch(console.error);
          },
        };

        await scheduledTask(this.env, ctx);
        console.log('Scheduled task completed successfully');
      } catch (error) {
        console.error('Scheduled task error:', error);
      }
    });

    console.log(`Cron job scheduled with pattern: ${cronSchedule}`);
  }

  public async start() {
    const port = process.env.PORT || 3000;
    
    this.app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Webhook URL: http://localhost:${port}/webhook`);
      console.log(`Health check: http://localhost:${port}/health`);
      
      // Log environment info (without sensitive data)
      console.log('Environment configured:');
      console.log(`- Database path: ${process.env.DATABASE_PATH || './data/messages.sqlite'}`);
      console.log(`- Account ID: ${this.env.account_id}`);
      console.log(`- Telegram token: ${this.env.SECRET_TELEGRAM_API_TOKEN ? '***configured***' : 'NOT SET'}`);
      console.log(`- Gemini API key: ${this.env.GEMINI_API_KEY ? '***configured***' : 'NOT SET'}`);
    });
  }

  public async stop() {
    this.database.close();
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch(console.error);
}

export { Server };