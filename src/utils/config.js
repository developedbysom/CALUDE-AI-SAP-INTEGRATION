import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from absolute path
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

export class Config {
    static validate() {
        const required = ['SAP_BASE_URL', 'SAP_USERNAME', 'SAP_PASSWORD'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    }

    static get sap() {
        return {
            baseUrl: process.env.SAP_BASE_URL,
            username: process.env.SAP_USERNAME,
            password: process.env.SAP_PASSWORD,
            client: process.env.SAP_CLIENT || '100',
            productService: process.env.SAP_PRODUCT_SERVICE || '/sap/opu/odata/sap/API_PRODUCT_SRV',
        };
    }
}