#!/bin/bash
# Package vhp-query for browser plugin distribution

VERSION="0.1.11"
OUTPUT_FILE="vhp-query-v${VERSION}.zip"

echo "📦 Packaging VHP Query Browser Plugin v${VERSION}"
echo "=================================================="

# Create zip, excluding git, node_modules, env files
zip -r "$OUTPUT_FILE" . \
  --exclude='.git*' \
  --exclude='node_modules/*' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='scripts/*' \
  --exclude='*.log' \
  --exclude='package-plugin.sh' \
  > /dev/null 2>&1

if [ -f "$OUTPUT_FILE" ]; then
  SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "✓ Created: $OUTPUT_FILE ($SIZE)"
  echo ""
  echo "📋 Package contents:"
  unzip -l "$OUTPUT_FILE" | head -15
  echo "..."
  echo ""
  echo "Ready to distribute or load as browser plugin."
else
  echo "✗ Failed to create package"
  exit 1
fi
