# ⚡ Quick Start Guide - StreaminDoDo Enhanced

Welcome to the enhanced version of StreaminDoDo with AI chatbot and multi-platform support!

## 🚀 **1-Minute Setup**

### **Prerequisites**
- Node.js 16+ or Docker
- OBS Studio
- FFmpeg (for local setup)

### **Method 1: Docker (Recommended)**
```bash
# Clone the repository
git clone https://github.com/xnox-me/Streamin.git
cd Streamin

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker-compose up -d

# Access dashboard
open http://localhost:3000
```

### **Method 2: Automated Setup**
```bash
# Clone and run setup script
git clone https://github.com/xnox-me/Streamin.git
cd Streamin
chmod +x setup-enhanced.sh
./setup-enhanced.sh
```

### **Method 3: Manual Setup**
```bash
# Clone and install
git clone https://github.com/xnox-me/Streamin.git
cd Streamin
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start application
npm start
```

## 🎮 **OBS Configuration**

1. **Open OBS Studio**
2. **Settings → Stream**
3. **Service**: Custom
4. **Server**: `rtmp://localhost:1935/live`
5. **Stream Key**: Any unique name (e.g., `my-stream-2024`)
6. **Start Streaming** - It will broadcast to all configured platforms!

## 🤖 **AI Chatbot Setup**

### **Enable RASA AI**
```env
# In your .env file
CHATBOT_ENABLED=true
RASA_API_URL=http://localhost:5005
```

### **Docker Setup (Automatic)**
The chatbot starts automatically with `docker-compose up -d`

### **Local Setup**
```bash
# Install RASA
pip install rasa

# Train the model  
cd rasa
rasa train

# Start RASA server
rasa run --enable-api --cors '*'

# Start action server (new terminal)
rasa run actions
```

## 🌐 **Platform Configuration**

### **Quick Platform Setup**

#### **Discord Bot** (Easiest)
1. Go to https://discord.com/developers/applications
2. Create New Application → Bot
3. Copy Bot Token
4. Add to `.env`: `DISCORD_BOT_TOKEN=your_token_here`

#### **Telegram Bot** (Easy)
1. Message @BotFather on Telegram
2. Create bot with `/newbot`
3. Copy token
4. Add to `.env`: `TELEGRAM_BOT_TOKEN=your_token_here`

#### **Twitch** (Streaming + Chat)
1. Get stream key from Twitch Creator Dashboard
2. Get Client ID from https://dev.twitch.tv/console
3. Add to `.env`:
   ```env
   TWITCH_STREAM_KEY=your_stream_key
   TWITCH_CLIENT_ID=your_client_id
   TWITCH_ACCESS_TOKEN=your_access_token
   ```

## 📊 **Dashboard Features**

### **Access Points**
- **Main Dashboard**: http://localhost:3000
- **RASA API**: http://localhost:5005
- **API Docs**: http://localhost:3000/api

### **Key Features**
- 🎥 **Live Stream Monitoring** - All platforms status
- 💬 **Unified Chat Feed** - Messages from all platforms  
- 🤖 **AI Bot Analytics** - Response rates and confidence
- 📈 **Engagement Metrics** - Platform-specific stats
- ⚙️ **Platform Management** - Enable/disable platforms

## 🛠️ **Common Issues**

### **RTMP Connection Failed**
```bash
# Check FFmpeg installation
ffmpeg -version

# Verify RTMP port is free
sudo lsof -i :1935
```

### **Chatbot Not Responding**
```bash
# Check RASA service status
curl http://localhost:5005/status

# View logs
docker logs rasa-chatbot
```

### **Platform Not Connecting**
1. Verify API credentials in `.env`
2. Check platform-specific requirements
3. Review logs: `docker logs obs-multistream`

## 📱 **Platform Limits**

| Platform | Streaming | Chat | Rate Limit |
|----------|-----------|------|------------|
| Twitch | ✅ | ✅ | 20 msg/30s |
| YouTube | ✅ | ✅ | API limits |
| Discord | Voice | ✅ | 5 msg/5s |
| Telegram | ❌ | ✅ | 30 msg/s |

## 🔧 **Advanced Configuration**

### **Custom Platform**
```env
# Add custom RTMP endpoint
CUSTOM_RTMP_URL_1=rtmp://your-server.com/live/
CUSTOM_STREAM_KEY_1=your-stream-key
```

### **RASA Customization**
- **Training Data**: `rasa/data/nlu.yml`
- **Responses**: `rasa/domain.yml`  
- **Actions**: `rasa/actions/actions.py`

### **Production Deployment**
```bash
# Full stack with database
docker-compose --profile database up -d

# With reverse proxy
docker-compose --profile proxy up -d
```

## 📞 **Support**

- **Documentation**: See `README.md` for complete guide
- **Issues**: GitHub repository issues
- **Platform Guides**: Check platform-specific setup sections in README

---

🎉 **You're ready to go!** Start streaming to multiple platforms with AI-powered chat interaction!

**Repository**: https://github.com/xnox-me/Streamin.git