import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { logger } from '../utils/logger';
import { cacheService } from '../config/redis';

class MicrosoftGraphService {
  private msalInstance: ConfidentialClientApplication;
  private graphClient: Client | null = null;

  constructor() {
    this.msalInstance = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      },
    });
  }

  private async getAccessToken(): Promise<string> {
    try {
      const cacheKey = 'graph_access_token';
      const cachedToken = await cacheService.get(cacheKey);
      
      if (cachedToken) {
        return cachedToken;
      }

      const clientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default'],
      };

      const response = await this.msalInstance.acquireTokenSilent(clientCredentialRequest);
      const token = response.accessToken;

      // Cache token for 50 minutes (tokens expire in 60 minutes)
      await cacheService.set(cacheKey, token, 3000);
      
      return token;
    } catch (error) {
      logger.error('Failed to acquire access token:', error);
      throw error;
    }
  }

  private async getGraphClient(): Promise<Client> {
    if (!this.graphClient) {
      const accessToken = await this.getAccessToken();
      
      this.graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });
    }
    return this.graphClient;
  }

  // User Management
  async getUsers(filter?: string): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      let request = client.api('/users').select('id,displayName,userPrincipalName,mail,jobTitle');
      
      if (filter) {
        request = request.filter(filter);
      }

      const response = await request.get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get users:', error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<any> {
    try {
      const client = await this.getGraphClient();
      return await client.api(`/users/${userId}`).get();
    } catch (error) {
      logger.error(`Failed to get user ${userId}:`, error);
      throw error;
    }
  }

  // Conditional Access Policies
  async getConditionalAccessPolicies(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/identity/conditionalAccess/policies').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get conditional access policies:', error);
      throw error;
    }
  }

  async getConditionalAccessPolicy(policyId: string): Promise<any> {
    try {
      const client = await this.getGraphClient();
      return await client.api(`/identity/conditionalAccess/policies/${policyId}`).get();
    } catch (error) {
      logger.error(`Failed to get conditional access policy ${policyId}:`, error);
      throw error;
    }
  }

  // Security Defaults
  async getSecurityDefaults(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      return await client.api('/policies/identitySecurityDefaultsEnforcementPolicy').get();
    } catch (error) {
      logger.error('Failed to get security defaults:', error);
      throw error;
    }
  }

  // Password Policies
  async getPasswordPolicies(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/policies/authenticationMethodsPolicy').get();
      return response;
    } catch (error) {
      logger.error('Failed to get password policies:', error);
      throw error;
    }
  }

  // MFA Settings
  async getMfaSettings(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get MFA settings:', error);
      throw error;
    }
  }

  // Directory Settings
  async getDirectorySettings(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/settings').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get directory settings:', error);
      throw error;
    }
  }

  // Applications
  async getApplications(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/applications').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get applications:', error);
      throw error;
    }
  }

  // Service Principals
  async getServicePrincipals(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/servicePrincipals').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get service principals:', error);
      throw error;
    }
  }

  // Privileged Identity Management
  async getPrivilegedRoles(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/directoryRoles').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get privileged roles:', error);
      throw error;
    }
  }

  // Audit Logs
  async getAuditLogs(filter?: string): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      let request = client.api('/auditLogs/directoryAudits');
      
      if (filter) {
        request = request.filter(filter);
      }

      const response = await request.get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  // Sign-in Logs
  async getSignInLogs(filter?: string): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      let request = client.api('/auditLogs/signIns');
      
      if (filter) {
        request = request.filter(filter);
      }

      const response = await request.get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get sign-in logs:', error);
      throw error;
    }
  }

  // Named Locations
  async getNamedLocations(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/identity/conditionalAccess/namedLocations').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get named locations:', error);
      throw error;
    }
  }

  // Device Management
  async getDevices(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/devices').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get devices:', error);
      throw error;
    }
  }

  // Groups
  async getGroups(): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      const response = await client.api('/groups').get();
      return response.value || [];
    } catch (error) {
      logger.error('Failed to get groups:', error);
      throw error;
    }
  }

  // Compliance Manager Integration (if available)
  async getComplianceData(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      // This endpoint might not be available in all tenants
      const response = await client.api('/compliance').get();
      return response;
    } catch (error) {
      logger.warn('Compliance Manager data not available:', error);
      return null;
    }
  }
}

export const microsoftGraphService = new MicrosoftGraphService();