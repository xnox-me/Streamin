require('dotenv').config();
const path = require('path');

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  rtmpPort: process.env.RTMP_PORT || 1935,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Streaming platforms configuration
  platforms: {
    twitch: {
      rtmpUrl: process.env.TWITCH_RTMP_URL || 'rtmp://live.twitch.tv/live/',
      streamKey: process.env.TWITCH_STREAM_KEY || '',
      enabled: !!process.env.TWITCH_STREAM_KEY
    },
    youtube: {
      rtmpUrl: process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2/',
      streamKey: process.env.YOUTUBE_STREAM_KEY || '',
      enabled: !!process.env.YOUTUBE_STREAM_KEY
    },
    facebook: {
      rtmpUrl: process.env.FACEBOOK_RTMP_URL || 'rtmps://live-api-s.facebook.com:443/rtmp/',
      streamKey: process.env.FACEBOOK_STREAM_KEY || '',
      enabled: !!process.env.FACEBOOK_STREAM_KEY
    },
    custom1: {
      rtmpUrl: process.env.CUSTOM_RTMP_URL_1 || '',
      streamKey: process.env.CUSTOM_STREAM_KEY_1 || '',
      enabled: !!(process.env.CUSTOM_RTMP_URL_1 && process.env.CUSTOM_STREAM_KEY_1)
    },
    custom2: {
      rtmpUrl: process.env.CUSTOM_RTMP_URL_2 || '',
      streamKey: process.env.CUSTOM_STREAM_KEY_2 || '',
      enabled: !!(process.env.CUSTOM_RTMP_URL_2 && process.env.CUSTOM_STREAM_KEY_2)
    }
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '../../logs/multistream.log')
  },
  
  // Stream settings
  stream: {
    maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 5,
    timeout: parseInt(process.env.STREAM_TIMEOUT) || 30000,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 5000
  },
  
  // RTMP server configuration
  rtmp: {
    port: process.env.RTMP_PORT || 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  
  // HTTP server configuration
  http: {
    port: process.env.PORT || 3000,
    mediaroot: path.join(__dirname, '../../public')
  },
  
  // FFmpeg settings
  ffmpeg: {
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe'
  }
};

// Validate required configurations
const validateConfig = () => {
  const enabledPlatforms = Object.keys(config.platforms).filter(
    platform => config.platforms[platform].enabled
  );
  
  if (enabledPlatforms.length === 0) {
    console.warn('Warning: No streaming platforms configured. Please set up at least one platform in your .env file.');
  }
  
  return config;
};

module.exports = validateConfig();