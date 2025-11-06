import { WebSocket, WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';

interface WebSocketClient extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<string>;
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocketClient> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocketClient) => {
      console.log('🔌 New WebSocket client connected');
      
      ws.isAlive = true;
      ws.subscriptions = new Set();
      this.clients.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('❌ WebSocket message parse error:', error);
        }
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString()
      });
    });

    // Setup heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          console.log('🔌 Terminating inactive client');
          ws.terminate();
          this.clients.delete(ws);
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('✅ WebSocket service initialized on /ws');
  }

  private handleMessage(ws: WebSocketClient, message: any) {
    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          ws.subscriptions.add(message.channel);
          console.log(`📡 Client subscribed to: ${message.channel}`);
          this.sendToClient(ws, {
            type: 'subscribed',
            channel: message.channel,
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          ws.subscriptions.delete(message.channel);
          console.log(`📡 Client unsubscribed from: ${message.channel}`);
        }
        break;

      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        console.log('⚠️ Unknown message type:', message.type);
    }
  }

  private sendToClient(client: WebSocketClient, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        console.error('❌ Error sending to client:', error);
      }
    }
  }

  broadcast(channel: string, data: any) {
    const message = {
      channel,
      data,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) || client.subscriptions.has('*')) {
        this.sendToClient(client, message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      console.log(`📡 Broadcast to ${sentCount} clients on channel: ${channel}`);
    }
  }

  notifyNewProduct(product: any) {
    this.broadcast('shopify:new-product', {
      type: 'new_product',
      product
    });
  }

  notifyProductUpdate(product: any) {
    this.broadcast('shopify:product-update', {
      type: 'product_update',
      product
    });
  }

  notifyPriceChange(change: any) {
    this.broadcast('shopify:price-change', {
      type: 'price_change',
      change
    });
  }

  notifyStockChange(change: any) {
    this.broadcast('shopify:stock-change', {
      type: 'stock_change',
      change
    });
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.clients.forEach((client) => {
      client.close(1000, 'Server shutting down');
    });

    if (this.wss) {
      this.wss.close();
    }

    console.log('🔌 WebSocket service shut down');
  }

  getStatus() {
    return {
      connected: this.clients.size,
      subscriptions: Array.from(this.clients).reduce((acc, client) => {
        return acc + client.subscriptions.size;
      }, 0)
    };
  }
}

export const webSocketService = new WebSocketService();
