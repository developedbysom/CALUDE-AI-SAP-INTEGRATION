// mcp-client.js
import { spawn } from 'child_process';
import readline from 'readline';
import axios from 'axios';

class MCPClient {
    constructor() {
        this.ollamaBaseUrl = 'http://localhost:11434';
        this.mcpServerProcess = null;
        this.messageId = 1;
        this.pendingRequests = new Map();
    }

    async start() {
        console.log('🚀 Starting MCP Client...');

        try {
            // Test Ollama connection first
            await this.testOllamaConnection();

            // Start MCP server
            await this.startMCPServer();

            // Initialize MCP
            await this.initializeMCP();

            // Start chat
            await this.startChat();

        } catch (error) {
            console.error('💥 Startup failed:', error.message);
            process.exit(1);
        }
    }

    async testOllamaConnection() {
        try {
            console.log('🔍 Testing Ollama connection...');
            const response = await axios.get(`${this.ollamaBaseUrl}/api/tags`, {
                timeout: 10000
            });

            const models = response.data.models || [];
            console.log('✅ Ollama is accessible');
            console.log('📋 Available models:', models.map(m => m.name).join(', '));

            return true;
        } catch (error) {
            throw new Error(`Cannot connect to Ollama: ${error.message}`);
        }
    }

    startMCPServer() {
        return new Promise((resolve, reject) => {
            console.log('🔧 Starting MCP Server...');

            this.mcpServerProcess = spawn('node', ['src/index.js'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle server errors
            this.mcpServerProcess.stderr.on('data', (data) => {
                console.error('MCP Server response:', data.toString());
            });

            // Setup response handler
            const rl = readline.createInterface({
                input: this.mcpServerProcess.stdout,
                terminal: false
            });

            rl.on('line', (line) => {
                try {
                    // console.log(`---> line ${line}`)
                    const response = JSON.parse(line);
                    const { id } = response;

                    if (this.pendingRequests.has(id)) {
                        const { resolve } = this.pendingRequests.get(id);
                        this.pendingRequests.delete(id);
                        resolve(response);
                    }
                } catch (error) {
                    console.error('Error parsing MCP response:', error);
                }
            });

            // Wait for server to be ready
            setTimeout(() => {
                console.log('✅ MCP Server started');
                resolve();
            }, 2000);
        });
    }

    sendMCPMessage(message) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            message.id = id;

            this.pendingRequests.set(id, { resolve, reject });
            // console.log(`----> ${Object.values(message)}`)
            this.mcpServerProcess.stdin.write(JSON.stringify(message) + '\n');

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('MCP request timeout'));
                }
            }, 30000);
        });
    }

    async initializeMCP() {
        const initMessage = {
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'mcp-llama-client',
                    version: '1.0.0'
                }
            }
        };

        // console.log('📤 Sending initialize message:', JSON.stringify(initMessage, null, 2));

        // const response = await this.sendMCPMessage(initMessage);
        // console.log('✅ MCP Initialized with server:', response.result.serverInfo.name);
        // return response;

        try {
            // Add a small delay to ensure server is ready
            // await new Promise(resolve => setTimeout(resolve, 1000));

            const response = await this.sendMCPMessage(initMessage);
            console.log('✅ MCP Initialize Success!');
            // console.log('📨 Server Response:', JSON.stringify(response, null, 2));

            if (response.result && response.result.serverInfo) {
                console.log('🎯 Connected to server:', response.result.serverInfo.name);
            }

            return response;
        } catch (error) {
            console.error('❌ MCP Initialize Failed:', error.message);

            // Additional debugging
            console.log('🔍 Checking server process state...');
            console.log('   Server process alive:', !this.mcpServerProcess.killed);
            console.log('   Server process exit code:', this.mcpServerProcess.exitCode);
            console.log('   Server process signal:', this.mcpServerProcess.signalCode);

            throw error;
        }
    }

    async getAvailableTools() {
        const message = {
            jsonrpc: '2.0',
            method: 'tools/list',
            id: this.messageId++
        };

        const response = await this.sendMCPMessage(message);
        return response.result.tools;
    }

    async callTool(name, arguments_) {
        const message = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name, arguments: arguments_ }
        };

        const response = await this.sendMCPMessage(message);
        // console.log('📨 Raw tool response:', JSON.stringify(response, null, 2));
        return response.result;
    }

    async queryLlama3(prompt, systemPrompt = null) {
        try {
            const requestData = {
                model: 'llama3', // Use whatever model name you have
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.1,
                }
            };

            if (systemPrompt) {
                requestData.system = systemPrompt;
            }

            console.log('🤖 Querying Llama...');

            const response = await axios.post(`${this.ollamaBaseUrl}/api/generate`, requestData, {
                timeout: 60000
            });

            return response.data.response;
        } catch (error) {
            throw new Error(`Llama query failed: ${error.message}`);
        }
    }

    extractJsonFromText(text) {
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('Could not parse JSON from response');
        }
        return null;
    }

    async startChat() {
        try {
            const tools = await this.getAvailableTools();
            console.log('🔧 Available tools:', tools.map(t => t.name));

            const systemPrompt = `You help users access SAP data. Available tools: ${JSON.stringify(tools.map(t => ({ name: t.name, description: t.description })))}. Respond with JSON: {"tool": "tool_name", "arguments": {"top":?, "skip":?}}`;

            console.log('\n🎯 MCP Client Ready! Ask about SAP data.');
            console.log('💬 Example: "show me product information or get some Sales Order for me"');
            console.log('⏹️  Type "quit" to exit\n');

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const askQuestion = () => {
                rl.question('You: ', async (userInput) => {
                    if (userInput.toLowerCase() === 'quit') {
                        console.log('👋 Goodbye!');
                        rl.close();
                        if (this.mcpServerProcess) {
                            this.mcpServerProcess.kill();
                        }
                        return;
                    }

                    try {
                        // Use Llama to select tool
                        const llmResponse = await this.queryLlama3(
                            `User query: ${userInput}. Choose the right tool and identify the arugments correctly and respond with JSON only.`,
                            systemPrompt
                        );

                        console.log('📨 LLM Response:', llmResponse);

                        const toolCall = this.extractJsonFromText(llmResponse);

                        if (toolCall && toolCall.tool) {
                            console.log(`🔧 Using tool: ${toolCall.tool}`);

                            // Call the MCP tool
                            const result = await this.callTool(toolCall.tool, toolCall.arguments || {});
                            const data = result.content[0].text;

                            console.log('\n✅ SAP Data:');
                            console.log(`${data}`);

                        } else {
                            console.log('❌ Could not determine tool to use.');
                        }

                    } catch (error) {
                        console.log('❌ Error:', error.message);
                    }

                    console.log();
                    askQuestion();
                });
            };

            askQuestion();

        } catch (error) {
            console.error('Failed to start chat:', error);
        }
    }
}

// Start the client
const client = new MCPClient();
client.start();
