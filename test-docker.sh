#!/bin/bash

echo "🚀 Telegram Summary Bot Docker Test Script"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual tokens before running the bot in production!"
    echo "   For testing, the default values will work fine."
fi

echo "🔨 Building Docker image..."
docker build -t telegram-summary-bot:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo "✅ Docker image built successfully!"

echo "🧪 Testing Docker container..."
docker run --rm -d \
    --name telegram-summary-bot-test \
    -p 3001:3000 \
    --env-file .env \
    telegram-summary-bot:latest

# Wait for container to start
sleep 5

# Test health endpoint
echo "🩺 Testing health endpoint..."
curl -f http://localhost:3001/health > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
    docker logs telegram-summary-bot-test
    docker stop telegram-summary-bot-test
    exit 1
fi

echo "🔍 Container logs:"
docker logs telegram-summary-bot-test

echo "🛑 Stopping test container..."
docker stop telegram-summary-bot-test

echo "✅ Docker test completed successfully!"
echo ""
echo "🚀 To run the bot with Docker Compose:"
echo "   1. Edit .env with your real Telegram bot token and Gemini API key"
echo "   2. Run: docker-compose up -d"
echo "   3. Check logs: docker-compose logs -f"
echo "   4. Stop: docker-compose down"
echo ""
echo "📖 See README.md for full setup instructions."