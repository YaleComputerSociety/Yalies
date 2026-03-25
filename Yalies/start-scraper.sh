#!/bin/bash
cd "$(dirname "$0")/yalies-scraper"
echo "Starting scraper API server on port 8080..."
npm run server
