const BasePlatform = require('../basePlatform');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const logger = require('../../../utils/logger');

/**
 * Discord Platform Integration
 * Handles bot interactions and voice channel streaming
 */
class DiscordPlatform extends BasePlatform {
  constructor(config, name) {
    super(config, name);
    this.client = null;
    this.guild = null;
    this.voiceChannel = null;
    this.textChannels = new Map();
    this.messageRateLimit = 2000; // Discord allows 5 messages per 5 seconds per channel
  }

  /**
   * Initialize Discord connection
   */
  async initialize() {
    this.validateConfig();
    
    if (!this.hasRequiredCredentials()) {
      throw new Error('Discord: Missing required credentials');
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.DirectMessages
        ]
      });

      this.setupEventListeners();
      
      await this.client.login(this.config.botToken);
      
      // Wait for ready event
      await new Promise((resolve) => {
        this.client.once('ready', resolve);
      });

      this.handleConnection();
      return true;
    } catch (error) {
      logger.error('Discord: Failed to initialize', error);
      throw error;
    }
  }

  /**
   * Set up Discord event listeners
   */
  setupEventListeners() {
    this.client.on('ready', () => {
      logger.info(`Discord: Bot logged in as ${this.client.user.tag}`);
      this.setupGuildAndChannels();
    });

    this.client.on('messageCreate', (message) => {
      this.handleDiscordMessage(message);
    });

    this.client.on('error', (error) => {
      logger.error('Discord: Client error', error);
      this.handleError(error);
    });

    this.client.on('disconnect', () => {
      logger.warn('Discord: Client disconnected');
      this.handleDisconnection();
    });

    this.client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });
  }

  /**
   * Set up guild and channels
   */
  async setupGuildAndChannels() {
    try {
      if (this.config.guildId) {
        this.guild = await this.client.guilds.fetch(this.config.guildId);
        logger.info(`Discord: Connected to guild: ${this.guild.name}`);
        
        // Get voice channel if specified
        if (this.config.voiceChannelId) {
          this.voiceChannel = await this.guild.channels.fetch(this.config.voiceChannelId);
          if (this.voiceChannel && this.voiceChannel.type === ChannelType.GuildVoice) {
            logger.info(`Discord: Voice channel set: ${this.voiceChannel.name}`);
          }
        }

        // Cache text channels for messaging
        const channels = await this.guild.channels.fetch();
        channels.forEach(channel => {
          if (channel.type === ChannelType.GuildText) {
            this.textChannels.set(channel.id, channel);
          }
        });
        
        logger.info(`Discord: Cached ${this.textChannels.size} text channels`);
      }
    } catch (error) {
      logger.error('Discord: Error setting up guild and channels', error);
    }
  }

  /**
   * Start streaming (join voice channel)
   */
  async startStream(streamKey, inputPath) {
    if (this.isStreaming) {
      logger.warn('Discord: Already connected to voice channel');
      return false;
    }

    if (!this.config.streamingEnabled || !this.voiceChannel) {
      logger.warn('Discord: Streaming disabled or no voice channel configured');
      return false;
    }

    try {
      // For Discord, "streaming" means joining a voice channel
      // Actual audio streaming would require additional setup with @discordjs/voice
      const connection = await this.voiceChannel.join();
      
      this.isStreaming = true;
      this.streamData = {
        startTime: new Date(),
        voiceChannel: this.voiceChannel.name,
        status: 'connected'
      };

      logger.info(`Discord: Joined voice channel: ${this.voiceChannel.name}`);
      this.emit('streamStarted', { platform: this.name, streamData: this.streamData });
      
      return true;
    } catch (error) {
      logger.error('Discord: Failed to join voice channel', error);
      throw error;
    }
  }

  /**
   * Stop streaming (leave voice channel)
   */
  async stopStream() {
    if (!this.isStreaming) {
      logger.warn('Discord: Not connected to voice channel');
      return false;
    }

    try {
      if (this.voiceChannel && this.guild.members.me.voice.channel) {
        await this.guild.members.me.voice.disconnect();
      }

      this.isStreaming = false;
      this.streamData = null;
      
      logger.info('Discord: Left voice channel');
      this.emit('streamStopped', { platform: this.name });
      
      return true;
    } catch (error) {
      logger.error('Discord: Error leaving voice channel', error);
      throw error;
    }
  }

  /**
   * Connect to Discord chat
   */
  async connectChat() {
    if (this.chatConnected) {
      logger.warn('Discord: Chat already connected');
      return false;
    }

    if (!this.config.chatEnabled || !this.client || !this.client.isReady()) {
      logger.warn('Discord: Chat disabled or client not ready');
      return false;
    }

    this.chatConnected = true;
    logger.info('Discord: Chat connected successfully');
    return true;
  }

  /**
   * Disconnect from Discord chat
   */
  async disconnectChat() {
    this.chatConnected = false;
    logger.info('Discord: Chat disconnected');
  }

  /**
   * Send message to Discord
   */
  async sendMessageImplementation(message, options = {}) {
    if (!this.chatConnected || !this.client) {
      throw new Error('Discord: Chat not connected');
    }

    try {
      const channelId = options.channelId || this.textChannels.keys().next().value;
      if (!channelId) {
        throw new Error('Discord: No text channel available');
      }

      const channel = this.textChannels.get(channelId);
      if (!channel) {
        throw new Error('Discord: Channel not found');
      }

      await channel.send(message);
      
      logger.info(`Discord: Message sent to #${channel.name}: ${message}`);
      return true;
    } catch (error) {
      logger.error('Discord: Error sending message', error);
      throw error;
    }
  }

  /**
   * Send message to specific channel
   */
  async sendMessageToChannel(channelId, message) {
    return await this.sendMessage(message, { channelId });
  }

  /**
   * Broadcast message to all text channels
   */
  async broadcastMessage(message) {
    const results = [];
    
    for (const [channelId, channel] of this.textChannels) {
      try {
        await channel.send(message);
        results.push({ channelId, channel: channel.name, success: true });
        logger.info(`Discord: Broadcast message sent to #${channel.name}`);
      } catch (error) {
        results.push({ channelId, channel: channel.name, success: false, error });
        logger.error(`Discord: Failed to send broadcast to #${channel.name}`, error);
      }
    }
    
    return results;
  }

  /**
   * Handle incoming Discord messages
   */
  handleDiscordMessage(message) {
    // Ignore bot messages and system messages
    if (message.author.bot || message.system) return;

    // Only process messages from the configured guild
    if (this.config.guildId && message.guild?.id !== this.config.guildId) return;

    const messageData = {
      userId: message.author.id,
      username: message.author.username,
      message: message.content,
      timestamp: message.createdAt,
      messageId: message.id,
      channelId: message.channel.id,
      channelName: message.channel.name,
      isSubscriber: false, // Discord doesn't have subscriptions
      isModerator: message.member?.permissions.has('MODERATE_MEMBERS') || false,
      badges: this.getDiscordBadges(message.member),
      emotes: [], // Would need custom emoji parsing
      avatar: message.author.displayAvatarURL()
    };

    this.handleIncomingMessage(messageData);
  }

  /**
   * Get Discord user badges/roles
   */
  getDiscordBadges(member) {
    if (!member) return [];
    
    return member.roles.cache.map(role => ({
      name: role.name,
      color: role.hexColor,
      id: role.id
    }));
  }

  /**
   * Handle voice state updates
   */
  handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    
    if (member.id === this.client.user.id) {
      // Bot voice state changed
      if (newState.channel && !oldState.channel) {
        logger.info(`Discord: Bot joined voice channel: ${newState.channel.name}`);
      } else if (!newState.channel && oldState.channel) {
        logger.info(`Discord: Bot left voice channel: ${oldState.channel.name}`);
        this.isStreaming = false;
        this.streamData = null;
      }
    }
  }

  /**
   * Get list of available text channels
   */
  getTextChannels() {
    return Array.from(this.textChannels.values()).map(channel => ({
      id: channel.id,
      name: channel.name,
      topic: channel.topic,
      memberCount: channel.members?.size || 0
    }));
  }

  /**
   * Get voice channel information
   */
  getVoiceChannelInfo() {
    if (!this.voiceChannel) return null;
    
    return {
      id: this.voiceChannel.id,
      name: this.voiceChannel.name,
      memberCount: this.voiceChannel.members.size,
      members: this.voiceChannel.members.map(member => ({
        id: member.id,
        username: member.user.username,
        displayName: member.displayName
      }))
    };
  }

  /**
   * Check if platform has required credentials
   */
  hasRequiredCredentials() {
    return !!this.config.botToken;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    super.validateConfig();
    
    if (!this.config.botToken) {
      throw new Error('Discord: Bot token is required');
    }
    
    if (this.config.streamingEnabled && !this.config.voiceChannelId) {
      logger.warn('Discord: Voice channel ID not specified for streaming');
    }
  }

  /**
   * Get extended stream status
   */
  getStreamStatus() {
    const baseStatus = super.getStreamStatus();
    
    return {
      ...baseStatus,
      guild: this.guild ? {
        id: this.guild.id,
        name: this.guild.name,
        memberCount: this.guild.memberCount
      } : null,
      voiceChannel: this.getVoiceChannelInfo(),
      textChannels: this.getTextChannels().length,
      botUser: this.client?.user ? {
        id: this.client.user.id,
        username: this.client.user.username,
        discriminator: this.client.user.discriminator
      } : null
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.isStreaming && this.voiceChannel) {
        await this.stopStream();
      }
      
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      
      this.textChannels.clear();
      await super.cleanup();
    } catch (error) {
      logger.error('Discord: Error during cleanup', error);
    }
  }
}

module.exports = DiscordPlatform;