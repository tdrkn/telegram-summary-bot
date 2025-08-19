# Docker Deployment Guide

This guide will help you deploy the Telegram Summary Bot using Docker.

## Prerequisites

- Docker and Docker Compose installed
- A Telegram bot token (from @BotFather)
- A Gemini API key (from Google AI Studio)
- A server with a public domain (for webhook)

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tdrkn/telegram-summary-bot.git
   cd telegram-summary-bot
   ```

2. **Test Docker setup** (optional):
   ```bash
   ./test-docker.sh
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   nano .env  # Edit with your tokens
   ```

4. **Deploy**:
   ```bash
   docker-compose up -d
   ```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_TELEGRAM_API_TOKEN` | Your Telegram bot token | `1234567890:ABCdef...` |
| `GEMINI_API_KEY` | Your Gemini API key | `AIzaSy...` |
| `ACCOUNT_ID` | Any identifier for your deployment | `my-bot-v1` |
| `DATABASE_PATH` | SQLite database path | `/app/data/messages.sqlite` |
| `PORT` | Server port | `3000` |
| `WEBHOOK_URL` | Your public webhook URL | `https://yourbot.example.com/webhook` |
| `CRON_SCHEDULE` | When to send summaries | `0 0,1 * * *` (midnight & 1 AM) |

## Setting Up Webhook

Replace `YOUR_BOT_TOKEN` and `YOUR_DOMAIN`:

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://YOUR_DOMAIN/webhook"}'
```

## Docker Commands

```bash
# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# View database
docker-compose exec telegram-summary-bot sqlite3 /app/data/messages.sqlite
```

## Deployment on VPS

### Using nginx as reverse proxy:

1. **Install nginx**:
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. **Configure nginx** (`/etc/nginx/sites-available/telegram-bot`):
   ```nginx
   server {
       listen 80;
       server_name yourbot.example.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable site and get SSL**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/telegram-bot /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d yourbot.example.com
   ```

### Auto-start with systemd:

Create `/etc/systemd/system/telegram-bot.service`:

```ini
[Unit]
Description=Telegram Summary Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/telegram-summary-bot
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Then enable:
```bash
sudo systemctl enable telegram-bot.service
sudo systemctl start telegram-bot.service
```

## Monitoring

### Health check:
```bash
curl https://yourbot.example.com/health
```

### Database statistics:
```bash
docker-compose exec telegram-summary-bot sqlite3 /app/data/messages.sqlite \
  "SELECT COUNT(*) as total_messages, COUNT(DISTINCT groupId) as groups FROM Messages;"
```

### Disk usage:
```bash
docker-compose exec telegram-summary-bot du -sh /app/data/
```

## Backup

### Backup database:
```bash
docker-compose exec telegram-summary-bot sqlite3 /app/data/messages.sqlite \
  ".backup /app/data/backup-$(date +%Y%m%d).sqlite"
```

### Copy backup to host:
```bash
docker cp $(docker-compose ps -q telegram-summary-bot):/app/data/backup-$(date +%Y%m%d).sqlite ./
```

## Troubleshooting

### Check logs:
```bash
docker-compose logs -f telegram-summary-bot
```

### Restart bot:
```bash
docker-compose restart telegram-summary-bot
```

### Check webhook status:
```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

### Delete webhook (for testing):
```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook"
```

### Manual trigger scheduled task:
```bash
curl -X POST https://yourbot.example.com/trigger-scheduled
```

## Performance Tuning

### For high-traffic bots, consider:

1. **Increase memory limit**:
   ```yaml
   # In docker-compose.yml
   services:
     telegram-summary-bot:
       deploy:
         resources:
           limits:
             memory: 1G
   ```

2. **Use WAL mode for SQLite**:
   ```bash
   docker-compose exec telegram-summary-bot sqlite3 /app/data/messages.sqlite \
     "PRAGMA journal_mode=WAL;"
   ```

3. **Set up log rotation**:
   ```yaml
   # In docker-compose.yml
   services:
     telegram-summary-bot:
       logging:
         driver: "json-file"
         options:
           max-size: "10m"
           max-file: "3"
   ```

## Security

1. **Use environment file protection**:
   ```bash
   chmod 600 .env
   ```

2. **Regular updates**:
   ```bash
   git pull
   docker-compose pull
   docker-compose up -d --build
   ```

3. **Firewall configuration**:
   ```bash
   sudo ufw allow ssh
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```