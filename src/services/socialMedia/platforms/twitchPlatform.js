const BasePlatform = require('../basePlatform');
const WebSocket = require('ws');
const https = require('https');
const logger = require('../../../utils/logger');
const ffmpeg = require('fluent-ffmpeg');

/**
 * Twitch Platform Integration
 * Handles streaming and chat for Twitch
 */
class TwitchPlatform extends BasePlatform {
  constructor(config, name) {
    super(config, name);
    this.chatWs = null;
    this.apiHeaders = {
      'Client-ID': this.config.clientId,
      'Authorization': `Bearer ${this.config.accessToken}`
    };
    this.messageRateLimit = 1200; // Twitch allows 20 messages per 30 seconds
    this.ffmpegProcess = null;
  }

  /**
   * Initialize Twitch connection
   */
  async initialize() {
    this.validateConfig();
    
    if (!this.hasRequiredCredentials()) {
      throw new Error('Twitch: Missing required credentials');
    }

    // Validate access token
    await this.validateAccessToken();
    
    this.handleConnection();
    return true;
  }

  /**
   * Start streaming to Twitch
   */
  async startStream(streamKey, inputPath) {
    if (this.isStreaming) {
      logger.warn('Twitch: Stream already active');
      return false;
    }

    if (!this.config.streamingEnabled) {
      logger.warn('Twitch: Streaming disabled in configuration');
      return false;
    }

    try {
      const outputUrl = `${this.config.rtmpUrl}${this.config.streamKey}`;
      
      this.ffmpegProcess = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate('2500k')
        .audioBitrate('128k')
        .size('1920x1080')
        .fps(30)
        .addOption('-preset', 'veryfast')
        .addOption('-tune', 'zerolatency')
        .addOption('-g', '60')
        .addOption('-keyint_min', '60')
        .addOption('-x264-params', 'keyint=60:min-keyint=60:no-scenecut')
        .format('flv')
        .output(outputUrl);

      return new Promise((resolve, reject) => {
        this.ffmpegProcess
          .on('start', (commandLine) => {
            logger.info('Twitch: Stream started', { command: commandLine });
            this.isStreaming = true;
            this.streamData = {
              startTime: new Date(),
              inputPath,
              outputUrl,
              status: 'streaming'
            };
            this.emit('streamStarted', { platform: this.name, streamData: this.streamData });
            resolve(true);
          })
          .on('error', (err) => {
            logger.error('Twitch: Stream error', err);
            this.isStreaming = false;
            this.emit('streamError', { platform: this.name, error: err });
            reject(err);
          })
          .on('end', () => {
            logger.info('Twitch: Stream ended');
            this.isStreaming = false;
            this.streamData = null;
            this.emit('streamStopped', { platform: this.name });
          })
          .run();
      });
    } catch (error) {
      logger.error('Twitch: Failed to start stream', error);
      throw error;
    }
  }

  /**
   * Stop streaming to Twitch
   */
  async stopStream() {
    if (!this.isStreaming || !this.ffmpegProcess) {
      logger.warn('Twitch: No active stream to stop');
      return false;
    }

    try {
      this.ffmpegProcess.kill('SIGTERM');
      this.isStreaming = false;
      this.streamData = null;
      this.ffmpegProcess = null;
      
      logger.info('Twitch: Stream stopped successfully');
      this.emit('streamStopped', { platform: this.name });
      return true;
    } catch (error) {
      logger.error('Twitch: Error stopping stream', error);
      throw error;
    }
  }

  /**
   * Connect to Twitch chat
   */
  async connectChat() {
    if (this.chatConnected) {
      logger.warn('Twitch: Chat already connected');
      return false;
    }

    if (!this.config.chatEnabled) {
      logger.warn('Twitch: Chat disabled in configuration');
      return false;
    }

    try {
      // Get user info to get the channel name
      const userInfo = await this.getUserInfo();
      this.channelName = userInfo.login;

      // Connect to Twitch IRC
      this.chatWs = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.chatWs.on('open', () => {
        logger.info('Twitch: Chat WebSocket connected');
        
        // Send authentication
        this.chatWs.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
        this.chatWs.send(`PASS oauth:${this.config.accessToken}`);
        this.chatWs.send(`NICK ${this.channelName}`);
        this.chatWs.send(`JOIN #${this.channelName}`);
      });

      this.chatWs.on('message', (data) => {
        this.handleChatMessage(data.toString());
      });

      this.chatWs.on('error', (error) => {
        logger.error('Twitch: Chat WebSocket error', error);
        this.chatConnected = false;
        this.handleError(error);
      });

      this.chatWs.on('close', () => {
        logger.warn('Twitch: Chat WebSocket disconnected');
        this.chatConnected = false;
        this.handleDisconnection();
      });

      // Set connected after successful authentication
      setTimeout(() => {
        this.chatConnected = true;
        logger.info('Twitch: Chat connected successfully');
      }, 2000);

      return true;
    } catch (error) {
      logger.error('Twitch: Failed to connect to chat', error);
      throw error;
    }
  }

  /**
   * Disconnect from Twitch chat
   */
  async disconnectChat() {
    if (this.chatWs) {
      this.chatWs.close();
      this.chatWs = null;
    }
    this.chatConnected = false;
    logger.info('Twitch: Chat disconnected');
  }

  /**
   * Send message to Twitch chat
   */
  async sendMessageImplementation(message, options = {}) {
    if (!this.chatConnected || !this.chatWs) {
      throw new Error('Twitch: Chat not connected');
    }

    try {
      const chatMessage = `PRIVMSG #${this.channelName} :${message}`;
      this.chatWs.send(chatMessage);
      
      logger.info(`Twitch: Message sent to #${this.channelName}: ${message}`);
      return true;
    } catch (error) {
      logger.error('Twitch: Error sending message', error);
      throw error;
    }
  }

  /**
   * Handle incoming chat messages
   */
  handleChatMessage(data) {
    const lines = data.split('\r\n');
    
    lines.forEach(line => {
      if (line.includes('PRIVMSG')) {
        const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (match) {
          const [, username, message] = match;
          
          // Extract additional info from tags
          const tags = this.parseTwitchTags(line);
          
          const messageData = {
            userId: tags['user-id'] || username,
            username,
            message,
            timestamp: new Date(),
            messageId: tags['id'],
            isSubscriber: tags.subscriber === '1',
            isModerator: tags.mod === '1',
            badges: this.parseTwitchBadges(tags.badges),
            emotes: this.parseTwitchEmotes(tags.emotes),
            color: tags.color
          };

          this.handleIncomingMessage(messageData);
        }
      } else if (line.includes('PING')) {
        // Respond to ping to keep connection alive
        this.chatWs.send('PONG :tmi.twitch.tv');
      }
    });
  }

  /**
   * Parse Twitch message tags
   */
  parseTwitchTags(line) {
    const tags = {};
    const tagMatch = line.match(/^@([^\\s]+)/);
    
    if (tagMatch) {
      const tagString = tagMatch[1];
      const tagPairs = tagString.split(';');
      
      tagPairs.forEach(pair => {
        const [key, value] = pair.split('=');
        tags[key] = value || '';
      });
    }
    
    return tags;
  }

  /**
   * Parse Twitch badges
   */
  parseTwitchBadges(badgeString) {
    if (!badgeString) return [];
    
    return badgeString.split(',').map(badge => {
      const [name, version] = badge.split('/');
      return { name, version };
    });
  }

  /**
   * Parse Twitch emotes
   */
  parseTwitchEmotes(emoteString) {
    if (!emoteString) return [];
    
    const emotes = [];
    const emotePairs = emoteString.split('/');
    
    emotePairs.forEach(pair => {
      const [emoteId, positions] = pair.split(':');
      const ranges = positions.split(',');
      
      ranges.forEach(range => {
        const [start, end] = range.split('-');
        emotes.push({
          id: emoteId,
          start: parseInt(start),
          end: parseInt(end)
        });
      });
    });
    
    return emotes;
  }

  /**
   * Validate access token
   */
  async validateAccessToken() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'id.twitch.tv',
        path: '/oauth2/validate',
        method: 'GET',
        headers: {
          'Authorization': `OAuth ${this.config.accessToken}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            logger.info('Twitch: Access token validated', { 
              clientId: result.client_id, 
              scopes: result.scopes 
            });
            resolve(result);
          } else {
            reject(new Error(`Twitch: Invalid access token (${res.statusCode})`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Get user information
   */
  async getUserInfo() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitch.tv',
        path: '/helix/users',
        method: 'GET',
        headers: this.apiHeaders
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            if (result.data && result.data.length > 0) {
              resolve(result.data[0]);
            } else {
              reject(new Error('Twitch: No user data returned'));
            }
          } else {
            reject(new Error(`Twitch: Failed to get user info (${res.statusCode})`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Check if platform has required credentials
   */
  hasRequiredCredentials() {
    return !!(this.config.clientId && this.config.accessToken);
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    super.validateConfig();
    
    if (this.config.streamingEnabled && !this.config.streamKey) {
      throw new Error('Twitch: Stream key is required for streaming');
    }
    
    if (this.config.chatEnabled && (!this.config.clientId || !this.config.accessToken)) {
      throw new Error('Twitch: Client ID and access token are required for chat');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill('SIGTERM');
        this.ffmpegProcess = null;
      }
      
      await this.disconnectChat();
      await super.cleanup();
    } catch (error) {
      logger.error('Twitch: Error during cleanup', error);
    }
  }
}

module.exports = TwitchPlatform;