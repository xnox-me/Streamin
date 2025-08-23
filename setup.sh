#!/bin/bash

# OBS Multistream Setup Script
# This script helps you set up the OBS Multistream server

set -e

echo "🎬 OBS Multistream Server Setup"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root. Consider running as a regular user for security."
fi

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
else
    print_error "Unsupported operating system: $OSTYPE"
    exit 1
fi

print_status "Detected OS: $OS"

# Check prerequisites
print_step "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    print_status "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16+ required. Current version: $(node --version)"
    exit 1
fi

print_status "Node.js version: $(node --version) ✓"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
fi

print_status "npm version: $(npm --version) ✓"

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    print_warning "FFmpeg is not installed. Attempting to install..."
    
    case $OS in
        "linux")
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y ffmpeg
            elif command -v yum &> /dev/null; then
                sudo yum install -y ffmpeg
            elif command -v pacman &> /dev/null; then
                sudo pacman -S ffmpeg
            else
                print_error "Could not install FFmpeg automatically. Please install it manually."
                exit 1
            fi
            ;;
        "macos")
            if command -v brew &> /dev/null; then
                brew install ffmpeg
            else
                print_error "Homebrew not found. Please install FFmpeg manually."
                print_status "Visit: https://ffmpeg.org/download.html"
                exit 1
            fi
            ;;
        "windows")
            print_error "Please install FFmpeg manually on Windows."
            print_status "Visit: https://ffmpeg.org/download.html"
            exit 1
            ;;
    esac
fi

print_status "FFmpeg version: $(ffmpeg -version | head -n1 | cut -d' ' -f3) ✓"

# Install dependencies
print_step "Installing Node.js dependencies..."
npm install

# Set up environment file
print_step "Setting up environment configuration..."

if [ ! -f .env ]; then
    cp .env.example .env
    print_status "Created .env file from template"
else
    print_warning ".env file already exists, skipping creation"
fi

# Interactive configuration
echo ""
print_step "Platform Configuration"
echo "Would you like to configure streaming platforms now? (y/n)"
read -r CONFIGURE_PLATFORMS

if [[ $CONFIGURE_PLATFORMS =~ ^[Yy]$ ]]; then
    # Twitch configuration
    echo ""
    echo "🟣 Twitch Configuration"
    echo "1. Go to https://dashboard.twitch.tv/"
    echo "2. Navigate to Settings > Stream"
    echo "3. Copy your Stream Key"
    echo ""
    echo "Enter your Twitch stream key (or press Enter to skip):"
    read -r TWITCH_KEY
    
    if [ ! -z "$TWITCH_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/TWITCH_STREAM_KEY=.*/TWITCH_STREAM_KEY=$TWITCH_KEY/" .env
        else
            sed -i "s/TWITCH_STREAM_KEY=.*/TWITCH_STREAM_KEY=$TWITCH_KEY/" .env
        fi
        print_status "Twitch configured ✓"
    fi

    # YouTube configuration
    echo ""
    echo "🔴 YouTube Configuration"
    echo "1. Go to https://studio.youtube.com/"
    echo "2. Click 'Create' > 'Go Live'"
    echo "3. Copy your Stream Key"
    echo ""
    echo "Enter your YouTube stream key (or press Enter to skip):"
    read -r YOUTUBE_KEY
    
    if [ ! -z "$YOUTUBE_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/YOUTUBE_STREAM_KEY=.*/YOUTUBE_STREAM_KEY=$YOUTUBE_KEY/" .env
        else
            sed -i "s/YOUTUBE_STREAM_KEY=.*/YOUTUBE_STREAM_KEY=$YOUTUBE_KEY/" .env
        fi
        print_status "YouTube configured ✓"
    fi

    # Facebook configuration
    echo ""
    echo "🔵 Facebook Configuration"
    echo "1. Go to https://business.facebook.com/creatorstudio/"
    echo "2. Click 'Go Live'"
    echo "3. Copy your Stream Key"
    echo ""
    echo "Enter your Facebook stream key (or press Enter to skip):"
    read -r FACEBOOK_KEY
    
    if [ ! -z "$FACEBOOK_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/FACEBOOK_STREAM_KEY=.*/FACEBOOK_STREAM_KEY=$FACEBOOK_KEY/" .env
        else
            sed -i "s/FACEBOOK_STREAM_KEY=.*/FACEBOOK_STREAM_KEY=$FACEBOOK_KEY/" .env
        fi
        print_status "Facebook configured ✓"
    fi
fi

# Create logs directory
print_step "Creating logs directory..."
mkdir -p logs

# Set up systemd service (Linux only)
if [[ $OS == "linux" ]] && command -v systemctl &> /dev/null; then
    echo ""
    echo "Would you like to set up a systemd service for auto-start? (y/n)"
    read -r SETUP_SERVICE
    
    if [[ $SETUP_SERVICE =~ ^[Yy]$ ]]; then
        SERVICE_FILE="/etc/systemd/system/obs-multistream.service"
        
        cat > obs-multistream.service << EOF
[Unit]
Description=OBS Multistream Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
Environment=NODE_ENV=production
ExecStart=$(which node) src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

        sudo mv obs-multistream.service $SERVICE_FILE
        sudo systemctl daemon-reload
        sudo systemctl enable obs-multistream
        
        print_status "Systemd service created. Use 'sudo systemctl start obs-multistream' to start."
    fi
fi

# Final instructions
echo ""
print_status "Setup completed successfully! 🎉"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. 🎛️  Start the server:"
echo "   npm start"
echo ""
echo "2. 🌐  Open the dashboard:"
echo "   http://localhost:3000"
echo ""
echo "3. 🎮  Configure OBS Studio:"
echo "   - Service: Custom"
echo "   - Server: rtmp://localhost:1935/live"
echo "   - Stream Key: any-unique-key"
echo ""
echo "4. 📡  Start streaming in OBS!"
echo ""

if [ ! -z "$TWITCH_KEY" ] || [ ! -z "$YOUTUBE_KEY" ] || [ ! -z "$FACEBOOK_KEY" ]; then
    echo "✅ Configured platforms will automatically receive your stream."
else
    echo "⚠️  Remember to configure your streaming platforms in the .env file."
fi

echo ""
echo "📚 For more information, check the README.md file."
echo ""
print_status "Happy streaming! 🚀"