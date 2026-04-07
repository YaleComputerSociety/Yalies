#!/bin/bash
cd "$(dirname "$0")/yalies-internal/yalies-data-pipeline"
echo "Starting data pipeline API server on port 8080..."
npm run server
