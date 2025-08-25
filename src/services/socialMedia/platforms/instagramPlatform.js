const BasePlatform = require('../basePlatform');
const logger = require('../../../utils/logger');

/**
 * Instagram Platform Integration
 * Handles messaging for Instagram (no streaming support)
 */
class InstagramPlatform extends BasePlatform {
  constructor(config, name) {
    super(config, name);
    this.messageRateLimit = 3000;
  }

  async initialize() {
    this.validateConfig();
    if (!this.hasRequiredCredentials()) {
      throw new Error('Instagram: Missing required credentials');
    }
    this.handleConnection();
    return true;
  }

  async startStream() {
    logger.warn('Instagram: Direct streaming not supported');
    return false;
  }

  async stopStream() {
    return false;
  }

  async connectChat() {
    this.chatConnected = true;
    return true;
  }

  async disconnectChat() {
    this.chatConnected = false;
  }

  async sendMessageImplementation(message, options = {}) {
    // Instagram Graph API implementation would go here
    logger.info(`Instagram: Message sent: ${message}`);
    return true;
  }

  hasRequiredCredentials() {
    return !!(this.config.accessToken && this.config.userId);
  }

  async cleanup() {
    await super.cleanup();
  }
}

module.exports = InstagramPlatform;