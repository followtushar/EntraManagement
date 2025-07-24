import { getDb } from '../config/database';
import { User, UserRole } from '../types';
import { logger } from '../utils/logger';

class UserService {
  async createUser(userData: Partial<User>): Promise<User> {
    const db = getDb();
    
    try {
      const query = `
        INSERT INTO users (id, email, name, role, tenant_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const values = [
        userData.id,
        userData.email,
        userData.name,
        userData.role || UserRole.VIEWER,
        userData.tenantId
      ];
      
      const result = await db.query(query, values);
      return this.mapDbUserToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const db = getDb();
    
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const db = getDb();
    
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const result = await db.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error getting user by email:', error);
      throw error;
    }
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | null> {
    const db = getDb();
    
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (userData.name) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(userData.name);
      }
      
      if (userData.role) {
        setClause.push(`role = $${paramIndex++}`);
        values.push(userData.role);
      }

      if (setClause.length === 0) {
        return this.getUserById(id);
      }

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `
        UPDATE users 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = getDb();
    
    try {
      const query = 'DELETE FROM users WHERE id = $1';
      const result = await db.query(query, [id]);
      
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  async getAllUsers(tenantId?: string): Promise<User[]> {
    const db = getDb();
    
    try {
      let query = 'SELECT * FROM users';
      const values = [];
      
      if (tenantId) {
        query += ' WHERE tenant_id = $1';
        values.push(tenantId);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await db.query(query, values);
      return result.rows.map(row => this.mapDbUserToUser(row));
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  async getUsersByRole(role: UserRole, tenantId?: string): Promise<User[]> {
    const db = getDb();
    
    try {
      let query = 'SELECT * FROM users WHERE role = $1';
      const values = [role];
      
      if (tenantId) {
        query += ' AND tenant_id = $2';
        values.push(tenantId);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await db.query(query, values);
      return result.rows.map(row => this.mapDbUserToUser(row));
    } catch (error) {
      logger.error('Error getting users by role:', error);
      throw error;
    }
  }

  private mapDbUserToUser(dbUser: any): User {
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      tenantId: dbUser.tenant_id,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at
    };
  }
}

export const userService = new UserService();