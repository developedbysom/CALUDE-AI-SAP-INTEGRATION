#!/usr/bin/env node

import { SAPService } from './services/sap-service.js';
import { SAPMCPServer } from './server/mcp-server.js';

async function main() {
  try {
    console.error('🚀 Starting SAP MCP Server...');
    
    // Initialize SAP service
    const sapService = new SAPService();
    
    // Test connection on startup
    const health = await sapService.healthCheck();
    console.error(`🏥 SAP Health: ${health.status} - ${health.message}`);
    
    // Initialize and start MCP server
    const mcpServer = new SAPMCPServer(sapService);
    await mcpServer.start();
    
  } catch (error) {
    console.error('❌ Failed to start SAP MCP Server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\n🛑 Shutting down SAP MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n🛑 SAP MCP Server terminated');
  process.exit(0);
});

// Start the application
main().catch(console.error);