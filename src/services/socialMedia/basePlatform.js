const EventEmitter = require('events');
const logger = require('../../utils/logger');

/**
 * Base class for all social media platform integrations
 * Provides common functionality and interface for streaming and chat
 */
class BasePlatform extends EventEmitter {
  constructor(config, name) {
    super();
    this.config = config;
    this.name = name;
    this.isConnected = false;
    this.isStreaming = false;
    this.chatConnected = false;
    this.streamData = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.messageQueue = [];
    this.rateLimitQueue = [];
    this.lastMessageTime = 0;
    this.messageRateLimit = 1000; // 1 message per second by default
  }

  /**
   * Initialize the platform connection
   * Should be overridden by each platform implementation
   */
  async initialize() {
    throw new Error(`${this.name}: initialize() method must be implemented`);
  }

  /**
   * Start streaming to the platform
   * Should be overridden by each platform implementation
   */
  async startStream(streamKey, inputPath) {
    throw new Error(`${this.name}: startStream() method must be implemented`);
  }

  /**
   * Stop streaming to the platform
   * Should be overridden by each platform implementation
   */
  async stopStream() {
    throw new Error(`${this.name}: stopStream() method must be implemented`);
  }

  /**
   * Connect to platform chat/messaging
   * Should be overridden by each platform implementation
   */
  async connectChat() {
    throw new Error(`${this.name}: connectChat() method must be implemented`);
  }

  /**
   * Disconnect from platform chat/messaging
   * Should be overridden by each platform implementation
   */
  async disconnectChat() {
    throw new Error(`${this.name}: disconnectChat() method must be implemented`);
  }

  /**
   * Send a message to the platform chat
   * Implements rate limiting and queuing
   */
  async sendMessage(message, options = {}) {
    if (!this.chatConnected) {
      logger.warn(`${this.name}: Cannot send message, chat not connected`);
      return false;
    }

    // Add to rate limit queue
    return new Promise((resolve) => {
      this.rateLimitQueue.push({ message, options, resolve });
      this.processMessageQueue();
    });
  }

  /**
   * Process the message queue with rate limiting
   */
  async processMessageQueue() {
    if (this.rateLimitQueue.length === 0) return;

    const now = Date.now();
    if (now - this.lastMessageTime < this.messageRateLimit) {
      // Schedule next processing
      setTimeout(() => this.processMessageQueue(), this.messageRateLimit);
      return;
    }

    const { message, options, resolve } = this.rateLimitQueue.shift();
    this.lastMessageTime = now;

    try {
      const result = await this.sendMessageImplementation(message, options);
      resolve(result);
    } catch (error) {
      logger.error(`${this.name}: Error sending message`, error);
      resolve(false);
    }

    // Continue processing queue
    if (this.rateLimitQueue.length > 0) {
      setTimeout(() => this.processMessageQueue(), this.messageRateLimit);
    }
  }

  /**
   * Platform-specific message sending implementation
   * Should be overridden by each platform implementation
   */
  async sendMessageImplementation(message, options = {}) {
    throw new Error(`${this.name}: sendMessageImplementation() method must be implemented`);
  }

  /**
   * Get current stream status
   */
  getStreamStatus() {
    return {
      platform: this.name,
      isConnected: this.isConnected,
      isStreaming: this.isStreaming,
      chatConnected: this.chatConnected,
      streamData: this.streamData,
      config: {
        hasCredentials: this.hasRequiredCredentials(),
        enabled: this.config.enabled || false
      }
    };
  }

  /**
   * Check if platform has required credentials
   * Should be overridden by each platform implementation
   */
  hasRequiredCredentials() {
    return false;
  }

  /**
   * Handle incoming chat messages
   * Emits 'chatMessage' event for processing by chatbot
   */
  handleIncomingMessage(messageData) {
    const standardizedMessage = {
      platform: this.name,
      userId: messageData.userId,
      username: messageData.username,
      message: messageData.message,
      timestamp: messageData.timestamp || new Date(),
      messageId: messageData.messageId,
      isSubscriber: messageData.isSubscriber || false,
      isModerator: messageData.isModerator || false,
      badges: messageData.badges || [],
      emotes: messageData.emotes || []
    };

    logger.info(`${this.name}: Received message from ${standardizedMessage.username}: ${standardizedMessage.message}`);
    this.emit('chatMessage', standardizedMessage);
  }

  /**
   * Handle connection events
   */
  handleConnection() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    logger.info(`${this.name}: Connected successfully`);
    this.emit('connected', { platform: this.name });
  }

  /**
   * Handle disconnection events
   */
  handleDisconnection() {
    this.isConnected = false;
    this.chatConnected = false;
    logger.warn(`${this.name}: Disconnected`);
    this.emit('disconnected', { platform: this.name });
    
    // Attempt reconnection
    this.attemptReconnect();
  }

  /**
   * Handle errors
   */
  handleError(error) {
    logger.error(`${this.name}: Error occurred`, error);
    this.emit('error', { platform: this.name, error });
  }

  /**
   * Attempt to reconnect to the platform
   */
  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`${this.name}: Max reconnection attempts reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    logger.info(`${this.name}: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.initialize();
        if (this.config.chatEnabled) {
          await this.connectChat();
        }
      } catch (error) {
        logger.error(`${this.name}: Reconnection attempt failed`, error);
        this.attemptReconnect();
      }
    }, delay);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.isStreaming) {
        await this.stopStream();
      }
      if (this.chatConnected) {
        await this.disconnectChat();
      }
      this.removeAllListeners();
      logger.info(`${this.name}: Cleanup completed`);
    } catch (error) {
      logger.error(`${this.name}: Error during cleanup`, error);
    }
  }

  /**
   * Validate platform configuration
   */
  validateConfig() {
    if (!this.config) {
      throw new Error(`${this.name}: Configuration is required`);
    }
    return true;
  }

  /**
   * Get platform-specific streaming URL
   */
  getStreamingUrl() {
    return this.config.rtmpUrl || null;
  }

  /**
   * Get platform-specific stream key
   */
  getStreamKey() {
    return this.config.streamKey || null;
  }

  /**
   * Update platform configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', { platform: this.name, config: this.config });
  }
}

module.exports = BasePlatform;