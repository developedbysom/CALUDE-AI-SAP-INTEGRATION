import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from 'zod';

import express from 'express';
import xsenv from '@sap/xsenv';
import axios from 'axios';
// import { randomUUID } from 'node:crypto';

const app = express();
const port = process.env.PORT || 3000;

// Middleware - CRITICAL
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

class BTPDestinationService {
    constructor() {
        this.destinationService = null;
        this.initializeServices();
    }

    initializeServices() {
        try {
            xsenv.loadEnv();
            this.destinationService = xsenv.getServices({
                destination: { tag: 'destination' }
            }).destination;
            console.error('✅ BTP Destination Service loaded');
        } catch (error) {
            console.error('❌ Service binding failed:', error.message);
        }
    }

    async getAccessToken() {
        if (!this.destinationService) {
            throw new Error('Destination service not available');
        }

        const response = await axios.post(
            `${this.destinationService.url}/oauth/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.destinationService.clientid,
                client_secret: this.destinationService.clientsecret,
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );
        return response.data.access_token;
    }

    async callDestination(destinationName, entity = '') {
        const token = await this.getAccessToken();

        console.error(`🔗 Calling destination: ${destinationName} with entity: ${entity}`);

        let destResponse
        try {
            destResponse = await axios.get(
                `${this.destinationService.uri}/destination-configuration/v1/destinations/${destinationName}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (error) {
            console.error('❌ Error fetching destination:', error);
        }

        // console.error('Destination response:', destResponse.data);
        const baseUrl = destResponse.data.destinationConfiguration.URL;
        const url = entity ? `${baseUrl}/${entity}` : baseUrl;

        console.error(`➡️ Calling destination URL: ${url}`);

        // Call the destination
        const serviceResponse = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.error('Service response received', serviceResponse.data);
        return serviceResponse.data;
    }
}

// Initialize MCP Server
const server = new McpServer({
    name: "btp-destination-mcp",
    version: "1.0.0"
});

// Initialize BTP Services
let btpService;
try {
    btpService = new BTPDestinationService();
} catch (error) {
    console.error('❌ Failed to initialize BTP services:', error.message);
}

// Register MCP Tools
server.tool(
    'list_destinations',
    'List all available BTP destinations',
    {},
    async () => {
        try {
            if (!btpService) {
                return {
                    content: [{
                        type: 'text',
                        text: '❌ BTP Destination Service not available. Check service binding.'
                    }]
                };
            }
            console.error('🔍 Listing destinations...');

            const token = await btpService.getAccessToken();
            console.error('🔑 Access token acquired');
            console.error(`🔗${btpService.destinationService.uri}`);
            const response = await axios.get(
                `${btpService.destinationService.uri}/destination-configuration/v1/subaccountDestinations`,
                { headers: { Authorization: `Bearer ${token}` } }
            );


            const destinations = response.data.map(dest => ({
                name: dest.Name,
                type: dest.Type,
                url: dest.URL
            }));

            return {
                content: [{
                    type: 'text',
                    text: `Available Destinations:\n${JSON.stringify(destinations, null, 2)}`
                }]
            };

        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Error listing destinations: ${error.message}`
                }]
            };
        }
    }
);

server.tool(
    'query_northwind',
    'Query Northwind service via BTP destination',
    {
        entity: z.enum(['Products', 'Customers', 'Orders', 'Categories', 'Suppliers']),
        top: z.number().min(1).max(100).default(5),
        skip: z.string().optional()
    },
    async ({ entity, top, skip }) => {
        // console.error(`🔍 Querying Northwind entity: ${entity} with top: ${top}`);
        try {
            if (!btpService) {
                throw new Error('BTP services not available');
            }

            const result = await btpService.callDestination('northwind', `${entity}?$top=${top}&$skip=${skip || 0}`);

            return {
                content: [{
                    type: 'text',
                    text: `Northwind ${entity} (first ${top}):\n${JSON.stringify(result, null, 2)}`
                }]
            };

        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Error querying Northwind: ${error.message}`
                }]
            };
        }
    }
);

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'BTP MCP HTTP Server',
        btp_connected: !!btpService,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'BTP MCP HTTP Server',
        status: 'running',
        endpoints: {
            health: '/health (GET)',
            mcp: '/mcp (POST)'
        },
        message: 'POST MCP JSON-RPC requests to /mcp endpoint'
    });
});


// Initialize MCP HTTP Transport - CORRECT WAY
console.error('🔄 Initializing StreamableHTTPServerTransport...');
let transport
try {
    transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });

    // Connect server to transport
    server.connect(transport).then(() => {
        console.error('✅ StreamableHTTPServerTransport connected at /mcp');

    }).catch(error => {
        console.error('❌ Failed to connect transport:', error);
    });
} catch (error) {
    console.error('❌ StreamableHTTPServerTransport initialization failed:', error);

}

app.post('/mcp', async (req, res) => {
    console.log('Received MCP request:', req.body);
    try {
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: error.message || 'Internal error',
                },
                id: null,
            });
        }
    }
});

// Start the server
app.listen(port, () => {
    console.error(`🚀 BTP MCP HTTP Server running on port ${port}`);
    console.error(`📍 Health: /health`);
    console.error(`📍 MCP: /mcp (POST)`);
    console.error(`📍 Debug: /mcp-debug (GET)`);
});
