import express from 'express';
import jwt from 'jsonwebtoken';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../types';

const router = express.Router();

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
  },
};

const msalInstance = new ConfidentialClientApplication(msalConfig);

// Azure AD OAuth2 login endpoint
router.post('/login', asyncHandler(async (req, res) => {
  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    // Exchange authorization code for tokens
    const tokenRequest = {
      code,
      scopes: ['User.Read', 'Directory.Read.All'],
      redirectUri: process.env.AZURE_REDIRECT_URI!,
    };

    const response = await msalInstance.acquireTokenByCode(tokenRequest);
    
    if (!response.account) {
      return res.status(400).json({ error: 'Failed to get user account from token' });
    }

    const { homeAccountId, username, name, tenantId } = response.account;

    // Check if user exists in database
    let user = await userService.getUserByEmail(username);
    
    if (!user) {
      // Create new user
      user = await userService.createUser({
        id: homeAccountId,
        email: username,
        name: name || username,
        role: UserRole.VIEWER, // Default role
        tenantId: tenantId || process.env.AZURE_TENANT_ID!,
      });
      
      logger.info(`New user created: ${username}`);
    } else {
      logger.info(`User logged in: ${username}`);
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Store Azure tokens (optional, for future Graph API calls)
    // You might want to encrypt these before storing
    const tokens = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresOn: response.expiresOn,
    };

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        token: jwtToken,
        azureTokens: tokens, // Be careful with this in production
      },
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Get Azure AD login URL
router.get('/login-url', asyncHandler(async (req, res) => {
  try {
    const authCodeUrlParameters = {
      scopes: ['User.Read', 'Directory.Read.All'],
      redirectUri: process.env.AZURE_REDIRECT_URI!,
      state: req.query.state as string || 'default_state',
    };

    const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
    
    res.json({
      success: true,
      data: { authUrl }
    });

  } catch (error) {
    logger.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authentication URL' });
  }
}));

// Refresh token endpoint
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    // Use MSAL to refresh the token
    const refreshTokenRequest = {
      refreshToken,
      scopes: ['User.Read', 'Directory.Read.All'],
    };

    const response = await msalInstance.acquireTokenSilent(refreshTokenRequest);
    
    if (!response.account) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Get user from database
    const user = await userService.getUserByEmail(response.account.username);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new JWT token
    const jwtToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const tokens = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresOn: response.expiresOn,
    };

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        token: jwtToken,
        azureTokens: tokens,
      },
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
}));

// Logout endpoint
router.post('/logout', asyncHandler(async (req, res) => {
  // In a production app, you might want to:
  // 1. Invalidate the JWT token (add to blacklist)
  // 2. Clear any stored refresh tokens
  // 3. Call Azure AD logout endpoint
  
  try {
    // Generate logout URL for Azure AD
    const logoutUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.FRONTEND_URL || 'http://localhost:3000')}`;
    
    res.json({
      success: true,
      data: { logoutUrl },
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}));

// Verify token endpoint
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
    const user = await userService.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        valid: true
      }
    });

  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
    const user = await userService.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });

  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(401).json({ error: 'Failed to fetch profile' });
  }
}));

export default router;