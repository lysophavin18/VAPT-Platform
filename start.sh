#!/bin/bash

# VAPT Platform - Quick Start Script

set -e

echo "================================================"
echo "      VAPT Platform - Production Setup          "
echo "================================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    
    # Generate random secret key
    SECRET_KEY=$(openssl rand -hex 32)
    sed -i "s/your-super-secret-key-change-in-production-at-least-32-chars/$SECRET_KEY/g" .env
    echo "✅ Generated secure SECRET_KEY"
fi

# Create required directories
echo "📁 Creating required directories..."
mkdir -p reports uploads wordlists

# Build containers
echo ""
echo "🔨 Building Docker containers (this may take a while)..."
docker-compose build

# Start services
echo ""
echo "🚀 Starting VAPT Platform..."
docker-compose up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check health
echo ""
echo "🏥 Checking service health..."
docker-compose ps

echo ""
echo "================================================"
echo "      VAPT Platform Started Successfully!       "
echo "================================================"
echo ""
echo "🌐 Access the platform:"
echo "   • Web Interface: http://localhost"
echo "   • API Docs:      http://localhost/api/docs"
echo "   • Flower:        http://localhost/flower"
echo ""
echo "🔐 Default Credentials:"
echo "   • Email:    admin@vapt.local"
echo "   • Password: AdminSecure2024!"
echo ""
echo "⚠️  IMPORTANT: Change the default password immediately!"
echo ""
echo "📚 Useful Commands:"
echo "   • View logs:    docker-compose logs -f"
echo "   • Stop:         docker-compose down"
echo "   • Restart:      docker-compose restart"
echo ""
