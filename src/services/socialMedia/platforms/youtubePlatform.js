const BasePlatform = require('../basePlatform');
const axios = require('axios');
const logger = require('../../../utils/logger');
const ffmpeg = require('fluent-ffmpeg');

/**
 * YouTube Platform Integration
 * Handles streaming and live chat for YouTube
 */
class YouTubePlatform extends BasePlatform {
  constructor(config, name) {
    super(config, name);
    this.ffmpegProcess = null;
    this.liveChatId = null;
    this.chatPollingInterval = null;
    this.messageRateLimit = 2000; // YouTube has rate limiting for chat messages
    this.nextPageToken = null;
  }

  /**
   * Initialize YouTube connection
   */
  async initialize() {
    this.validateConfig();
    
    if (!this.hasRequiredCredentials()) {
      throw new Error('YouTube: Missing required credentials');
    }

    // Validate API key and get channel info
    await this.validateApiAccess();
    
    this.handleConnection();
    return true;
  }

  /**
   * Start streaming to YouTube
   */
  async startStream(streamKey, inputPath) {
    if (this.isStreaming) {
      logger.warn('YouTube: Stream already active');
      return false;
    }

    if (!this.config.streamingEnabled) {
      logger.warn('YouTube: Streaming disabled in configuration');
      return false;
    }

    try {
      const outputUrl = `${this.config.rtmpUrl}${this.config.streamKey}`;
      
      this.ffmpegProcess = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate('4000k') // Higher bitrate for YouTube
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
            logger.info('YouTube: Stream started', { command: commandLine });
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
            logger.error('YouTube: Stream error', err);
            this.isStreaming = false;
            this.emit('streamError', { platform: this.name, error: err });
            reject(err);
          })
          .on('end', () => {
            logger.info('YouTube: Stream ended');
            this.isStreaming = false;
            this.streamData = null;
            this.emit('streamStopped', { platform: this.name });
          })
          .run();
      });
    } catch (error) {
      logger.error('YouTube: Failed to start stream', error);
      throw error;
    }
  }

  /**
   * Stop streaming to YouTube
   */
  async stopStream() {
    if (!this.isStreaming || !this.ffmpegProcess) {
      logger.warn('YouTube: No active stream to stop');
      return false;
    }

    try {
      this.ffmpegProcess.kill('SIGTERM');
      this.isStreaming = false;
      this.streamData = null;
      this.ffmpegProcess = null;
      
      logger.info('YouTube: Stream stopped successfully');
      this.emit('streamStopped', { platform: this.name });
      return true;
    } catch (error) {
      logger.error('YouTube: Error stopping stream', error);
      throw error;
    }
  }

  /**
   * Connect to YouTube live chat
   */
  async connectChat() {
    if (this.chatConnected) {
      logger.warn('YouTube: Chat already connected');
      return false;
    }

    if (!this.config.chatEnabled) {
      logger.warn('YouTube: Chat disabled in configuration');
      return false;
    }

    try {
      // Get live broadcast info to find live chat ID
      const liveBroadcast = await this.getCurrentLiveBroadcast();
      if (liveBroadcast && liveBroadcast.snippet.liveChatId) {
        this.liveChatId = liveBroadcast.snippet.liveChatId;
        
        // Start polling for chat messages
        this.startChatPolling();
        
        this.chatConnected = true;
        logger.info('YouTube: Chat connected successfully', { liveChatId: this.liveChatId });
        return true;
      } else {
        logger.warn('YouTube: No active live broadcast found');
        return false;
      }
    } catch (error) {
      logger.error('YouTube: Failed to connect to chat', error);
      throw error;
    }
  }

  /**
   * Disconnect from YouTube chat
   */
  async disconnectChat() {
    if (this.chatPollingInterval) {
      clearInterval(this.chatPollingInterval);
      this.chatPollingInterval = null;
    }
    
    this.chatConnected = false;
    this.liveChatId = null;
    this.nextPageToken = null;
    logger.info('YouTube: Chat disconnected');
  }

  /**
   * Send message to YouTube live chat
   */
  async sendMessageImplementation(message, options = {}) {
    if (!this.chatConnected || !this.liveChatId) {
      throw new Error('YouTube: Chat not connected');
    }

    try {
      const response = await axios.post(
        'https://www.googleapis.com/youtube/v3/liveChat/messages',
        {
          snippet: {
            liveChatId: this.liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: message
            }
          }
        },
        {
          params: {
            part: 'snippet',
            key: this.config.apiKey
          },
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`YouTube: Message sent to live chat: ${message}`);
      return true;
    } catch (error) {
      logger.error('YouTube: Error sending message', error);
      throw error;
    }
  }

  /**
   * Start polling for chat messages
   */
  startChatPolling() {
    const pollMessages = async () => {
      try {
        const params = {
          liveChatId: this.liveChatId,
          part: 'snippet,authorDetails',
          key: this.config.apiKey
        };

        if (this.nextPageToken) {
          params.pageToken = this.nextPageToken;
        }

        const response = await axios.get(
          'https://www.googleapis.com/youtube/v3/liveChat/messages',
          {
            params,
            headers: {
              'Authorization': `Bearer ${this.config.accessToken}`
            }
          }
        );

        const data = response.data;
        this.nextPageToken = data.nextPageToken;

        // Process new messages
        if (data.items && data.items.length > 0) {
          data.items.forEach(item => {
            this.handleYouTubeMessage(item);
          });
        }

        // Set next polling interval based on YouTube's pollingIntervalMillis
        const pollingInterval = data.pollingIntervalMillis || 5000;
        this.chatPollingInterval = setTimeout(pollMessages, pollingInterval);

      } catch (error) {
        logger.error('YouTube: Error polling chat messages', error);
        
        // Retry after a longer interval if there's an error
        this.chatPollingInterval = setTimeout(pollMessages, 10000);
      }
    };

    // Start initial polling
    pollMessages();
  }

  /**
   * Handle incoming YouTube chat messages
   */
  handleYouTubeMessage(messageItem) {
    const snippet = messageItem.snippet;
    const authorDetails = messageItem.authorDetails;

    // Skip messages from the channel owner (bot's own messages)
    if (authorDetails.isChatOwner) return;

    const messageData = {
      userId: authorDetails.channelId,
      username: authorDetails.displayName,
      message: snippet.displayMessage,
      timestamp: new Date(snippet.publishedAt),
      messageId: messageItem.id,
      isSubscriber: authorDetails.isChatSponsor || false,
      isModerator: authorDetails.isChatModerator || false,
      badges: this.getYouTubeBadges(authorDetails),
      emotes: [], // YouTube doesn't provide detailed emote data via API
      profileImageUrl: authorDetails.profileImageUrl
    };

    this.handleIncomingMessage(messageData);
  }

  /**
   * Get YouTube user badges
   */
  getYouTubeBadges(authorDetails) {
    const badges = [];
    
    if (authorDetails.isChatOwner) {
      badges.push({ name: 'owner', type: 'owner' });
    }
    
    if (authorDetails.isChatModerator) {
      badges.push({ name: 'moderator', type: 'moderator' });
    }
    
    if (authorDetails.isChatSponsor) {
      badges.push({ name: 'member', type: 'subscriber' });
    }
    
    if (authorDetails.isVerified) {
      badges.push({ name: 'verified', type: 'verified' });
    }
    
    return badges;
  }

  /**
   * Get current live broadcast
   */
  async getCurrentLiveBroadcast() {
    try {
      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/liveBroadcasts',
        {
          params: {
            part: 'snippet,contentDetails,status',
            broadcastStatus: 'active',
            key: this.config.apiKey
          },
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`
          }
        }
      );

      const broadcasts = response.data.items;
      return broadcasts.length > 0 ? broadcasts[0] : null;
    } catch (error) {
      logger.error('YouTube: Error getting live broadcast', error);
      throw error;
    }
  }

  /**
   * Validate API access
   */
  async validateApiAccess() {
    try {
      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          params: {
            part: 'snippet',
            mine: true,
            key: this.config.apiKey
          },
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`
          }
        }
      );

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        logger.info('YouTube: API access validated', { 
          channelTitle: channel.snippet.title,
          channelId: channel.id
        });
        return channel;
      } else {
        throw new Error('YouTube: No channel data returned');
      }
    } catch (error) {
      logger.error('YouTube: API validation failed', error);
      throw error;
    }
  }

  /**
   * Check if platform has required credentials
   */
  hasRequiredCredentials() {
    return !!(this.config.apiKey && (this.config.accessToken || this.config.refreshToken));
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    super.validateConfig();
    
    if (this.config.streamingEnabled && !this.config.streamKey) {
      throw new Error('YouTube: Stream key is required for streaming');
    }
    
    if (this.config.chatEnabled && !this.config.apiKey) {
      throw new Error('YouTube: API key is required for chat');
    }
  }

  /**
   * Get extended stream status
   */
  getStreamStatus() {
    const baseStatus = super.getStreamStatus();
    
    return {
      ...baseStatus,
      liveChatId: this.liveChatId,
      chatPolling: !!this.chatPollingInterval
    };
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
      logger.error('YouTube: Error during cleanup', error);
    }
  }
}

module.exports = YouTubePlatform;