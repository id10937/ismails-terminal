#!/bin/bash
# Start Yahoo Finance Proxy for Ismail's Terminal
echo "Starting Yahoo Finance proxy on http://localhost:3001 ..."
NODE_PATH="$(dirname "$0")/node_modules" node "$(dirname "$0")/yahoo-finance-proxy.js"
