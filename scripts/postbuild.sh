#!/bin/bash
echo "📦 Post-build: Moving assets to server/public..."
mkdir -p dist/public
if [ -d "dist/assets" ]; then
  mv dist/assets dist/public/
fi
if [ -f "dist/index.html" ]; then
  mv dist/index.html dist/public/
fi
echo "✅ Post-build complete!"
