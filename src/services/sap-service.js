import axios from 'axios';
import https from 'https';
import { Config } from '../utils/config.js';

export class SAPService {
  constructor() {
    Config.validate();
    this.config = Config.sap;
    this.axios = this.createAxiosClient();
  }

  createAxiosClient() {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // 👈 This ignores SSL certificate errors
      secureProtocol: 'TLSv1_2_method'
    });

    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      httpsAgent: httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      auth: {
        username: this.config.username,
        password: this.config.password
      }
    });

    // Add response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('SAP API Error:', error.response?.data || error.message);
        throw this.formatError(error);
      }
    );

    return client;
  }

  formatError(error) {
    const sapMessage = error.response?.data?.error?.message?.value;
    const status = error.response?.status;
    const statusText = error.response?.statusText;

    return new Error(
      sapMessage || `SAP API Error: ${status} ${statusText} - ${error.message}`
    );
  }

  // Product Operations
  async getProducts(top = 10, skip = 0, search = '') {
    console.error(`${this.config.productService}`)
    let url = `${this.config.productService}/ProductSet`;
    url += `?$top=${top}&$skip=${skip}&$format=json`;

    if (search) {
      url += `&$filter=contains(ProductDescription,'${search}')`;
    }

    console.error(`Calling SAP: ${url}`);
    const response = await this.axios.get(url);
    return response.data;
  }

  // Sales Order Operations
  //   async getSalesOrders(top = 10, skip = 0, customerId = '') {
  //     let url = `${this.config.salesService}/A_SalesOrder`;
  //     url += `?$top=${top}&$skip=${skip}&$format=json`;

  //     if (customerId) {
  //       url += `&$filter=SoldToParty eq '${customerId}'`;
  //     }

  //     console.error(`Calling SAP: ${url}`);
  //     const response = await this.axios.get(url);
  //     return response.data;
  //   }

  // Health check
  async healthCheck() {
    try {
      console.error(`${this.config.productService}`)
      const url = `${this.config.productService}/ProductSet?$top=1`;
      await this.axios.get(url);
      return { status: 'connected', message: 'Successfully connected to SAP' };
    } catch (error) {
      return { status: 'error', message: `SAP connection failed: ${error.message}` };
    }
  }
}