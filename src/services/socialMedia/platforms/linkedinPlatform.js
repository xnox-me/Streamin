const BasePlatform = require('../basePlatform');
const logger = require('../../../utils/logger');

class LinkedInPlatform extends BasePlatform {
  async initialize() { 
    this.handleConnection(); 
    return true; 
  }
  
  async startStream() { 
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
  
  async sendMessageImplementation(message) { 
    logger.info(`LinkedIn: ${message}`); 
    return true; 
  }
  
  hasRequiredCredentials() { 
    return !!this.config.accessToken; 
  }
}

module.exports = LinkedInPlatform;