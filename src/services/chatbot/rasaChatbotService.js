const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * RASA Chatbot Service
 * Handles communication with RASA NLU/Core for intelligent chatbot responses
 */
class RasaChatbotService extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      rasaApiUrl: config.rasaApiUrl || process.env.RASA_API_URL || 'http://localhost:5005',
      actionsEndpoint: config.actionsEndpoint || process.env.RASA_ACTIONS_ENDPOINT || 'http://localhost:5055/webhook',
      confidenceThreshold: parseFloat(config.confidenceThreshold || process.env.CHATBOT_CONFIDENCE_THRESHOLD || '0.7'),
      fallbackMessage: config.fallbackMessage || process.env.CHATBOT_FALLBACK_MESSAGE || "Sorry, I didn't understand that. Can you please rephrase?",
      defaultLanguage: config.defaultLanguage || process.env.CHATBOT_DEFAULT_LANGUAGE || 'en',
      maxResponseLength: parseInt(config.maxResponseLength || process.env.CHATBOT_MAX_RESPONSE_LENGTH || '280'),
      responseDelay: parseInt(config.responseDelay || process.env.CHATBOT_RESPONSE_DELAY || '1000'),
      ...config
    };
    
    this.isConnected = false;
    this.sessionStore = new Map(); // Store conversation sessions
    this.messageHistory = [];
    this.responseCache = new Map(); // Cache for common responses
    this.cacheExpiryTime = 5 * 60 * 1000; // 5 minutes
    this.socialMediaManager = null;
    
    this.setupResponseCache();
  }

  /**
   * Initialize the RASA chatbot service
   */
  async initialize(socialMediaManager) {
    try {
      this.socialMediaManager = socialMediaManager;
      
      // Test connection to RASA server
      await this.testConnection();
      
      // Load or train model if needed
      await this.ensureModelLoaded();
      
      this.isConnected = true;
      logger.info('RASA Chatbot Service: Initialized successfully');
      
      this.emit('connected');
      return true;
    } catch (error) {
      logger.error('RASA Chatbot Service: Failed to initialize', error);
      throw error;
    }
  }

  /**
   * Test connection to RASA server
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.config.rasaApiUrl}/status`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        logger.info('RASA Chatbot Service: Connection test successful', response.data);
        return true;
      } else {
        throw new Error(`RASA server returned status ${response.status}`);
      }
    } catch (error) {
      logger.error('RASA Chatbot Service: Connection test failed', error);
      throw new Error(`Cannot connect to RASA server at ${this.config.rasaApiUrl}: ${error.message}`);
    }
  }

  /**
   * Ensure RASA model is loaded
   */
  async ensureModelLoaded() {
    try {
      // Check if model is loaded
      const statusResponse = await axios.get(`${this.config.rasaApiUrl}/status`);
      
      if (!statusResponse.data.model_file) {
        logger.warn('RASA Chatbot Service: No model loaded, attempting to load default model');
        
        // Try to load the latest model
        await this.loadLatestModel();
      } else {
        logger.info('RASA Chatbot Service: Model already loaded', {
          model: statusResponse.data.model_file
        });
      }
    } catch (error) {
      logger.error('RASA Chatbot Service: Error checking/loading model', error);
      throw error;
    }
  }

  /**
   * Load the latest trained model
   */
  async loadLatestModel() {
    try {
      // Get list of trained models
      const modelsResponse = await axios.get(`${this.config.rasaApiUrl}/models`);
      const models = modelsResponse.data;
      
      if (models && models.length > 0) {
        // Load the most recent model
        const latestModel = models[0];
        await axios.put(`${this.config.rasaApiUrl}/models/${latestModel}`);
        
        logger.info('RASA Chatbot Service: Latest model loaded', { model: latestModel });
      } else {
        throw new Error('No trained models available');
      }
    } catch (error) {
      logger.error('RASA Chatbot Service: Error loading model', error);
      throw error;
    }
  }

  /**
   * Process incoming message and generate response
   */
  async processMessage(messageData) {
    if (!this.isConnected) {
      logger.warn('RASA Chatbot Service: Not connected, skipping message processing');
      return null;
    }

    try {
      const sessionId = this.getSessionId(messageData);
      const message = messageData.message.trim();
      
      // Log the incoming message
      this.logInteraction(messageData, null, 'received');
      
      // Check cache first for common responses
      const cachedResponse = this.getCachedResponse(message);
      if (cachedResponse) {
        logger.info('RASA Chatbot Service: Using cached response', { message: message.substring(0, 50) });
        return cachedResponse;
      }

      // Send message to RASA for processing
      const rasaResponse = await this.sendToRasa(message, sessionId, messageData);
      
      if (rasaResponse && rasaResponse.length > 0) {
        const response = this.processRasaResponse(rasaResponse, messageData);
        
        // Cache the response if it's a common pattern
        this.cacheResponse(message, response);
        
        // Log the response
        this.logInteraction(messageData, response, 'sent');
        
        return response;
      } else {
        // Use fallback message
        const fallbackResponse = {
          text: this.config.fallbackMessage,
          confidence: 0.0,
          intent: 'fallback'
        };
        
        this.logInteraction(messageData, fallbackResponse, 'fallback');
        return fallbackResponse;
      }
    } catch (error) {
      logger.error('RASA Chatbot Service: Error processing message', error);
      
      // Return fallback response on error
      return {
        text: this.config.fallbackMessage,
        confidence: 0.0,
        intent: 'error'
      };
    }
  }

  /**
   * Send message to RASA for processing
   */
  async sendToRasa(message, sessionId, messageData) {
    try {
      const payload = {
        sender: sessionId,
        message: message,
        metadata: {
          platform: messageData.platform,
          username: messageData.username,
          userId: messageData.userId,
          timestamp: messageData.timestamp,
          isSubscriber: messageData.isSubscriber,
          isModerator: messageData.isModerator
        }
      };

      const response = await axios.post(
        `${this.config.rasaApiUrl}/webhooks/rest/webhook`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logger.error('RASA Chatbot Service: Error sending to RASA', error);
      throw error;
    }
  }

  /**
   * Process RASA response and format for output
   */
  processRasaResponse(rasaResponse, messageData) {
    try {
      // RASA returns an array of responses
      const firstResponse = rasaResponse[0];
      
      if (!firstResponse || !firstResponse.text) {
        return null;
      }

      let responseText = firstResponse.text;
      
      // Truncate if too long
      if (responseText.length > this.config.maxResponseLength) {
        responseText = responseText.substring(0, this.config.maxResponseLength - 3) + '...';
      }

      // Add platform-specific formatting if needed
      responseText = this.formatResponseForPlatform(responseText, messageData.platform);

      return {
        text: responseText,
        confidence: firstResponse.confidence || 0.8,
        intent: firstResponse.intent || 'unknown',
        entities: firstResponse.entities || [],
        buttons: firstResponse.buttons || [],
        image: firstResponse.image || null,
        custom: firstResponse.custom || null
      };
    } catch (error) {
      logger.error('RASA Chatbot Service: Error processing RASA response', error);
      return null;
    }
  }

  /**
   * Format response for specific platform
   */
  formatResponseForPlatform(text, platform) {
    switch (platform) {
      case 'twitter':
        // Add hashtags or mentions if needed
        return text;
      case 'discord':
        // Discord supports markdown formatting
        return text;
      case 'telegram':
        // Telegram supports markdown
        return text;
      default:
        return text;
    }
  }

  /**
   * Get or create session ID for user
   */
  getSessionId(messageData) {
    const sessionKey = `${messageData.platform}_${messageData.userId}`;
    
    if (!this.sessionStore.has(sessionKey)) {
      this.sessionStore.set(sessionKey, {
        id: sessionKey,
        platform: messageData.platform,
        userId: messageData.userId,
        username: messageData.username,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0
      });
    }

    // Update last activity
    const session = this.sessionStore.get(sessionKey);
    session.lastActivity = new Date();
    session.messageCount++;
    
    return sessionKey;
  }

  /**
   * Setup response cache with common patterns
   */
  setupResponseCache() {
    const commonResponses = [
      { pattern: /^(hi|hello|hey)$/i, response: { text: "Hello! 👋 Welcome to the stream!", confidence: 1.0, intent: 'greet' } },
      { pattern: /^(bye|goodbye|cya)$/i, response: { text: "Goodbye! Thanks for watching! 👋", confidence: 1.0, intent: 'goodbye' } },
      { pattern: /^(thanks|thank you|thx)$/i, response: { text: "You're welcome! 😊", confidence: 1.0, intent: 'affirm' } },
      { pattern: /^(lol|haha|😂)$/i, response: { text: "Glad you're enjoying it! 😄", confidence: 1.0, intent: 'mood_great' } }
    ];

    commonResponses.forEach(({ pattern, response }) => {
      this.responseCache.set(pattern.toString(), {
        response,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Get cached response for common patterns
   */
  getCachedResponse(message) {
    for (const [pattern, cache] of this.responseCache) {
      // Check if cache is still valid
      if (Date.now() - cache.timestamp > this.cacheExpiryTime) {
        this.responseCache.delete(pattern);
        continue;
      }

      // Convert string pattern back to regex
      const regex = new RegExp(pattern.slice(1, -2), pattern.slice(-1));
      if (regex.test(message)) {
        return cache.response;
      }
    }
    return null;
  }

  /**
   * Cache response for future use
   */
  cacheResponse(message, response) {
    // Only cache short, common messages
    if (message.length <= 20 && response.confidence > 0.8) {
      const pattern = new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      this.responseCache.set(pattern.toString(), {
        response,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Log interaction for analytics
   */
  logInteraction(messageData, response, type) {
    const interaction = {
      timestamp: new Date(),
      type, // 'received', 'sent', 'fallback', 'error'
      platform: messageData.platform,
      userId: messageData.userId,
      username: messageData.username,
      message: messageData.message,
      response: response ? response.text : null,
      confidence: response ? response.confidence : null,
      intent: response ? response.intent : null
    };

    this.messageHistory.push(interaction);
    
    // Keep only last 1000 interactions
    if (this.messageHistory.length > 1000) {
      this.messageHistory.shift();
    }

    // Emit event for external logging/analytics
    this.emit('interaction', interaction);
  }

  /**
   * Get chatbot statistics
   */
  getStatistics() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    const recentInteractions = this.messageHistory.filter(
      interaction => now - interaction.timestamp < oneHour
    );

    const dailyInteractions = this.messageHistory.filter(
      interaction => now - interaction.timestamp < oneDay
    );

    return {
      isConnected: this.isConnected,
      totalInteractions: this.messageHistory.length,
      recentInteractions: recentInteractions.length,
      dailyInteractions: dailyInteractions.length,
      activeSessions: this.sessionStore.size,
      cacheSize: this.responseCache.size,
      averageConfidence: this.calculateAverageConfidence(),
      topIntents: this.getTopIntents(),
      platformBreakdown: this.getPlatformBreakdown()
    };
  }

  /**
   * Calculate average confidence of responses
   */
  calculateAverageConfidence() {
    const responses = this.messageHistory.filter(i => i.confidence !== null);
    if (responses.length === 0) return 0;
    
    const totalConfidence = responses.reduce((sum, i) => sum + i.confidence, 0);
    return totalConfidence / responses.length;
  }

  /**
   * Get top intents
   */
  getTopIntents() {
    const intentCounts = {};
    this.messageHistory.forEach(interaction => {
      if (interaction.intent) {
        intentCounts[interaction.intent] = (intentCounts[interaction.intent] || 0) + 1;
      }
    });

    return Object.entries(intentCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([intent, count]) => ({ intent, count }));
  }

  /**
   * Get platform breakdown
   */
  getPlatformBreakdown() {
    const platformCounts = {};
    this.messageHistory.forEach(interaction => {
      platformCounts[interaction.platform] = (platformCounts[interaction.platform] || 0) + 1;
    });

    return Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }));
  }

  /**
   * Train RASA model with new data
   */
  async trainModel(trainingData) {
    try {
      logger.info('RASA Chatbot Service: Starting model training');
      
      const response = await axios.post(
        `${this.config.rasaApiUrl}/model/train`,
        trainingData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5 minutes for training
        }
      );

      logger.info('RASA Chatbot Service: Model training completed', response.data);
      return response.data;
    } catch (error) {
      logger.error('RASA Chatbot Service: Model training failed', error);
      throw error;
    }
  }

  /**
   * Cleanup sessions and cache
   */
  cleanup() {
    const now = Date.now();
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes

    // Clean up old sessions
    for (const [key, session] of this.sessionStore) {
      if (now - session.lastActivity.getTime() > sessionTimeout) {
        this.sessionStore.delete(key);
      }
    }

    // Clean up expired cache entries
    for (const [key, cache] of this.responseCache) {
      if (now - cache.timestamp > this.cacheExpiryTime) {
        this.responseCache.delete(key);
      }
    }

    logger.info('RASA Chatbot Service: Cleanup completed', {
      activeSessions: this.sessionStore.size,
      cacheSize: this.responseCache.size
    });
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    try {
      this.isConnected = false;
      this.cleanup();
      this.removeAllListeners();
      
      logger.info('RASA Chatbot Service: Shutdown completed');
    } catch (error) {
      logger.error('RASA Chatbot Service: Error during shutdown', error);
    }
  }
}

module.exports = RasaChatbotService;