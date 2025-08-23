# 🎬 OBS Multistream Server

A powerful Node.js application that allows you to stream to multiple platforms simultaneously using OBS Studio. Stream to Twitch, YouTube, Facebook, and custom RTMP endpoints all at once!

## ✨ Features

- 🎯 **Multi-Platform Streaming**: Stream to Twitch, YouTube, Facebook, and custom RTMP endpoints simultaneously
- 🎛️ **Web Dashboard**: Beautiful real-time dashboard to monitor and control your streams
- 📡 **RTMP Server**: Built-in RTMP server that accepts streams from OBS
- 🔄 **Real-time Monitoring**: Live stream status, health monitoring, and error reporting
- 🐳 **Docker Support**: Easy deployment with Docker and Docker Compose
- 🛡️ **Security**: Rate limiting, security headers, and proper error handling
- 📊 **Analytics**: Stream statistics, uptime tracking, and performance metrics
- 🔧 **Manual Control**: Start/stop streams manually via the web interface

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ (or Docker)
- FFmpeg installed on your system
- OBS Studio
- Stream keys from your preferred platforms

### Option 1: Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd StreaminDoDo
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your streaming credentials:
   ```env
   # Twitch
   TWITCH_STREAM_KEY=your_twitch_stream_key_here
   TWITCH_RTMP_URL=rtmp://live.twitch.tv/live/

   # YouTube
   YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
   YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2/

   # Facebook
   FACEBOOK_STREAM_KEY=your_facebook_stream_key_here
   FACEBOOK_RTMP_URL=rtmps://live-api-s.facebook.com:443/rtmp/
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the dashboard**
   - Open http://localhost:3000 in your browser
   - RTMP endpoint: `rtmp://localhost:1935/live/YOUR_STREAM_KEY`

### Option 2: Local Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start the server**
   ```bash
   npm start
   ```

## 🎮 OBS Studio Setup

1. **Open OBS Studio**
2. **Go to Settings > Stream**
3. **Set up Custom Streaming Server:**
   - **Service**: Custom
   - **Server**: `rtmp://localhost:1935/live`
   - **Stream Key**: Any unique identifier (e.g., `my-stream-2024`)

4. **Start Streaming** - The multistream server will automatically detect your stream and forward it to all configured platforms!

## 🌐 Platform Configuration

### Twitch
1. Go to [Twitch Creator Dashboard](https://dashboard.twitch.tv/)
2. Navigate to Settings > Stream
3. Copy your Stream Key
4. Add to `.env` file as `TWITCH_STREAM_KEY`

### YouTube
1. Go to [YouTube Studio](https://studio.youtube.com/)
2. Click "Create" > "Go Live"
3. Copy your Stream Key
4. Add to `.env` file as `YOUTUBE_STREAM_KEY`

### Facebook
1. Go to [Facebook Creator Studio](https://business.facebook.com/creatorstudio/)
2. Click "Go Live"
3. Copy your Stream Key
4. Add to `.env` file as `FACEBOOK_STREAM_KEY`

### Custom RTMP Endpoints
You can add up to 2 custom RTMP endpoints:
```env
CUSTOM_RTMP_URL_1=rtmp://your-custom-server.com/live/
CUSTOM_STREAM_KEY_1=your-custom-stream-key
```

## 📊 Web Dashboard

The web dashboard provides:

- **Real-time Stream Status**: See which platforms are active
- **Platform Configuration**: View enabled/disabled platforms
- **Stream Controls**: Manually start/stop streams
- **Health Monitoring**: Track errors and uptime
- **Statistics**: Monitor performance metrics

Access at: http://localhost:3000

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | 3000 |
| `RTMP_PORT` | RTMP server port | 1935 |
| `NODE_ENV` | Environment | development |
| `LOG_LEVEL` | Logging level | info |
| `MAX_CONCURRENT_STREAMS` | Max simultaneous streams | 5 |

### Stream Quality Settings

You can customize stream quality in the manual stream controls:

- **Video Bitrate**: 2500k (recommended for 1080p)
- **Audio Bitrate**: 128k
- **Frame Rate**: 30fps
- **Keyframe Interval**: 2 seconds

## 🐳 Docker Deployment

### Development
```bash
docker-compose up
```

### Production with Nginx
```bash
docker-compose --profile proxy up -d
```

### Custom Build
```bash
docker build -t obs-multistream .
docker run -p 3000:3000 -p 1935:1935 obs-multistream
```

## 📡 API Reference

### Get Stream Status
```bash
GET /api/streams
```

### Start Stream Manually
```bash
POST /api/streams/{streamId}/start
Content-Type: application/json

{
  "inputPath": "rtmp://localhost:1935/live/stream-key"
}
```

### Stop Stream
```bash
POST /api/streams/{streamId}/stop
```

### Get Platforms
```bash
GET /api/platforms
```

### Health Check
```bash
GET /health
```

## 🔒 Security Considerations

- **Stream Keys**: Never commit stream keys to version control
- **Network Security**: Use HTTPS in production
- **Rate Limiting**: Built-in API rate limiting
- **Access Control**: Consider adding authentication for production use

## 🎯 Performance Tips

1. **Hardware**: Use a dedicated server with good CPU and network
2. **Bandwidth**: Ensure sufficient upload bandwidth for all platforms
3. **Monitoring**: Watch the dashboard for errors and performance issues
4. **Quality**: Adjust stream quality based on your hardware capabilities

## 🐛 Troubleshooting

### Common Issues

**Stream not starting:**
- Check FFmpeg installation
- Verify stream keys are correct
- Check network connectivity

**High CPU usage:**
- Reduce stream quality settings
- Limit number of platforms
- Check hardware specifications

**Connection errors:**
- Verify RTMP URLs are correct
- Check firewall settings
- Test individual platform connections

### Logs

View logs for debugging:
```bash
# Docker
docker-compose logs obs-multistream

# Local
tail -f logs/multistream.log
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [node-media-server](https://github.com/illuspas/Node-Media-Server) for RTMP handling
- [FFmpeg](https://ffmpeg.org/) for video processing
- [OBS Studio](https://obsproject.com/) for streaming software

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section
2. Review the logs for error messages
3. Open an issue on GitHub
4. Join our Discord community

---

**Happy Streaming! 🎉**

Made with ❤️ by the StreaminDoDo team