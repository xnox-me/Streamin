const EventEmitter = require('events');
const logger = require('../../utils/logger');

// Platform implementations
const TwitchPlatform = require('./platforms/twitchPlatform');
const YouTubePlatform = require('./platforms/youtubePlatform');
const FacebookPlatform = require('./platforms/facebookPlatform');
const InstagramPlatform = require('./platforms/instagramPlatform');
const TikTokPlatform = require('./platforms/tiktokPlatform');
const LinkedInPlatform = require('./platforms/linkedinPlatform');
const TwitterPlatform = require('./platforms/twitterPlatform');
const DiscordPlatform = require('./platforms/discordPlatform');
const TelegramPlatform = require('./platforms/telegramPlatform');
const KickPlatform = require('./platforms/kickPlatform');
const RumblePlatform = require('./platforms/rumblePlatform');
const OdyseePlatform = require('./platforms/odyseePlatform');

/**
 * Social Media Manager
 * Coordinates all social media platform integrations
 */
class SocialMediaManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.platforms = new Map();
    this.chatbotService = null;
    this.isInitialized = false;
    this.messageHistory = [];
    this.maxMessageHistory = 1000;
    
    this.initializePlatforms();
  }

  /**
   * Initialize all platform instances
   */
  initializePlatforms() {
    const platformConfigs = [
      { name: 'twitch', class: TwitchPlatform, config: this.getTwitchConfig() },
      { name: 'youtube', class: YouTubePlatform, config: this.getYouTubeConfig() },
      { name: 'facebook', class: FacebookPlatform, config: this.getFacebookConfig() },
      { name: 'instagram', class: InstagramPlatform, config: this.getInstagramConfig() },
      { name: 'tiktok', class: TikTokPlatform, config: this.getTikTokConfig() },
      { name: 'linkedin', class: LinkedInPlatform, config: this.getLinkedInConfig() },
      { name: 'twitter', class: TwitterPlatform, config: this.getTwitterConfig() },
      { name: 'discord', class: DiscordPlatform, config: this.getDiscordConfig() },
      { name: 'telegram', class: TelegramPlatform, config: this.getTelegramConfig() },
      { name: 'kick', class: KickPlatform, config: this.getKickConfig() },
      { name: 'rumble', class: RumblePlatform, config: this.getRumbleConfig() },
      { name: 'odysee', class: OdyseePlatform, config: this.getOdyseeConfig() }
    ];

    platformConfigs.forEach(({ name, class: PlatformClass, config }) => {
      if (config && config.enabled) {
        try {
          const platform = new PlatformClass(config, name);
          this.platforms.set(name, platform);
          this.setupPlatformListeners(platform);
          logger.info(`Social Media Manager: ${name} platform initialized`);
        } catch (error) {
          logger.error(`Social Media Manager: Failed to initialize ${name} platform`, error);
        }
      } else {
        logger.info(`Social Media Manager: ${name} platform disabled or not configured`);
      }
    });
  }

  /**
   * Set up event listeners for a platform
   */
  setupPlatformListeners(platform) {
    platform.on('connected', (data) => {
      logger.info(`Social Media Manager: ${data.platform} connected`);
      this.emit('platformConnected', data);
    });

    platform.on('disconnected', (data) => {
      logger.warn(`Social Media Manager: ${data.platform} disconnected`);
      this.emit('platformDisconnected', data);
    });

    platform.on('error', (data) => {
      logger.error(`Social Media Manager: ${data.platform} error`, data.error);
      this.emit('platformError', data);
    });

    platform.on('chatMessage', (messageData) => {
      this.handleIncomingMessage(messageData);
    });

    platform.on('streamStarted', (data) => {
      logger.info(`Social Media Manager: ${data.platform} stream started`);
      this.emit('streamStarted', data);
    });

    platform.on('streamStopped', (data) => {
      logger.info(`Social Media Manager: ${data.platform} stream stopped`);
      this.emit('streamStopped', data);
    });
  }

  /**
   * Initialize all enabled platforms
   */
  async initialize() {
    logger.info('Social Media Manager: Initializing platforms...');
    
    const initPromises = Array.from(this.platforms.values()).map(async (platform) => {
      try {
        await platform.initialize();
        if (platform.config.chatEnabled) {
          await platform.connectChat();
        }
        return { platform: platform.name, success: true };
      } catch (error) {
        logger.error(`Social Media Manager: Failed to initialize ${platform.name}`, error);
        return { platform: platform.name, success: false, error };
      }
    });

    const results = await Promise.allSettled(initPromises);
    this.isInitialized = true;
    
    logger.info('Social Media Manager: Initialization completed', {
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value.success).length
    });

    return results;
  }

  /**
   * Start streaming on all enabled platforms
   */
  async startMultiStream(streamKey, inputPath) {
    const streamPromises = Array.from(this.platforms.values()).map(async (platform) => {
      if (platform.config.streamingEnabled) {
        try {
          await platform.startStream(streamKey, inputPath);
          return { platform: platform.name, success: true };
        } catch (error) {
          logger.error(`Social Media Manager: Failed to start stream on ${platform.name}`, error);
          return { platform: platform.name, success: false, error };
        }
      }
      return { platform: platform.name, success: false, reason: 'streaming disabled' };
    });

    const results = await Promise.allSettled(streamPromises);
    
    logger.info('Social Media Manager: Multi-stream start completed', {
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value.success).length
    });

    return results;
  }

  /**
   * Stop streaming on all platforms
   */
  async stopMultiStream() {
    const stopPromises = Array.from(this.platforms.values()).map(async (platform) => {
      if (platform.isStreaming) {
        try {
          await platform.stopStream();
          return { platform: platform.name, success: true };
        } catch (error) {
          logger.error(`Social Media Manager: Failed to stop stream on ${platform.name}`, error);
          return { platform: platform.name, success: false, error };
        }
      }
      return { platform: platform.name, success: true, reason: 'not streaming' };
    });

    const results = await Promise.allSettled(stopPromises);
    
    logger.info('Social Media Manager: Multi-stream stop completed', {
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value.success).length
    });

    return results;
  }

  /**
   * Handle incoming chat message from any platform
   */
  async handleIncomingMessage(messageData) {
    // Add to message history
    this.messageHistory.push(messageData);
    if (this.messageHistory.length > this.maxMessageHistory) {
      this.messageHistory.shift();
    }

    logger.info(`Social Media Manager: Received message from ${messageData.platform}:${messageData.username}: ${messageData.message}`);

    // Emit event for external handlers (like web dashboard)
    this.emit('chatMessage', messageData);

    // Process with chatbot if available
    if (this.chatbotService) {
      try {
        const response = await this.chatbotService.processMessage(messageData);
        if (response && response.text) {
          await this.sendResponseToAllPlatforms(response.text, messageData);
        }
      } catch (error) {
        logger.error('Social Media Manager: Error processing message with chatbot', error);
      }
    }
  }

  /**
   * Send chatbot response to all connected platforms
   */
  async sendResponseToAllPlatforms(message, originalMessage) {
    const sendPromises = Array.from(this.platforms.values()).map(async (platform) => {
      if (platform.chatConnected && platform.config.chatbotEnabled) {
        try {
          // Don't send response back to the same platform unless configured to do so
          if (platform.name === originalMessage.platform && !platform.config.allowSelfResponse) {
            return { platform: platform.name, success: true, reason: 'self-response disabled' };
          }

          await platform.sendMessage(message);
          return { platform: platform.name, success: true };
        } catch (error) {
          logger.error(`Social Media Manager: Failed to send response to ${platform.name}`, error);
          return { platform: platform.name, success: false, error };
        }
      }
      return { platform: platform.name, success: false, reason: 'chat not connected or disabled' };
    });

    const results = await Promise.allSettled(sendPromises);
    
    logger.info('Social Media Manager: Response sent to platforms', {
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length
    });

    return results;
  }

  /**
   * Send message to specific platform
   */
  async sendMessageToPlatform(platformName, message, options = {}) {
    const platform = this.platforms.get(platformName);
    if (!platform) {
      throw new Error(`Platform ${platformName} not found`);
    }

    if (!platform.chatConnected) {
      throw new Error(`Platform ${platformName} chat not connected`);
    }

    return await platform.sendMessage(message, options);
  }

  /**
   * Get status of all platforms
   */
  getAllPlatformStatus() {
    const status = {};
    this.platforms.forEach((platform, name) => {
      status[name] = platform.getStreamStatus();
    });
    return status;
  }

  /**
   * Get chat message history
   */
  getMessageHistory(limit = 100) {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Set chatbot service
   */
  setChatbotService(chatbotService) {
    this.chatbotService = chatbotService;
    logger.info('Social Media Manager: Chatbot service connected');
  }

  /**
   * Cleanup all platforms
   */
  async cleanup() {
    logger.info('Social Media Manager: Starting cleanup...');
    
    const cleanupPromises = Array.from(this.platforms.values()).map(async (platform) => {
      try {
        await platform.cleanup();
        return { platform: platform.name, success: true };
      } catch (error) {
        logger.error(`Social Media Manager: Failed to cleanup ${platform.name}`, error);
        return { platform: platform.name, success: false, error };
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.platforms.clear();
    this.removeAllListeners();
    
    logger.info('Social Media Manager: Cleanup completed');
  }

  // Platform configuration getters
  getTwitchConfig() {
    return {
      enabled: process.env.TWITCH_STREAM_KEY && process.env.TWITCH_CLIENT_ID,
      streamingEnabled: !!process.env.TWITCH_STREAM_KEY,
      chatEnabled: !!process.env.TWITCH_CLIENT_ID,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      streamKey: process.env.TWITCH_STREAM_KEY,
      rtmpUrl: process.env.TWITCH_RTMP_URL,
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      accessToken: process.env.TWITCH_ACCESS_TOKEN
    };
  }

  getYouTubeConfig() {
    return {
      enabled: process.env.YOUTUBE_STREAM_KEY && process.env.YOUTUBE_API_KEY,
      streamingEnabled: !!process.env.YOUTUBE_STREAM_KEY,
      chatEnabled: !!process.env.YOUTUBE_API_KEY,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      streamKey: process.env.YOUTUBE_STREAM_KEY,
      rtmpUrl: process.env.YOUTUBE_RTMP_URL,
      apiKey: process.env.YOUTUBE_API_KEY,
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN
    };
  }

  getFacebookConfig() {
    return {
      enabled: process.env.FACEBOOK_STREAM_KEY && process.env.FACEBOOK_ACCESS_TOKEN,
      streamingEnabled: !!process.env.FACEBOOK_STREAM_KEY,
      chatEnabled: !!process.env.FACEBOOK_ACCESS_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      streamKey: process.env.FACEBOOK_STREAM_KEY,
      rtmpUrl: process.env.FACEBOOK_RTMP_URL,
      accessToken: process.env.FACEBOOK_ACCESS_TOKEN,
      pageId: process.env.FACEBOOK_PAGE_ID,
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET
    };
  }

  getInstagramConfig() {
    return {
      enabled: process.env.INSTAGRAM_ACCESS_TOKEN,
      streamingEnabled: false, // Instagram doesn't support RTMP streaming directly
      chatEnabled: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      userId: process.env.INSTAGRAM_USER_ID,
      appId: process.env.INSTAGRAM_APP_ID,
      appSecret: process.env.INSTAGRAM_APP_SECRET
    };
  }

  getTikTokConfig() {
    return {
      enabled: process.env.TIKTOK_ACCESS_TOKEN,
      streamingEnabled: !!process.env.TIKTOK_RTMP_URL,
      chatEnabled: !!process.env.TIKTOK_ACCESS_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      accessToken: process.env.TIKTOK_ACCESS_TOKEN,
      clientKey: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      rtmpUrl: process.env.TIKTOK_RTMP_URL
    };
  }

  getLinkedInConfig() {
    return {
      enabled: process.env.LINKEDIN_ACCESS_TOKEN,
      streamingEnabled: false, // LinkedIn doesn't support RTMP streaming
      chatEnabled: !!process.env.LINKEDIN_ACCESS_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      personUrn: process.env.LINKEDIN_PERSON_URN
    };
  }

  getTwitterConfig() {
    return {
      enabled: process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN,
      streamingEnabled: false, // Twitter doesn't support RTMP streaming directly
      chatEnabled: !!process.env.TWITTER_API_KEY,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: false,
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      bearerToken: process.env.TWITTER_BEARER_TOKEN
    };
  }

  getDiscordConfig() {
    return {
      enabled: process.env.DISCORD_BOT_TOKEN,
      streamingEnabled: !!process.env.DISCORD_BOT_TOKEN, // Voice channel streaming
      chatEnabled: !!process.env.DISCORD_BOT_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: true, // Discord bots can respond in the same channel
      botToken: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      guildId: process.env.DISCORD_GUILD_ID,
      voiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID
    };
  }

  getTelegramConfig() {
    return {
      enabled: process.env.TELEGRAM_BOT_TOKEN,
      streamingEnabled: false, // Telegram doesn't support RTMP streaming
      chatEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
      chatbotEnabled: process.env.CHATBOT_ENABLED === 'true',
      allowSelfResponse: true, // Telegram bots can respond in the same chat
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      apiId: process.env.TELEGRAM_API_ID,
      apiHash: process.env.TELEGRAM_API_HASH
    };
  }

  getKickConfig() {
    return {
      enabled: process.env.KICK_STREAM_KEY,
      streamingEnabled: !!process.env.KICK_STREAM_KEY,
      chatEnabled: false, // Limited chat API support
      chatbotEnabled: false,
      allowSelfResponse: false,
      streamKey: process.env.KICK_STREAM_KEY,
      rtmpUrl: process.env.KICK_RTMP_URL
    };
  }

  getRumbleConfig() {
    return {
      enabled: process.env.RUMBLE_STREAM_KEY,
      streamingEnabled: !!process.env.RUMBLE_STREAM_KEY,
      chatEnabled: false, // Limited chat API support
      chatbotEnabled: false,
      allowSelfResponse: false,
      streamKey: process.env.RUMBLE_STREAM_KEY,
      rtmpUrl: process.env.RUMBLE_RTMP_URL
    };
  }

  getOdyseeConfig() {
    return {
      enabled: process.env.ODYSEE_STREAM_KEY,
      streamingEnabled: !!process.env.ODYSEE_STREAM_KEY,
      chatEnabled: false, // Limited chat API support
      chatbotEnabled: false,
      allowSelfResponse: false,
      streamKey: process.env.ODYSEE_STREAM_KEY,
      rtmpUrl: process.env.ODYSEE_RTMP_URL
    };
  }
}

module.exports = SocialMediaManager;