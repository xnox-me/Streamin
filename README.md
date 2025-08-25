# 🎬 StreaminDoDo - Enhanced Multistream Server with AI Chatbot

A powerful Node.js application that allows you to stream to multiple platforms simultaneously using OBS Studio, with integrated social media chat and AI-powered chatbot responses using RASA AI. Stream to Twitch, YouTube, Facebook, Instagram, TikTok, LinkedIn, Twitter/X, Discord, Telegram, and more - all while having an intelligent chatbot interact with your audience!

## ✨ Enhanced Features

### 🎯 **Multi-Platform Streaming**
- Stream to **12+ platforms** simultaneously: Twitch, YouTube, Facebook, Instagram, TikTok, LinkedIn, Twitter/X, Discord, Telegram, Kick, Rumble, Odysee
- Custom RTMP endpoints support
- Real-time stream health monitoring
- Auto-retry and failover mechanisms

### 🤖 **AI-Powered Chatbot**
- **RASA AI integration** for intelligent responses
- Cross-platform chat monitoring and response
- Contextual understanding and conversation memory
- Customizable responses and training data
- Real-time interaction analytics
- Support for multiple languages

### 💬 **Advanced Social Media Integration**
- **Real-time chat monitoring** across all platforms
- **Unified chat interface** in the web dashboard
- **Automated responses** via AI chatbot
- **Message history and analytics**
- **Rate limiting and spam protection**
- **Moderator tools and controls**

### 🎛️ **Enhanced Web Dashboard**
- Beautiful real-time dashboard with chat integration
- Live stream status and health monitoring
- **Chat message feed** from all platforms
- **Chatbot interaction analytics**
- **Platform connection status**
- **Stream statistics and performance metrics**
- **Social media engagement tracking**

### 🛡️ **Enterprise Features**
- Enhanced security with rate limiting
- **Redis caching** for performance
- **PostgreSQL support** for data persistence
- **Docker containerization** with orchestration
- **Comprehensive logging** and monitoring
- **Health checks** and auto-recovery
- **API rate limiting** and security headers

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ (or Docker)
- FFmpeg installed on your system
- OBS Studio
- Python 3.7+ (for RASA AI chatbot - optional)
- Stream keys and API credentials from your preferred platforms

### Option 1: Enhanced Setup Script (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/eihabhala/StreaminDoDo.git
   cd StreaminDoDo
   ```

2. **Run the enhanced setup script**
   ```bash
   chmod +x setup-enhanced.sh
   ./setup-enhanced.sh
   ```
   
   The script will:
   - Check prerequisites
   - Install dependencies
   - Set up environment configuration
   - Configure RASA AI chatbot (optional)
   - Set up Docker deployment (optional)
   - Guide you through platform configuration

3. **Configure your credentials**
   Edit the `.env` file with your streaming and social media credentials:
   ```env
   # Streaming Platforms
   TWITCH_STREAM_KEY=your_twitch_stream_key_here
   TWITCH_CLIENT_ID=your_twitch_client_id
   TWITCH_ACCESS_TOKEN=your_twitch_access_token
   
   YOUTUBE_STREAM_KEY=your_youtube_stream_key_here
   YOUTUBE_API_KEY=your_youtube_api_key
   
   # Social Media Platforms
   DISCORD_BOT_TOKEN=your_discord_bot_token
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   
   # AI Chatbot
   CHATBOT_ENABLED=true
   RASA_API_URL=http://localhost:5005
   ```

4. **Start the application**
   ```bash
   # Local development
   npm start
   
   # Or with Docker
   docker-compose up -d
   ```

### Option 2: Docker Compose (Production Ready)

1. **Quick deployment with all services**
   ```bash
   git clone https://github.com/eihabhala/StreaminDoDo.git
   cd StreaminDoDo
   cp .env.example .env
   # Edit .env with your credentials
   docker-compose up -d
   ```

2. **With database and full stack**
   ```bash
   docker-compose --profile database up -d
   ```

3. **Access services**
   - **Main Dashboard**: http://localhost:3000
   - **RASA API**: http://localhost:5005
   - **Redis**: localhost:6379
   - **PostgreSQL**: localhost:5432 (with database profile)

### Option 3: Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up RASA (optional)**
   ```bash
   pip install rasa
   npm run setup:rasa
   npm run rasa:train
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Start services**
   ```bash
   # Terminal 1: Main application
   npm start
   
   # Terminal 2: RASA chatbot (if enabled)
   npm run rasa:run
   ```

## 🤖 AI Chatbot Configuration

### RASA Setup

The AI chatbot uses RASA for natural language understanding and response generation.

#### Quick Setup with Docker
```bash
# Chatbot runs automatically with docker-compose
docker-compose up -d
```

#### Local RASA Installation
```bash
# Install RASA
pip install rasa

# Train the model
cd rasa
rasa train

# Start RASA server
rasa run --enable-api --cors '*'

# Start action server (in another terminal)
rasa run actions
```

#### Customizing the Chatbot

1. **Training Data**: Edit `rasa/data/nlu.yml` to add new intents and examples
2. **Responses**: Modify `rasa/domain.yml` to customize bot responses
3. **Actions**: Add custom actions in `rasa/actions/actions.py`
4. **Configuration**: Adjust `rasa/config.yml` for different NLU pipelines

#### Chatbot Features

- ✨ **Intelligent Responses**: Context-aware conversations
- 📊 **Analytics**: Track interactions and popular topics
- 🌍 **Multi-language**: Support for multiple languages
- 🛡️ **Moderation**: Automatic spam and toxicity detection
- 📚 **Learning**: Continuously improves from interactions
- ⚙️ **Customizable**: Easy to train for specific use cases

## 🌍 Social Media Platform Configuration

### Supported Platforms

| Platform | Streaming | Chat | Setup Difficulty | API Required |
|----------|-----------|------|------------------|-------------|
| **Twitch** | ✅ | ✅ | Easy | Yes |
| **YouTube** | ✅ | ✅ | Medium | Yes |
| **Facebook** | ✅ | ✅ | Medium | Yes |
| **Instagram** | ❌ | ✅ | Hard | Yes |
| **TikTok** | 🟠 | ✅ | Hard | Yes |
| **LinkedIn** | ❌ | ✅ | Medium | Yes |
| **Twitter/X** | ❌ | ✅ | Medium | Yes |
| **Discord** | ✅* | ✅ | Easy | Yes |
| **Telegram** | ❌ | ✅ | Easy | Yes |
| **Kick** | ✅ | ❌ | Easy | No |
| **Rumble** | ✅ | ❌ | Easy | No |
| **Odysee** | ✅ | ❌ | Easy | No |

*✅ Full Support | 🟠 Limited | ❌ Not Available | *Voice channel streaming

### Platform Setup Guides

#### Twitch Configuration
1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Create a new application
3. Get your Client ID and generate access token
4. Add to `.env`:
   ```env
   TWITCH_CLIENT_ID=your_client_id
   TWITCH_ACCESS_TOKEN=your_access_token
   TWITCH_STREAM_KEY=your_stream_key
   ```

#### Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application and bot
3. Copy bot token and add to `.env`:
   ```env
   DISCORD_BOT_TOKEN=your_bot_token
   DISCORD_GUILD_ID=your_server_id
   ```

#### Telegram Bot Setup
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot with `/newbot`
3. Copy token and add to `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```

### Chat Features

- 💬 **Real-time Monitoring**: All platform messages in one dashboard
- 🤖 **AI Responses**: Automated intelligent replies
- 📈 **Analytics**: Message volume, engagement tracking
- 🚫 **Moderation**: Spam filtering and user management
- 🔄 **Cross-platform**: Unified experience across all platforms
- ⏱️ **Message History**: Persistent chat logs and search

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