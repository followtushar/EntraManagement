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