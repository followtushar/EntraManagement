import sql from 'mssql';
import { logger } from '../utils/logger';

let pool: sql.ConnectionPool;

const config: sql.config = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_NAME || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: true, // Use encryption for Azure SQL Database
    trustServerCertificate: false, // Change to true for local dev / self-signed certs
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000,
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export const connectDatabase = async (): Promise<void> => {
  try {
    pool = new sql.ConnectionPool(config);
    await pool.connect();

    // Test the connection
    const result = await pool.request().query('SELECT GETDATE() as CurrentDateTime');
    logger.info('Database connection established successfully', {
      currentTime: result.recordset[0].CurrentDateTime,
      server: config.server,
      database: config.database
    });
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
};

export const getDb = (): sql.ConnectionPool => {
  if (!pool || !pool.connected) {
    throw new Error('Database not initialized or connection lost. Call connectDatabase() first.');
  }
  return pool;
};

export const closeDatabase = async (): Promise<void> => {
  if (pool && pool.connected) {
    await pool.close();
    logger.info('Database connection closed');
  }
};

// Helper function to execute queries with proper error handling
export const executeQuery = async <T = any>(query: string, params?: any): Promise<sql.IResult<T>> => {
  const db = getDb();
  const request = db.request();
  
  // Add parameters if provided
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value);
    });
  }
  
  try {
    const result = await request.query(query);
    return result;
  } catch (error) {
    logger.error('Database query error:', { query, params, error });
    throw error;
  }
};

// Helper function for prepared statements
export const executePreparedQuery = async <T = any>(
  query: string, 
  inputs: { [key: string]: { type: any; value: any } }
): Promise<sql.IResult<T>> => {
  const db = getDb();
  const ps = new sql.PreparedStatement(db);
  
  try {
    // Add input parameters
    Object.entries(inputs).forEach(([key, { type }]) => {
      ps.input(key, type);
    });
    
    await ps.prepare(query);
    
    const values: any = {};
    Object.entries(inputs).forEach(([key, { value }]) => {
      values[key] = value;
    });
    
    const result = await ps.execute(values);
    await ps.unprepare();
    
    return result;
  } catch (error) {
    logger.error('Prepared statement error:', { query, inputs, error });
    await ps.unprepare();
    throw error;
  }
};