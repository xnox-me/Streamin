const BasePlatform = require('../basePlatform');
const { Telegraf } = require('telegraf');
const logger = require('../../../utils/logger');

/**
 * Telegram Platform Integration
 * Handles bot interactions and messaging
 */
class TelegramPlatform extends BasePlatform {
  constructor(config, name) {
    super(config, name);
    this.bot = null;
    this.activeChats = new Map();
    this.messageRateLimit = 1000; // Telegram allows 30 messages per second
  }

  /**
   * Initialize Telegram bot
   */
  async initialize() {
    this.validateConfig();
    
    if (!this.hasRequiredCredentials()) {
      throw new Error('Telegram: Missing required credentials');
    }

    try {
      this.bot = new Telegraf(this.config.botToken);
      
      this.setupEventListeners();
      
      // Get bot info
      const botInfo = await this.bot.telegram.getMe();
      logger.info(`Telegram: Bot initialized as @${botInfo.username}`);
      
      this.handleConnection();
      return true;
    } catch (error) {
      logger.error('Telegram: Failed to initialize bot', error);
      throw error;
    }
  }

  /**
   * Set up Telegram bot event listeners
   */
  setupEventListeners() {
    // Handle all text messages
    this.bot.on('text', (ctx) => {
      this.handleTelegramMessage(ctx);
    });

    // Handle commands
    this.bot.command('start', (ctx) => {
      ctx.reply('Hello! I am the StreaminDoDo chatbot. Send me a message and I will respond!');
      this.addActiveChat(ctx.chat.id, ctx.chat);
    });

    this.bot.command('help', (ctx) => {
      const helpMessage = `
🤖 StreaminDoDo Chatbot Commands:

/start - Start the bot
/help - Show this help message
/status - Show streaming status
/info - Show bot information

Just send me any message and I'll respond using AI!
      `;
      ctx.reply(helpMessage);
    });

    this.bot.command('status', async (ctx) => {
      const status = this.getStreamStatus();
      const statusMessage = `
📊 Current Status:
🔗 Connected: ${status.isConnected ? '✅' : '❌'}
💬 Chat: ${status.chatConnected ? '✅' : '❌'}
🎥 Streaming: ${status.isStreaming ? '✅' : '❌'}
      `;
      ctx.reply(statusMessage);
    });

    this.bot.command('info', async (ctx) => {
      const botInfo = await this.bot.telegram.getMe();
      const infoMessage = `
🤖 Bot Information:
👤 Username: @${botInfo.username}
🆔 ID: ${botInfo.id}
📝 Name: ${botInfo.first_name}
💬 Active Chats: ${this.activeChats.size}
      `;
      ctx.reply(infoMessage);
    });

    // Handle errors
    this.bot.catch((err, ctx) => {
      logger.error('Telegram: Bot error', err);
      this.handleError(err);
    });

    // Handle new members
    this.bot.on('new_chat_members', (ctx) => {
      const newMembers = ctx.message.new_chat_members;
      newMembers.forEach(member => {
        if (member.id === this.bot.botInfo.id) {
          ctx.reply('Hello! I am the StreaminDoDo chatbot. Use /help to see available commands.');
          this.addActiveChat(ctx.chat.id, ctx.chat);
        }
      });
    });

    // Handle when bot is removed from group
    this.bot.on('left_chat_member', (ctx) => {
      const leftMember = ctx.message.left_chat_member;
      if (leftMember.id === this.bot.botInfo.id) {
        this.removeActiveChat(ctx.chat.id);
      }
    });
  }

  /**
   * Start streaming (not applicable for Telegram)
   */
  async startStream(streamKey, inputPath) {
    logger.warn('Telegram: Streaming not supported');
    return false;
  }

  /**
   * Stop streaming (not applicable for Telegram)
   */
  async stopStream() {
    logger.warn('Telegram: Streaming not supported');
    return false;
  }

  /**
   * Connect to Telegram chat
   */
  async connectChat() {
    if (this.chatConnected) {
      logger.warn('Telegram: Chat already connected');
      return false;
    }

    if (!this.config.chatEnabled || !this.bot) {
      logger.warn('Telegram: Chat disabled or bot not initialized');
      return false;
    }

    try {
      // Start polling for messages
      await this.bot.launch({
        polling: {
          timeout: 30,
          limit: 100
        }
      });

      this.chatConnected = true;
      logger.info('Telegram: Chat connected and polling started');
      
      // Add configured chat if specified
      if (this.config.chatId) {
        try {
          const chat = await this.bot.telegram.getChat(this.config.chatId);
          this.addActiveChat(this.config.chatId, chat);
        } catch (error) {
          logger.warn('Telegram: Could not add configured chat', error);
        }
      }

      return true;
    } catch (error) {
      logger.error('Telegram: Failed to connect chat', error);
      throw error;
    }
  }

  /**
   * Disconnect from Telegram chat
   */
  async disconnectChat() {
    if (this.bot) {
      try {
        await this.bot.stop();
        this.chatConnected = false;
        logger.info('Telegram: Chat disconnected and polling stopped');
      } catch (error) {
        logger.error('Telegram: Error disconnecting chat', error);
      }
    }
  }

  /**
   * Send message to Telegram
   */
  async sendMessageImplementation(message, options = {}) {
    if (!this.chatConnected || !this.bot) {
      throw new Error('Telegram: Chat not connected');
    }

    try {
      const chatId = options.chatId || this.config.chatId;
      
      if (!chatId && this.activeChats.size === 0) {
        throw new Error('Telegram: No chat ID specified and no active chats');
      }

      if (chatId) {
        // Send to specific chat
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        logger.info(`Telegram: Message sent to chat ${chatId}: ${message}`);
      } else {
        // Send to all active chats
        const sendPromises = Array.from(this.activeChats.keys()).map(async (chatId) => {
          try {
            await this.bot.telegram.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
            return { chatId, success: true };
          } catch (error) {
            logger.error(`Telegram: Failed to send message to chat ${chatId}`, error);
            return { chatId, success: false, error };
          }
        });

        await Promise.allSettled(sendPromises);
        logger.info(`Telegram: Message broadcast to ${this.activeChats.size} chats: ${message}`);
      }

      return true;
    } catch (error) {
      logger.error('Telegram: Error sending message', error);
      throw error;
    }
  }

  /**
   * Send message to specific chat
   */
  async sendMessageToChat(chatId, message) {
    return await this.sendMessage(message, { chatId });
  }

  /**
   * Broadcast message to all active chats
   */
  async broadcastMessage(message) {
    const results = [];
    
    for (const [chatId, chat] of this.activeChats) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        results.push({ chatId, chatTitle: chat.title || chat.username, success: true });
        logger.info(`Telegram: Broadcast message sent to chat: ${chat.title || chat.username}`);
      } catch (error) {
        results.push({ chatId, chatTitle: chat.title || chat.username, success: false, error });
        logger.error(`Telegram: Failed to send broadcast to chat: ${chat.title || chat.username}`, error);
      }
    }
    
    return results;
  }

  /**
   * Handle incoming Telegram messages
   */
  handleTelegramMessage(ctx) {
    const message = ctx.message;
    
    // Skip if no text content
    if (!message.text) return;

    // Add chat to active chats
    this.addActiveChat(message.chat.id, message.chat);

    const messageData = {
      userId: message.from.id.toString(),
      username: message.from.username || message.from.first_name,
      message: message.text,
      timestamp: new Date(message.date * 1000),
      messageId: message.message_id.toString(),
      chatId: message.chat.id,
      chatTitle: message.chat.title,
      chatType: message.chat.type,
      isSubscriber: false, // Telegram doesn't have subscriptions
      isModerator: this.isUserAdmin(ctx),
      badges: this.getTelegramBadges(message.from, ctx),
      emotes: [], // Would need custom emoji parsing
      firstName: message.from.first_name,
      lastName: message.from.last_name
    };

    this.handleIncomingMessage(messageData);
  }

  /**
   * Check if user is admin in the chat
   */
  isUserAdmin(ctx) {
    try {
      if (ctx.chat.type === 'private') return false;
      
      // For groups and supergroups, check admin status
      // Note: This would need to be cached or checked asynchronously for performance
      return false; // Simplified for now
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Telegram user badges/status
   */
  getTelegramBadges(user, ctx) {
    const badges = [];
    
    if (user.is_bot) {
      badges.push({ name: 'bot', type: 'system' });
    }
    
    if (user.is_premium) {
      badges.push({ name: 'premium', type: 'premium' });
    }
    
    // Add chat-specific badges if in a group
    if (ctx.chat.type !== 'private') {
      // Would need to check admin status asynchronously
    }
    
    return badges;
  }

  /**
   * Add active chat
   */
  addActiveChat(chatId, chatInfo) {
    this.activeChats.set(chatId, {
      id: chatId,
      type: chatInfo.type,
      title: chatInfo.title,
      username: chatInfo.username,
      description: chatInfo.description,
      addedAt: new Date()
    });
    
    logger.info(`Telegram: Added active chat: ${chatInfo.title || chatInfo.username || chatId}`);
  }

  /**
   * Remove active chat
   */
  removeActiveChat(chatId) {
    const chat = this.activeChats.get(chatId);
    if (chat) {
      this.activeChats.delete(chatId);
      logger.info(`Telegram: Removed active chat: ${chat.title || chat.username || chatId}`);
    }
  }

  /**
   * Get list of active chats
   */
  getActiveChats() {
    return Array.from(this.activeChats.values());
  }

  /**
   * Send photo to chat
   */
  async sendPhoto(chatId, photo, caption = '') {
    if (!this.chatConnected || !this.bot) {
      throw new Error('Telegram: Chat not connected');
    }

    try {
      await this.bot.telegram.sendPhoto(chatId, photo, {
        caption,
        parse_mode: 'Markdown'
      });
      
      logger.info(`Telegram: Photo sent to chat ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Telegram: Error sending photo', error);
      throw error;
    }
  }

  /**
   * Send document to chat
   */
  async sendDocument(chatId, document, caption = '') {
    if (!this.chatConnected || !this.bot) {
      throw new Error('Telegram: Chat not connected');
    }

    try {
      await this.bot.telegram.sendDocument(chatId, document, {
        caption,
        parse_mode: 'Markdown'
      });
      
      logger.info(`Telegram: Document sent to chat ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Telegram: Error sending document', error);
      throw error;
    }
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
      throw new Error('Telegram: Bot token is required');
    }
  }

  /**
   * Get extended stream status
   */
  getStreamStatus() {
    const baseStatus = super.getStreamStatus();
    
    return {
      ...baseStatus,
      activeChats: this.activeChats.size,
      chats: this.getActiveChats(),
      botInfo: this.bot?.botInfo ? {
        id: this.bot.botInfo.id,
        username: this.bot.botInfo.username,
        firstName: this.bot.botInfo.first_name
      } : null
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      await this.disconnectChat();
      this.activeChats.clear();
      await super.cleanup();
    } catch (error) {
      logger.error('Telegram: Error during cleanup', error);
    }
  }
}

module.exports = TelegramPlatform;