import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

export class SAPMCPServer {
    constructor(sapService) {
        this.sapService = sapService;
        this.server = new McpServer({
            name: 'sap-mcp-server',
            version: '1.0.0'
        });

        this.setupErrorHandling();
        this.registerTools();
    }

    setupErrorHandling() {
        this.server.server.onerror = (error) => {
            console.error('MCP Server Error:', error);
        };
    }

    registerTools() {
        this.registerHealthTool();
        this.registerProductTools();
        this.registerSalesOrderTools();
    }

    registerHealthTool() {
        this.server.tool(
            'sap_health_check',
            {},
            async () => {
                try {
                    const health = await this.sapService.healthCheck();
                    return {
                        content: [{
                            type: 'text',
                            text: `SAP Health Check:\nStatus: ${health.status}\nMessage: ${health.message}`
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Health check failed: ${error.message}`
                        }]
                    };
                }
            }
        );
    }


    registerProductTools() {
        this.server.tool(
            'get_products',
            {
                top: z.number().min(1).max(100).default(10)
                    .describe('Number of records to fetch'),
                skip: z.number().min(0).default(0)
                    .describe('Number of records to skip (for pagination)'),
                search: z.string().optional()
                    .describe('Search in product description')
            },
            async ({ top, skip, search }) => {
                try {
                    const data = await this.sapService.getProducts(top, skip, search);
                    const products = data.d?.results || data.value || [];

                    if (products.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No products found matching your criteria.'
                            }]
                        };
                    }

                    const productList = products.map(product =>
                        `• ${product.ProductID} - ${product.Description || 'No description'} (${product.Category || 'N/A'})`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Products ${skip + 1} to ${skip + products.length}:\n\n${productList}\n\nTotal: ${products.length} products`
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error fetching products: ${error.message}`
                        }]
                    };
                }
            }
        );
    }

    registerSalesOrderTools() {
        this.server.tool(
            'get_sales_orders',
            {
                top: z.number().min(1).max(100).default(10)
                    .describe('Number of records to fetch'),
                skip: z.number().min(0).default(0)
                    .describe('Number of records to skip (for pagination)'),
                customerId: z.string().optional()
                    .describe('Filter by customer ID')
            },
            async ({ top, skip, customerId }) => {

                try {
                    const data = await this.sapService.get_sales_orders(top, skip, customerId);
                    const orders = data?.d?.results || data.value || [];

                    if (orders.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: 'No sales orders found matching your criteria.'
                            }]
                        };
                    }

                    const orderList = orders.map(order =>
                        `• ${order.SalesOrderID} - Customer: ${order.CustomerID} - Total: ${order.NetAmount || 'N/A'} ${order.CurrencyCode || ''}`
                    ).join('\n');

                    return {
                        content: [{
                            type: 'text',
                            text: `Sales Orders ${skip + 1} to ${skip + orders.length}:\n\n${orderList}\n\nTotal: ${orders.length} orders`
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error fetching sales orders: ${error.message}`
                        }]
                    };
                }
            }
        );
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('✅ SAP MCP Server running on stdio...');

        // List available tools for debugging
        const toolNames = [
            'sap_health_check',
            'get_products',
            'get_sales_orders'
        ];
        console.error(`📋 Available tools: ${toolNames.join(', ')}`);
    }

    getServer() {
        return this.server;
    }
}
