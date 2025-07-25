import { executeQuery } from '../config/database';
import { User, UserRole } from '../types';
import { logger } from '../utils/logger';
import sql from 'mssql';

class UserService {
  async createUser(userData: Partial<User>): Promise<User> {
    try {
      const query = `
        INSERT INTO users (id, email, name, role, tenant_id, preferences)
        VALUES (@id, @email, @name, @role, @tenantId, @preferences);
        
        SELECT * FROM users WHERE id = @id;
      `;
      
      const params = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role || UserRole.VIEWER,
        tenantId: userData.tenantId,
        preferences: JSON.stringify(userData.preferences || {})
      };
      
      const result = await executeQuery(query, params);
      return this.mapDbUserToUser(result.recordset[0]);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE id = @id';
      const result = await executeQuery(query, { id });
      
      if (result.recordset.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.recordset[0]);
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE email = @email';
      const result = await executeQuery(query, { email });
      
      if (result.recordset.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.recordset[0]);
    } catch (error) {
      logger.error('Error getting user by email:', error);
      throw error;
    }
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | null> {
    try {
      const updateFields: string[] = [];
      const params: any = { id };
      
      if (userData.email) {
        updateFields.push('email = @email');
        params.email = userData.email;
      }
      
      if (userData.name) {
        updateFields.push('name = @name');
        params.name = userData.name;
      }
      
      if (userData.role) {
        updateFields.push('role = @role');
        params.role = userData.role;
      }
      
      if (userData.preferences) {
        updateFields.push('preferences = @preferences');
        params.preferences = JSON.stringify(userData.preferences);
      }
      
      if (updateFields.length === 0) {
        return this.getUserById(id);
      }
      
      updateFields.push('updated_at = GETUTCDATE()');
      
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = @id;
        
        SELECT * FROM users WHERE id = @id;
      `;
      
      const result = await executeQuery(query, params);
      
      if (result.recordset.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.recordset[0]);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM users WHERE id = @id';
      const result = await executeQuery(query, { id });
      
      return result.rowsAffected && result.rowsAffected[0] > 0;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    role?: UserRole,
    tenantId?: string
  ): Promise<{ users: User[]; total: number }> {
    try {
      const offset = (page - 1) * limit;
      let whereClause = '';
      const params: any = { limit, offset };
      
      const conditions: string[] = [];
      
      if (role) {
        conditions.push('role = @role');
        params.role = role;
      }
      
      if (tenantId) {
        conditions.push('tenant_id = @tenantId');
        params.tenantId = tenantId;
      }
      
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      const countResult = await executeQuery(countQuery, params);
      const total = countResult.recordset[0].total;
      
      // Get paginated users
      const query = `
        SELECT * FROM users 
        ${whereClause}
        ORDER BY created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;
      
      const result = await executeQuery(query, params);
      const users = result.recordset.map(row => this.mapDbUserToUser(row));
      
      return { users, total };
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    try {
      const query = 'SELECT * FROM users WHERE tenant_id = @tenantId ORDER BY created_at DESC';
      const result = await executeQuery(query, { tenantId });
      
      return result.recordset.map(row => this.mapDbUserToUser(row));
    } catch (error) {
      logger.error('Error getting users by tenant:', error);
      throw error;
    }
  }

  async updateUserPreferences(id: string, preferences: any): Promise<User | null> {
    try {
      const query = `
        UPDATE users 
        SET preferences = @preferences, updated_at = GETUTCDATE()
        WHERE id = @id;
        
        SELECT * FROM users WHERE id = @id;
      `;
      
      const params = {
        id,
        preferences: JSON.stringify(preferences)
      };
      
      const result = await executeQuery(query, params);
      
      if (result.recordset.length === 0) {
        return null;
      }
      
      return this.mapDbUserToUser(result.recordset[0]);
    } catch (error) {
      logger.error('Error updating user preferences:', error);
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
      preferences: dbUser.preferences ? JSON.parse(dbUser.preferences) : {},
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at
    };
  }
}

export const userService = new UserService();