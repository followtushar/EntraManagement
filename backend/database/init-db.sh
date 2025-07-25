#!/bin/bash

# Wait for SQL Server to start
echo "Waiting for SQL Server to start..."
sleep 30

# Create database and run schema
echo "Creating database and running schema..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P YourSecurePassword123! -Q "
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'entra_compliance')
BEGIN
    CREATE DATABASE entra_compliance;
END
"

# Run the schema script
echo "Running schema script..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P YourSecurePassword123! -d entra_compliance -i /var/opt/mssql/schema.sql

echo "Database initialization complete!"