# 📱 Entra Management App

A comprehensive Microsoft Entra (Azure AD) compliance management application that helps organizations monitor, assess, and maintain compliance with various security frameworks including NIST SP 800-53, CIS Microsoft 365, ISO 27001, GDPR, and HIPAA.

## 🔧 Features

- **🔐 Azure AD Authentication**: Secure login with Microsoft Entra ID using OAuth2
- **📊 Compliance Dashboard**: Real-time compliance overview with metrics and trends
- **🎯 Framework Support**: Built-in support for major compliance frameworks
- **⚡ Automated Assessments**: Automated compliance checks via Microsoft Graph API
- **📋 Control Management**: Detailed control tracking with evidence collection
- **🔧 Remediation Guidance**: Step-by-step remediation instructions
- **📄 Report Generation**: PDF, Excel, CSV, and JSON report formats
- **📧 Notifications**: Email and Teams notifications for compliance alerts
- **🔍 Audit Logging**: Comprehensive audit trail for all activities
- **⚙️ Role-Based Access**: Admin, Compliance Officer, and Viewer roles

## 🏗️ Architecture

### Backend
- **Node.js** with TypeScript and Express
- **PostgreSQL** database for data persistence
- **Redis** for caching and session management
- **Microsoft Graph API** integration for Entra ID data
- **JWT** authentication with role-based access control

### Frontend
- **React 18** with TypeScript
- **TailwindCSS** for modern, responsive UI
- **Chart.js** for data visualization
- **React Query** for efficient data fetching
- **MSAL React** for Azure AD authentication

### Infrastructure
- **Azure App Service** for backend hosting
- **Azure Static Web Apps** for frontend hosting
- **Azure Database for PostgreSQL** for data storage
- **Azure Cache for Redis** for caching
- **Azure Application Insights** for monitoring
- **Azure Key Vault** for secrets management


<<<<<<< cursor/build-entra-compliance-management-app-with-github-actions-b411
## 🚀 Manual Deployment Guide

This comprehensive guide will walk you through deploying the Entra Management App step by step, avoiding common errors and pitfalls.

### Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Azure Subscription** with Global Administrator or Application Administrator role
- [ ] **Node.js 18+** installed locally (`node --version`)
- [ ] **Git** installed and configured
- [ ] **Azure CLI** installed (`az --version`)
- [ ] **PostgreSQL client** (psql) for database setup
- [ ] **Code editor** (VS Code recommended)

### Phase 1: Azure AD App Registration 🔐

#### Step 1.1: Create Azure AD App Registration

1. **Login to Azure Portal**:
   ```bash
   az login
   ```

2. **Navigate to Azure AD**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Search for "Azure Active Directory" → Click on it
   - Click "App registrations" in the left menu
   - Click "New registration"

3. **Configure App Registration**:
   ```
   Name: Entra Management App
   Supported account types: Accounts in this organizational directory only
   Redirect URI: 
   - Type: Web
   - URI: http://localhost:3000/auth/callback (for local testing)
   ```

4. **Save the following values** (you'll need them later):
   ```
   Application (client) ID: [COPY THIS]
   Directory (tenant) ID: [COPY THIS]
   ```

#### Step 1.2: Create Client Secret

1. **In your app registration**:
   - Click "Certificates & secrets" → "Client secrets" → "New client secret"
   - Description: `Entra Management App Secret`
   - Expires: `24 months` (recommended)
   - Click "Add"

2. **IMMEDIATELY copy the secret value** (it won't be shown again):
   ```
   Client Secret: [COPY THIS IMMEDIATELY]
   ```

#### Step 1.3: Configure API Permissions

1. **Click "API permissions"** → "Add a permission" → "Microsoft Graph" → "Application permissions"

2. **Add these permissions** (search and select each):
   ```
   Directory.Read.All
   User.Read.All
   Policy.Read.All
   AuditLog.Read.All
   Organization.Read.All
   Application.Read.All
   DeviceManagementConfiguration.Read.All
   DeviceManagementManagedDevices.Read.All
   SecurityEvents.Read.All
   ```

3. **Grant admin consent**:
   - Click "Grant admin consent for [Your Organization]"
   - Click "Yes" to confirm

#### Step 1.4: Configure Authentication

1. **Click "Authentication"**:
   - Under "Platform configurations" → "Add a platform" → "Web"
   - Add redirect URIs:
     ```
     http://localhost:3000/auth/callback
     https://your-frontend-domain.azurestaticapps.net/auth/callback
     ```
   - Check "Access tokens" and "ID tokens"
   - Click "Save"

### Phase 2: Azure Infrastructure Setup 🏗️

#### Step 2.1: Create Resource Group

```bash
# Set variables (replace with your values)
RESOURCE_GROUP="rg-entra-management"
LOCATION="East US"
APP_NAME="entra-management-app"

# Create resource group
az group create --name $RESOURCE_GROUP --location "$LOCATION"
```

#### Step 2.2: Create PostgreSQL Database

```bash
# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-db" \
  --location "$LOCATION" \
  --admin-user entraapiuser \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 14

# Configure firewall (allow Azure services)
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-db" \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Allow your local IP for setup (replace with your IP)
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-db" \
  --rule-name AllowLocalIP \
  --start-ip-address YOUR_LOCAL_IP \
  --end-ip-address YOUR_LOCAL_IP
```

#### Step 2.3: Create Redis Cache

```bash
# Create Redis cache
az redis create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-redis" \
  --location "$LOCATION" \
  --sku Basic \
  --vm-size c0
```

#### Step 2.4: Create App Service Plan and Web App

```bash
# Create App Service Plan
az appservice plan create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-plan" \
  --location "$LOCATION" \
  --sku B1 \
  --is-linux

# Create Web App for backend
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --name "${APP_NAME}-backend" \
  --runtime "NODE|18-lts"
```

#### Step 2.5: Create Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app "${APP_NAME}-insights" \
  --location "$LOCATION" \
  --resource-group $RESOURCE_GROUP \
  --application-type web
```

### Phase 3: Database Setup 💾

#### Step 3.1: Connect to PostgreSQL

```bash
# Get connection string
az postgres flexible-server show-connection-string \
  --server-name "${APP_NAME}-db" \
  --database-name postgres \
  --admin-user entraapiuser \
  --admin-password "YourSecurePassword123!"
```

#### Step 3.2: Create Database and Schema

1. **Connect using psql**:
   ```bash
   psql "host=${APP_NAME}-db.postgres.database.azure.com port=5432 dbname=postgres user=entraapiuser password=YourSecurePassword123! sslmode=require"
   ```

2. **Create database**:
   ```sql
   CREATE DATABASE entra_compliance;
   \c entra_compliance;
   ```

3. **Run the schema script** (copy from `backend/database/schema.sql`):
   ```sql
   -- Copy and paste the entire content of backend/database/schema.sql here
   -- This includes all table creations, indexes, and sample data
   ```

### Phase 4: Local Development Setup 💻

#### Step 4.1: Clone and Setup Repository

```bash
# Clone the repository
git clone https://github.com/followtushar/EntraManagement.git
cd EntraManagement

# Switch to the feature branch
git checkout cursor/build-entra-compliance-management-app-with-github-actions-b411

# Install dependencies
npm run install:all
```

#### Step 4.2: Configure Backend Environment

1. **Copy environment template**:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. **Edit `backend/.env`** with your values:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=5000
   API_VERSION=v1

   # Database Configuration
   DB_HOST=your-app-db.postgres.database.azure.com
   DB_PORT=5432
   DB_NAME=entra_compliance
   DB_USER=entraapiuser
   DB_PASSWORD=YourSecurePassword123!
   DB_SSL=true

   # Redis Configuration
   REDIS_HOST=your-app-redis.redis.cache.windows.net
   REDIS_PORT=6380
   REDIS_PASSWORD=your-redis-primary-key
   REDIS_TLS=true

   # Azure AD Configuration
   AZURE_CLIENT_ID=your-client-id-from-step-1
   AZURE_CLIENT_SECRET=your-client-secret-from-step-1
   AZURE_TENANT_ID=your-tenant-id-from-step-1

   # JWT Configuration
   JWT_SECRET=your-super-secure-jwt-secret-at-least-64-characters-long
   JWT_EXPIRES_IN=24h
   JWT_REFRESH_EXPIRES_IN=7d

   # Email Configuration (Optional - for notifications)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password

   # Application Insights
   APPINSIGHTS_INSTRUMENTATIONKEY=your-insights-key

   # Security
   CORS_ORIGIN=http://localhost:3000
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

#### Step 4.3: Configure Frontend Environment

1. **Copy environment template**:
   ```bash
   cp frontend/.env.example frontend/.env
   ```

2. **Edit `frontend/.env`**:
   ```env
   REACT_APP_API_BASE_URL=http://localhost:5000/api
   REACT_APP_AZURE_CLIENT_ID=your-client-id-from-step-1
   REACT_APP_AZURE_TENANT_ID=your-tenant-id-from-step-1
   REACT_APP_AZURE_REDIRECT_URI=http://localhost:3000/auth/callback
   REACT_APP_ENVIRONMENT=development
   ```

### Phase 5: Local Testing 🧪

#### Step 5.1: Start Backend

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not done already)
npm install

# Build TypeScript
npm run build

# Start development server
npm run dev
```

**Expected output**:
```
[timestamp] info: Database connected successfully
[timestamp] info: Redis connected successfully
[timestamp] info: Server running on port 5000
[timestamp] info: Scheduled jobs initialized
```

#### Step 5.2: Start Frontend

```bash
# In a new terminal, navigate to frontend
cd frontend

# Install dependencies (if not done already)
npm install

# Start development server
npm start
```

**Expected output**:
```
Compiled successfully!
Local:            http://localhost:3000
On Your Network:  http://192.168.x.x:3000
```

#### Step 5.3: Test the Application

1. **Open browser**: Navigate to `http://localhost:3000`
2. **Test login**: Click "Sign in with Microsoft"
3. **Verify backend**: Check `http://localhost:5000/api/health`

### Phase 6: Production Deployment 🚀

#### Step 6.1: Prepare Backend for Production

1. **Build the backend**:
   ```bash
   cd backend
   npm run build
   ```

2. **Create deployment package**:
   ```bash
   # Create a zip file with built code
   zip -r ../backend-deploy.zip . -x "node_modules/*" "src/*" "*.ts" ".env"
   ```

#### Step 6.2: Deploy Backend to Azure App Service

```bash
# Configure App Service settings
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-backend" \
  --settings \
    NODE_ENV=production \
    PORT=8000 \
    DB_HOST="${APP_NAME}-db.postgres.database.azure.com" \
    DB_PORT=5432 \
    DB_NAME=entra_compliance \
    DB_USER=entraapiuser \
    DB_PASSWORD="YourSecurePassword123!" \
    DB_SSL=true \
    REDIS_HOST="${APP_NAME}-redis.redis.cache.windows.net" \
    REDIS_PORT=6380 \
    REDIS_TLS=true \
    AZURE_CLIENT_ID="your-client-id" \
    AZURE_CLIENT_SECRET="your-client-secret" \
    AZURE_TENANT_ID="your-tenant-id" \
    JWT_SECRET="your-jwt-secret" \
    CORS_ORIGIN="https://your-frontend-url.azurestaticapps.net"

# Deploy the code
az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-backend" \
  --src backend-deploy.zip
```

#### Step 6.3: Deploy Frontend to Azure Static Web Apps

1. **Build the frontend**:
   ```bash
   cd frontend
   
   # Update environment for production
   echo "REACT_APP_API_BASE_URL=https://${APP_NAME}-backend.azurewebsites.net/api" > .env.production
   echo "REACT_APP_AZURE_CLIENT_ID=your-client-id" >> .env.production
   echo "REACT_APP_AZURE_TENANT_ID=your-tenant-id" >> .env.production
   echo "REACT_APP_AZURE_REDIRECT_URI=https://your-static-web-app-url/auth/callback" >> .env.production
   echo "REACT_APP_ENVIRONMENT=production" >> .env.production
   
   # Build for production
   npm run build
   ```

2. **Create Static Web App**:
   ```bash
   # Create Static Web App
   az staticwebapp create \
     --resource-group $RESOURCE_GROUP \
     --name "${APP_NAME}-frontend" \
     --source https://github.com/followtushar/EntraManagement \
     --location "East US 2" \
     --branch cursor/build-entra-compliance-management-app-with-github-actions-b411 \
     --app-location "/frontend" \
     --output-location "build"
   ```

### Phase 7: Final Configuration ⚙️

#### Step 7.1: Update Azure AD Redirect URIs

1. **Get your Static Web App URL**:
   ```bash
   az staticwebapp show \
     --resource-group $RESOURCE_GROUP \
     --name "${APP_NAME}-frontend" \
     --query "defaultHostname" -o tsv
   ```

2. **Update Azure AD App Registration**:
   - Go to Azure Portal → Azure AD → App registrations
   - Select your app → Authentication
   - Add the production redirect URI:
     ```
     https://your-static-web-app-url.azurestaticapps.net/auth/callback
     ```

#### Step 7.2: Configure CORS for Backend

```bash
# Allow your frontend domain
az webapp cors add \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-backend" \
  --allowed-origins "https://your-static-web-app-url.azurestaticapps.net"
```

#### Step 7.3: Test Production Deployment

1. **Visit your frontend URL**
2. **Test authentication flow**
3. **Verify API connectivity**
4. **Check Application Insights for logs**

### Phase 8: Monitoring and Maintenance 📊

#### Step 8.1: Set up Application Insights

```bash
# Get instrumentation key
az monitor app-insights component show \
  --app "${APP_NAME}-insights" \
  --resource-group $RESOURCE_GROUP \
  --query "instrumentationKey" -o tsv
```

#### Step 8.2: Configure Alerts

```bash
# Create alert for high error rate
az monitor metrics alert create \
  --resource-group $RESOURCE_GROUP \
  --name "High Error Rate Alert" \
  --scopes "/subscriptions/your-subscription-id/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Web/sites/${APP_NAME}-backend" \
  --condition "avg requests/failed > 10" \
  --window-size 5m \
  --evaluation-frequency 1m
```

### Troubleshooting Common Issues 🔧

#### Issue 1: Database Connection Errors

**Error**: `ECONNREFUSED` or `SSL connection required`

**Solution**:
```bash
# Check firewall rules
az postgres flexible-server firewall-rule list \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-db"

# Add your App Service IP to firewall
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-db" \
  --rule-name AllowAppService \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 255.255.255.255
```

#### Issue 2: Redis Connection Errors

**Error**: `Redis connection failed`

**Solution**:
```bash
# Get Redis access keys
az redis list-keys \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-redis"

# Verify Redis is running
az redis show \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-redis" \
  --query "provisioningState"
```

#### Issue 3: Azure AD Authentication Errors

**Error**: `AADSTS` errors or permission issues

**Solution**:
1. **Verify app permissions are granted**
2. **Check redirect URIs match exactly**
3. **Ensure client secret hasn't expired**
4. **Verify tenant ID is correct**

#### Issue 4: CORS Errors

**Error**: `Access to fetch blocked by CORS policy`

**Solution**:
```bash
# Update CORS settings
az webapp cors add \
  --resource-group $RESOURCE_GROUP \
  --name "${APP_NAME}-backend" \
  --allowed-origins "*"  # Only for testing, use specific domain in production
```

### Security Checklist ✅

Before going live, ensure:

- [ ] **Client secrets** are stored in Azure Key Vault
- [ ] **Database** has SSL enabled and proper firewall rules
- [ ] **Redis** has SSL enabled and access keys rotated
- [ ] **App Service** has HTTPS only enabled
- [ ] **CORS** is configured with specific origins (not *)
- [ ] **API permissions** follow principle of least privilege
- [ ] **Environment variables** don't contain secrets in plain text
- [ ] **Application Insights** is configured for monitoring
- [ ] **Backup strategy** is in place for database
- [ ] **Update process** is documented and tested

### Support and Resources 📚

- **Azure Documentation**: https://docs.microsoft.com/azure/
- **Microsoft Graph API**: https://docs.microsoft.com/graph/
- **Azure AD App Registration**: https://docs.microsoft.com/azure/active-directory/develop/
- **Application Insights**: https://docs.microsoft.com/azure/azure-monitor/app/

--
**🎉 Congratulations!** Your Entra Management App is now deployed and ready to help manage your organization's compliance posture!
=======
## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 7+
- Azure AD tenant with appropriate permissions
- Azure subscription (for deployment)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/entra-management-app.git
   cd entra-management-app
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configuration
   
   # Frontend
   cp frontend/.env.example frontend/.env.local
   # Edit frontend/.env.local with your configuration
   ```

4. **Set up the database**
   ```bash
   # Create PostgreSQL database
   createdb entra_management
   
   # Run database schema
   psql -d entra_management -f backend/database/schema.sql
   ```

5. **Start Redis**
   ```bash
   redis-server
   ```

6. **Start the development servers**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start individually
   npm run dev:backend  # Backend on http://localhost:3001
   npm run dev:frontend # Frontend on http://localhost:3000
   ```

### Azure AD App Registration

1. **Register a new application** in Azure AD:
   - Go to Azure Portal > Azure Active Directory > App registrations
   - Click "New registration"
   - Name: "Entra Management App"
   - Redirect URI: `http://localhost:3000/auth/callback` (for development)

2. **Configure API permissions**:
   - Microsoft Graph API:
     - `User.Read` (delegated)
     - `Directory.Read.All` (delegated)
     - `Policy.Read.All` (delegated)
     - `AuditLog.Read.All` (delegated)

3. **Create client secret**:
   - Go to "Certificates & secrets"
   - Create a new client secret
   - Copy the secret value to your `.env` file

4. **Update environment variables**:
   ```bash
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   ```

## 🚀 Deployment

### Azure Deployment (Automated)

The application includes automated deployment via GitHub Actions:

1. **Fork this repository**

2. **Set up GitHub Secrets**:
   ```
   AZURE_CREDENTIALS          # Service principal credentials
   AZURE_SUBSCRIPTION_ID      # Your Azure subscription ID
   AZURE_RESOURCE_GROUP       # Resource group name
   AZURE_CLIENT_ID           # Azure AD app client ID
   AZURE_CLIENT_SECRET       # Azure AD app client secret
   AZURE_TENANT_ID           # Azure AD tenant ID
   SQL_ADMIN_LOGIN           # Database admin username
   SQL_ADMIN_PASSWORD        # Database admin password
   FRONTEND_URL              # Frontend URL (after deployment)
   BACKEND_URL               # Backend URL (after deployment)
   ```

3. **Deploy infrastructure**:
   ```bash
   # The GitHub Action will automatically deploy when you push to main
   git push origin main
   ```

4. **Update Azure AD app registration**:
   - Add production redirect URIs
   - Update CORS settings if needed

### Manual Azure Deployment

1. **Deploy infrastructure**:
   ```bash
   az deployment group create \
     --resource-group your-resource-group \
     --template-file infrastructure/azure-resources.json \
     --parameters webAppName=entra-management-app \
                  sqlServerAdminLogin=your-admin \
                  sqlServerAdminPassword=your-password
   ```

2. **Deploy backend**:
   ```bash
   cd backend
   npm run build
   az webapp deployment source config-zip \
     --resource-group your-resource-group \
     --name entra-management-app-backend \
     --src dist.zip
   ```

3. **Deploy frontend**:
   ```bash
   cd frontend
   npm run build
   az staticwebapp deploy \
     --name entra-management-app-frontend \
     --source-location build
   ```

### Docker Deployment

1. **Build and run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

2. **Or build individual containers**:
   ```bash
   # Backend
   docker build -t entra-backend ./backend
   docker run -p 3001:3001 entra-backend
   
   # Frontend
   docker build -t entra-frontend ./frontend
   docker run -p 3000:3000 entra-frontend
   ```

## 📖 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - Azure AD login
- `GET /api/auth/login-url` - Get Azure AD login URL
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/verify` - Verify token
- `GET /api/auth/profile` - Get user profile

### Dashboard Endpoints
- `GET /api/dashboard/metrics` - Get dashboard metrics
- `GET /api/dashboard/compliance-summary` - Get compliance summary
- `GET /api/dashboard/recent-activity` - Get recent activity
- `GET /api/dashboard/alerts` - Get alerts and notifications

### Compliance Endpoints
- `POST /api/compliance/assess/:frameworkId` - Run compliance assessment
- `GET /api/compliance/assessments` - Get assessment results
- `GET /api/compliance/assessments/:assessmentId` - Get specific assessment
- `GET /api/compliance/status` - Get compliance status for all frameworks
- `GET /api/compliance/trends` - Get compliance trends
- `POST /api/compliance/assessments/:assessmentId/cancel` - Cancel assessment

### Controls Endpoints
- `GET /api/controls` - Get all controls with filtering
- `GET /api/controls/:controlId` - Get specific control details
- `PATCH /api/controls/:controlId/status` - Update control status
- `POST /api/controls/:controlId/evidence` - Add evidence to control
- `GET /api/controls/meta/categories` - Get control categories
- `GET /api/controls/meta/statistics` - Get control statistics

## 🔧 Configuration

### Environment Variables

#### Backend (.env)
```bash
# Application
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Security
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=24h

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://host:6379

# Azure AD
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Email
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
```

#### Frontend (.env.local)
```bash
REACT_APP_AZURE_CLIENT_ID=your-client-id
REACT_APP_AZURE_TENANT_ID=your-tenant-id
REACT_APP_REDIRECT_URI=http://localhost:3000/auth/callback
REACT_APP_API_URL=http://localhost:3001
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
```

### Frontend Tests
```bash
cd frontend
npm run test           # Run all tests
npm run test:coverage  # Run tests with coverage
```

### End-to-End Tests
```bash
npm run test:e2e       # Run Cypress tests
```

## 📊 Monitoring and Logging

### Application Insights
The application is configured to send telemetry to Azure Application Insights:
- Performance metrics
- Error tracking
- Custom events
- User analytics

### Logging
- **Winston** for structured logging
- Log levels: error, warn, info, debug
- Logs stored in files and Azure Application Insights

### Health Checks
- `GET /health` - Application health status
- Database connectivity check
- Redis connectivity check

## 🔒 Security

### Authentication & Authorization
- Azure AD OAuth2 integration
- JWT tokens with expiration
- Role-based access control (RBAC)
- Secure token storage

### Data Protection
- All data encrypted at rest and in transit
- Sensitive data stored in Azure Key Vault
- HTTPS enforcement
- CORS protection

### Security Headers
- Helmet.js for security headers
- Content Security Policy (CSP)
- Rate limiting
- Input validation and sanitization

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation
- Follow the existing code style
- Use meaningful commit messages

## 📋 Compliance Frameworks

### Supported Frameworks
- **NIST SP 800-53** (Rev 5) - Security and Privacy Controls
- **CIS Microsoft 365** (v1.4.0) - CIS Controls for Microsoft 365
- **ISO/IEC 27001** (2013) - Information Security Management
- **GDPR** (2018) - General Data Protection Regulation
- **HIPAA** (2013) - Health Insurance Portability and Accountability Act

### Adding Custom Frameworks
1. Create framework definition in database
2. Add controls with appropriate mappings
3. Implement automated checks in compliance service
4. Update frontend components

## 🐛 Troubleshooting

### Common Issues

**Database Connection Issues**
```bash
# Check PostgreSQL status
pg_isready -h localhost -p 5432

# Check connection string format
DATABASE_URL=postgresql://username:password@host:port/database
```

**Redis Connection Issues**
```bash
# Check Redis status
redis-cli ping

# Should return PONG
```

**Azure AD Authentication Issues**
- Verify app registration settings
- Check redirect URIs
- Ensure proper API permissions
- Validate client secret

**Build Issues**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear build cache
npm run clean
```

## 📞 Support

For support and questions:
- Create an issue in this repository
- Check the [Wiki](https://github.com/your-org/entra-management-app/wiki) for detailed documentation
- Review the [FAQ](https://github.com/your-org/entra-management-app/wiki/FAQ)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microsoft Graph API team for excellent documentation
- Azure team for comprehensive cloud services
- Open source community for amazing tools and libraries

---

**Made with ❤️ for better compliance management**
>>>>>>> main