import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface DatabaseInterface {
  prepare(query: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...params: any[]): PreparedStatement;
  run(): { success: boolean; meta?: any };
  all(): { results: any[] };
}

class SqlitePreparedStatement implements PreparedStatement {
  constructor(
    private statement: Database.Statement,
    private params: any[] = []
  ) {}

  bind(...params: any[]): PreparedStatement {
    return new SqlitePreparedStatement(this.statement, params);
  }

  run(): { success: boolean; meta?: any } {
    try {
      const result = this.statement.run(...this.params);
      return { success: true, meta: result };
    } catch (error) {
      console.error('Database run error:', error);
      return { success: false };
    }
  }

  all(): { results: any[] } {
    try {
      const results = this.statement.all(...this.params);
      return { results };
    } catch (error) {
      console.error('Database all error:', error);
      return { results: [] };
    }
  }
}

export class SqliteDatabase implements DatabaseInterface {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase() {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS Messages (
        id TEXT PRIMARY KEY,
        groupId TEXT,
        timeStamp INTEGER NOT NULL,
        userName TEXT,
        content TEXT,
        messageId INTEGER,
        groupName TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_groupid_timestamp
        ON Messages(groupId, timeStamp DESC);
    `);
  }

  prepare(query: string): PreparedStatement {
    const statement = this.db.prepare(query);
    return new SqlitePreparedStatement(statement);
  }

  close() {
    this.db.close();
  }
}