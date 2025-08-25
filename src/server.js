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
const SocialMediaManager = require('./services/socialMedia/socialMediaManager');
const RasaChatbotService = require('./services/chatbot/rasaChatbotService');

class MultistreamServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.nms = null;
    this.activeConnections = new Set();
    
    // Initialize social media manager and chatbot
    this.socialMediaManager = new SocialMediaManager(config);
    this.chatbotService = new RasaChatbotService({
      rasaApiUrl: process.env.RASA_API_URL,
      confidenceThreshold: process.env.CHATBOT_CONFIDENCE_THRESHOLD,
      fallbackMessage: process.env.CHATBOT_FALLBACK_MESSAGE
    });
    
    this.setupExpress();
    this.setupWebSocket();
    this.setupRTMPServer();
    this.setupRoutes();
    this.setupHealthCheck();
    this.setupChatbotIntegration();
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
    
    // Listen to social media events
    this.socialMediaManager.on('chatMessage', (data) => {
      this.broadcastToClients({ type: 'chatMessage', data });
    });
    
    this.socialMediaManager.on('platformConnected', (data) => {
      this.broadcastToClients({ type: 'platformConnected', data });
    });
    
    this.socialMediaManager.on('platformDisconnected', (data) => {
      this.broadcastToClients({ type: 'platformDisconnected', data });
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
    
    // Social Media and Chatbot API Routes
    
    // Get all platform status
    this.app.get('/api/social/platforms', (req, res) => {
      try {
        const platforms = this.socialMediaManager.getAllPlatformStatus();
        res.json({ success: true, data: platforms });
      } catch (error) {
        logger.error('Error getting platform status', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Send message to specific platform
    this.app.post('/api/social/platforms/:platform/message', (req, res) => {
      try {
        const { platform } = req.params;
        const { message, options } = req.body;
        
        this.socialMediaManager.sendMessageToPlatform(platform, message, options)
          .then(() => {
            res.json({ success: true, message: 'Message sent successfully' });
          })
          .catch((error) => {
            res.status(400).json({ success: false, error: error.message });
          });
      } catch (error) {
        logger.error('Error sending message', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get chat message history
    this.app.get('/api/chat/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const history = this.socialMediaManager.getMessageHistory(limit);
        res.json({ success: true, data: history });
      } catch (error) {
        logger.error('Error getting chat history', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get chatbot statistics
    this.app.get('/api/chatbot/stats', (req, res) => {
      try {
        const stats = this.chatbotService.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Error getting chatbot stats', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Test chatbot with message
    this.app.post('/api/chatbot/test', (req, res) => {
      try {
        const { message } = req.body;
        const testMessage = {
          platform: 'test',
          userId: 'test_user',
          username: 'Test User',
          message: message,
          timestamp: new Date()
        };
        
        this.chatbotService.processMessage(testMessage)
          .then((response) => {
            res.json({ success: true, data: response });
          })
          .catch((error) => {
            res.status(400).json({ success: false, error: error.message });
          });
      } catch (error) {
        logger.error('Error testing chatbot', error);
        res.status(500).json({ success: false, error: error.message });
      }
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

  setupChatbotIntegration() {
    // Connect chatbot service to social media manager
    this.socialMediaManager.setChatbotService(this.chatbotService);
    
    // Listen to chatbot interaction events
    this.chatbotService.on('interaction', (interaction) => {
      this.broadcastToClients({ type: 'chatInteraction', data: interaction });
    });
    
    // Initialize services asynchronously
    this.initializeAsyncServices();
  }
  
  async initializeAsyncServices() {
    try {
      // Initialize chatbot service first
      if (process.env.CHATBOT_ENABLED === 'true') {
        logger.info('Initializing RASA chatbot service...');
        await this.chatbotService.initialize(this.socialMediaManager);
        logger.info('RASA chatbot service initialized successfully');
      }
      
      // Initialize social media manager
      logger.info('Initializing social media platforms...');
      await this.socialMediaManager.initialize();
      logger.info('Social media platforms initialized successfully');
      
    } catch (error) {
      logger.error('Error initializing async services', error);
      // Continue without chatbot/social media if initialization fails
    }
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
      
      // Log social media and chatbot status
      const socialPlatforms = this.socialMediaManager.getAllPlatformStatus();
      const enabledSocialPlatforms = Object.keys(socialPlatforms).filter(p => socialPlatforms[p].config.enabled);
      
      if (enabledSocialPlatforms.length > 0) {
        logger.info(`Social media platforms: ${enabledSocialPlatforms.join(', ')}`);
      }
      
      if (process.env.CHATBOT_ENABLED === 'true') {
        logger.info('AI Chatbot: Enabled with RASA integration');
        logger.info('Chatbot will respond to messages across all connected platforms');
      } else {
        logger.info('AI Chatbot: Disabled');
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
    
    // Cleanup social media platforms
    try {
      await this.socialMediaManager.cleanup();
      logger.info('Social media platforms cleaned up');
    } catch (error) {
      logger.error('Error cleaning up social media platforms', error);
    }
    
    // Shutdown chatbot service
    try {
      await this.chatbotService.shutdown();
      logger.info('Chatbot service shut down');
    } catch (error) {
      logger.error('Error shutting down chatbot service', error);
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