const NodeMediaServer = require('node-media-server');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const cron = require('node-cron');

const config = require('./config');
const logger = require('./utils/logger');
const multistreamService = require('./services/multistreamService');

class MultistreamServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.nms = null;
    this.activeConnections = new Set();
    
    this.setupExpress();
    this.setupWebSocket();
    this.setupRTMPServer();
    this.setupRoutes();
    this.setupHealthCheck();
  }

  setupExpress() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false // Disable for development, configure properly for production
    }));
    
    // CORS
    this.app.use(cors());
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Static files
    this.app.use(express.static(path.join(__dirname, '../public')));
    
    // Logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });
      next();
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket connection established', { ip: req.socket.remoteAddress });
      this.activeConnections.add(ws);
      
      // Send current stream status
      ws.send(JSON.stringify({
        type: 'streams',
        data: multistreamService.getAllActiveStreams()
      }));
      
      ws.on('close', () => {
        this.activeConnections.delete(ws);
        logger.info('WebSocket connection closed');
      });
      
      ws.on('error', (error) => {
        logger.error('WebSocket error', error);
        this.activeConnections.delete(ws);
      });
    });
    
    // Listen to multistream events and broadcast to clients
    multistreamService.on('streamStarted', (data) => {
      this.broadcastToClients({ type: 'streamStarted', data });
    });
    
    multistreamService.on('streamStopped', (data) => {
      this.broadcastToClients({ type: 'streamStopped', data });
    });
    
    multistreamService.on('streamError', (data) => {
      this.broadcastToClients({ type: 'streamError', data });
    });
  }

  setupRTMPServer() {
    const rtmpConfig = {
      rtmp: {
        port: config.rtmp.port,
        chunk_size: config.rtmp.chunk_size,
        gop_cache: config.rtmp.gop_cache,
        ping: config.rtmp.ping,
        ping_timeout: config.rtmp.ping_timeout
      },
      http: {
        port: parseInt(config.port) + 1000, // Use different port for media server HTTP
        mediaroot: config.http.mediaroot,
        allow_origin: '*'
      }
    };

    this.nms = new NodeMediaServer(rtmpConfig);
    
    // RTMP Events
    this.nms.on('preConnect', (id, args) => {
      logger.info('RTMP preConnect', { id, args });
    });

    this.nms.on('postConnect', (id, args) => {
      logger.info('RTMP postConnect', { id, args });
    });

    this.nms.on('prePublish', (id, StreamPath, args) => {
      logger.info('RTMP prePublish', { id, StreamPath, args });
      
      // Extract stream key from path
      const streamKey = StreamPath.split('/').pop();
      logger.streamInfo(streamKey, 'Stream publish started', { path: StreamPath });
    });

    this.nms.on('postPublish', (id, StreamPath, args) => {
      const streamKey = StreamPath.split('/').pop();
      logger.streamInfo(streamKey, 'Stream publish confirmed', { path: StreamPath });
      
      // Start multistreaming
      const inputPath = `rtmp://localhost:${config.rtmp.port}${StreamPath}`;
      
      // Add a small delay to ensure the stream is fully established
      setTimeout(() => {
        multistreamService.startMultistream(streamKey, inputPath)
          .then((result) => {
            logger.streamInfo(streamKey, 'Multistream started successfully', result);
          })
          .catch((error) => {
            logger.streamError(streamKey, 'Failed to start multistream', error);
          });
      }, 2000);
    });

    this.nms.on('donePublish', (id, StreamPath, args) => {
      const streamKey = StreamPath.split('/').pop();
      logger.streamInfo(streamKey, 'Stream publish ended', { path: StreamPath });
      
      // Stop multistreaming
      multistreamService.stopMultistream(streamKey);
    });

    this.nms.on('prePlay', (id, StreamPath, args) => {
      logger.info('RTMP prePlay', { id, StreamPath, args });
    });

    this.nms.on('postPlay', (id, StreamPath, args) => {
      logger.info('RTMP postPlay', { id, StreamPath, args });
    });

    this.nms.on('donePlay', (id, StreamPath, args) => {
      logger.info('RTMP donePlay', { id, StreamPath, args });
    });
  }

  setupRoutes() {
    // API Routes
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
      });
    });

    // Get all active streams
    this.app.get('/api/streams', (req, res) => {
      try {
        const streams = multistreamService.getAllActiveStreams();
        res.json({ success: true, data: streams });
      } catch (error) {
        logger.error('Error getting streams', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get specific stream status
    this.app.get('/api/streams/:streamId', (req, res) => {
      try {
        const { streamId } = req.params;
        const stream = multistreamService.getStreamStatus(streamId);
        
        if (!stream) {
          return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        
        res.json({ success: true, data: stream });
      } catch (error) {
        logger.error('Error getting stream status', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manually start multistream
    this.app.post('/api/streams/:streamId/start', (req, res) => {
      try {
        const { streamId } = req.params;
        const { inputPath, options = {} } = req.body;
        
        if (!inputPath) {
          return res.status(400).json({ success: false, error: 'Input path is required' });
        }
        
        multistreamService.startMultistream(streamId, inputPath, options)
          .then((result) => {
            res.json({ success: true, data: result });
          })
          .catch((error) => {
            res.status(400).json({ success: false, error: error.message });
          });
      } catch (error) {
        logger.error('Error starting stream', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop multistream
    this.app.post('/api/streams/:streamId/stop', (req, res) => {
      try {
        const { streamId } = req.params;
        const success = multistreamService.stopMultistream(streamId);
        
        if (success) {
          res.json({ success: true, message: 'Stream stopped successfully' });
        } else {
          res.status(404).json({ success: false, error: 'Stream not found' });
        }
      } catch (error) {
        logger.error('Error stopping stream', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get enabled platforms
    this.app.get('/api/platforms', (req, res) => {
      try {
        const platforms = multistreamService.getEnabledPlatforms();
        res.json({ success: true, data: platforms });
      } catch (error) {
        logger.error('Error getting platforms', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get server configuration (sanitized)
    this.app.get('/api/config', (req, res) => {
      try {
        const sanitizedConfig = {
          rtmpPort: config.rtmp.port,
          httpPort: config.http.port,
          maxConcurrentStreams: config.stream.maxConcurrentStreams,
          platforms: Object.keys(config.platforms).reduce((acc, key) => {
            acc[key] = {
              enabled: config.platforms[key].enabled,
              rtmpUrl: config.platforms[key].rtmpUrl
              // Don't expose stream keys
            };
            return acc;
          }, {})
        };
        res.json({ success: true, data: sanitizedConfig });
      } catch (error) {
        logger.error('Error getting config', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve the main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ success: false, error: 'Not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    });
  }

  setupHealthCheck() {
    // Run health check every 30 seconds
    cron.schedule('*/30 * * * * *', () => {
      multistreamService.performHealthCheck();
    });
  }

  broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    this.activeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          logger.error('Error sending WebSocket message', error);
          this.activeConnections.delete(ws);
        }
      }
    });
  }

  async start() {
    try {
      // Start RTMP server
      await new Promise((resolve, reject) => {
        this.nms.on('error', reject);
        this.nms.run();
        
        // Give it a moment to start
        setTimeout(resolve, 1000);
      });
      
      logger.info(`RTMP server started on port ${config.rtmp.port}`);

      // Start HTTP server
      await new Promise((resolve, reject) => {
        this.server.listen(config.port, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      logger.info(`HTTP server started on port ${config.port}`);
      logger.info('Multistream server is ready!');
      logger.info(`Dashboard: http://localhost:${config.port}`);
      logger.info(`RTMP endpoint: rtmp://localhost:${config.rtmp.port}/live/YOUR_STREAM_KEY`);
      
      const enabledPlatforms = multistreamService.getEnabledPlatforms();
      if (enabledPlatforms.length > 0) {
        logger.info(`Configured platforms: ${enabledPlatforms.map(p => p.name).join(', ')}`);
      } else {
        logger.warn('No platforms configured. Please set up your .env file with streaming credentials.');
      }

    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Shutting down multistream server...');
    
    // Stop all active streams
    const activeStreams = multistreamService.getAllActiveStreams();
    for (const stream of activeStreams) {
      multistreamService.stopMultistream(stream.streamId);
    }
    
    // Close WebSocket connections
    this.activeConnections.forEach(ws => {
      ws.close();
    });
    
    // Stop servers
    if (this.nms) {
      this.nms.stop();
    }
    
    this.server.close();
    
    logger.info('Server stopped');
  }
}

// Handle graceful shutdown
const server = new MultistreamServer();

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  server.start();
}

module.exports = MultistreamServer;