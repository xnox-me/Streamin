const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class MultistreamService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map(); // streamId -> { ffmpegProcesses: [], status: 'active', startTime: Date }
    this.streamStats = new Map(); // streamId -> { platforms: {}, errors: [], uptime: 0 }
    
    // Set FFmpeg paths if configured
    if (config.ffmpeg.ffmpegPath) {
      ffmpeg.setFfmpegPath(config.ffmpeg.ffmpegPath);
    }
    if (config.ffmpeg.ffprobePath) {
      ffmpeg.setFfprobePath(config.ffmpeg.ffprobePath);
    }
  }

  /**
   * Start multistreaming to all enabled platforms
   * @param {string} streamId - Unique identifier for the stream
   * @param {string} inputPath - RTMP input path (e.g., rtmp://localhost:1935/live/STREAM_NAME)
   * @param {Object} options - Streaming options
   */
  async startMultistream(streamId, inputPath, options = {}) {
    try {
      if (this.activeStreams.has(streamId)) {
        throw new Error(`Stream ${streamId} is already active`);
      }

      const enabledPlatforms = this.getEnabledPlatforms();
      if (enabledPlatforms.length === 0) {
        throw new Error('No streaming platforms are configured');
      }

      logger.streamInfo(streamId, `Starting multistream to ${enabledPlatforms.length} platforms`, {
        platforms: enabledPlatforms.map(p => p.name),
        inputPath
      });

      const ffmpegProcesses = [];
      const streamInfo = {
        ffmpegProcesses,
        status: 'starting',
        startTime: new Date(),
        inputPath,
        platforms: enabledPlatforms.map(p => p.name)
      };

      this.activeStreams.set(streamId, streamInfo);
      this.streamStats.set(streamId, {
        platforms: {},
        errors: [],
        uptime: 0,
        startTime: new Date()
      });

      // Create FFmpeg process for each platform
      for (const platform of enabledPlatforms) {
        try {
          const process = await this.createStreamProcess(streamId, inputPath, platform, options);
          ffmpegProcesses.push({
            process,
            platform: platform.name,
            status: 'running'
          });
        } catch (error) {
          logger.streamError(streamId, `Failed to start stream to ${platform.name}`, error);
          this.recordError(streamId, platform.name, error);
        }
      }

      if (ffmpegProcesses.length === 0) {
        this.stopMultistream(streamId);
        throw new Error('Failed to start any streams');
      }

      streamInfo.status = 'active';
      this.emit('streamStarted', { streamId, platforms: ffmpegProcesses.map(p => p.platform) });
      
      logger.streamInfo(streamId, `Multistream started successfully to ${ffmpegProcesses.length} platforms`);
      return { streamId, activePlatforms: ffmpegProcesses.length, totalPlatforms: enabledPlatforms.length };

    } catch (error) {
      logger.streamError(streamId, 'Failed to start multistream', error);
      this.stopMultistream(streamId);
      throw error;
    }
  }

  /**
   * Create FFmpeg process for a specific platform
   */
  async createStreamProcess(streamId, inputPath, platform, options) {
    return new Promise((resolve, reject) => {
      const outputUrl = `${platform.rtmpUrl}${platform.streamKey}`;
      
      logger.streamDebug(streamId, `Creating stream process for ${platform.name}`, { outputUrl: platform.rtmpUrl });

      const command = ffmpeg(inputPath)
        .inputOptions([
          '-re', // Read input at native frame rate
          '-fflags', '+genpts' // Generate presentation timestamps
        ])
        .outputOptions([
          '-c:v', 'libx264', // Video codec
          '-preset', options.preset || 'veryfast', // Encoding preset
          '-tune', options.tune || 'zerolatency', // Tune for low latency
          '-c:a', 'aac', // Audio codec
          '-b:a', options.audioBitrate || '128k', // Audio bitrate
          '-ar', '44100', // Audio sample rate
          '-r', options.framerate || '30', // Frame rate
          '-g', options.keyframeInterval || '60', // Keyframe interval
          '-f', 'flv' // Output format
        ]);

      // Set video quality options
      if (options.videoBitrate) {
        command.outputOptions(['-b:v', options.videoBitrate]);
      }
      if (options.maxBitrate) {
        command.outputOptions(['-maxrate', options.maxBitrate, '-bufsize', options.bufsize || '2M']);
      }

      command
        .output(outputUrl)
        .on('start', (commandLine) => {
          logger.streamDebug(streamId, `FFmpeg process started for ${platform.name}`, { command: commandLine });
          this.updatePlatformStatus(streamId, platform.name, 'connected');
        })
        .on('progress', (progress) => {
          this.updatePlatformStats(streamId, platform.name, progress);
        })
        .on('error', (error) => {
          logger.streamError(streamId, `FFmpeg error for ${platform.name}`, error);
          this.updatePlatformStatus(streamId, platform.name, 'error');
          this.recordError(streamId, platform.name, error);
          this.emit('streamError', { streamId, platform: platform.name, error });
        })
        .on('end', () => {
          logger.streamInfo(streamId, `Stream ended for ${platform.name}`);
          this.updatePlatformStatus(streamId, platform.name, 'ended');
          this.emit('streamEnded', { streamId, platform: platform.name });
        });

      // Start the process
      command.run();
      resolve(command);
    });
  }

  /**
   * Stop multistream for a specific stream ID
   */
  stopMultistream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) {
      logger.streamWarn(streamId, 'Attempted to stop non-existent stream');
      return false;
    }

    logger.streamInfo(streamId, 'Stopping multistream');

    // Kill all FFmpeg processes
    streamInfo.ffmpegProcesses.forEach(({ process, platform }) => {
      try {
        process.kill('SIGTERM');
        logger.streamDebug(streamId, `Stopped stream process for ${platform}`);
      } catch (error) {
        logger.streamError(streamId, `Error stopping stream process for ${platform}`, error);
      }
    });

    // Clean up
    this.activeStreams.delete(streamId);
    
    // Keep stats for a while for reporting
    setTimeout(() => {
      this.streamStats.delete(streamId);
    }, 300000); // 5 minutes

    this.emit('streamStopped', { streamId });
    return true;
  }

  /**
   * Get all enabled platforms
   */
  getEnabledPlatforms() {
    return Object.entries(config.platforms)
      .filter(([_, platform]) => platform.enabled && platform.rtmpUrl && platform.streamKey)
      .map(([name, platform]) => ({ name, ...platform }));
  }

  /**
   * Get stream status
   */
  getStreamStatus(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    const stats = this.streamStats.get(streamId);
    
    if (!streamInfo) {
      return null;
    }

    return {
      streamId,
      status: streamInfo.status,
      startTime: streamInfo.startTime,
      platforms: streamInfo.ffmpegProcesses.map(p => ({
        name: p.platform,
        status: p.status
      })),
      stats: stats || {},
      uptime: Date.now() - streamInfo.startTime.getTime()
    };
  }

  /**
   * Get all active streams
   */
  getAllActiveStreams() {
    return Array.from(this.activeStreams.keys()).map(streamId => 
      this.getStreamStatus(streamId)
    );
  }

  /**
   * Update platform status
   */
  updatePlatformStatus(streamId, platform, status) {
    const stats = this.streamStats.get(streamId);
    if (stats) {
      if (!stats.platforms[platform]) {
        stats.platforms[platform] = {};
      }
      stats.platforms[platform].status = status;
      stats.platforms[platform].lastUpdate = new Date();
    }
  }

  /**
   * Update platform streaming statistics
   */
  updatePlatformStats(streamId, platform, progress) {
    const stats = this.streamStats.get(streamId);
    if (stats) {
      if (!stats.platforms[platform]) {
        stats.platforms[platform] = {};
      }
      stats.platforms[platform].progress = progress;
      stats.platforms[platform].lastUpdate = new Date();
    }
  }

  /**
   * Record error for a platform
   */
  recordError(streamId, platform, error) {
    const stats = this.streamStats.get(streamId);
    if (stats) {
      stats.errors.push({
        platform,
        error: error.message || error.toString(),
        timestamp: new Date()
      });
      
      // Keep only last 10 errors
      if (stats.errors.length > 10) {
        stats.errors = stats.errors.slice(-10);
      }
    }
  }

  /**
   * Health check for all active streams
   */
  performHealthCheck() {
    const activeStreamIds = Array.from(this.activeStreams.keys());
    
    activeStreamIds.forEach(streamId => {
      const streamInfo = this.activeStreams.get(streamId);
      if (streamInfo) {
        // Check if any processes have died
        const alivePlatforms = streamInfo.ffmpegProcesses.filter(p => {
          // Simple check - in a real implementation, you'd want more sophisticated health checking
          return p.status === 'running';
        });

        if (alivePlatforms.length === 0) {
          logger.streamWarn(streamId, 'All platforms disconnected, stopping stream');
          this.stopMultistream(streamId);
        }
      }
    });
  }
}

module.exports = new MultistreamService();