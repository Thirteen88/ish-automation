#!/bin/bash

# Icon and Splash Screen Generator for AI Orchestrator PWA
#
# This script generates all required icons and splash screens for iOS and Android
# using ImageMagick (must be installed)
#
# Usage: ./generate-assets.sh [source-image.png]

set -e

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick is not installed. Please install it first:"
    echo "   Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "   macOS: brew install imagemagick"
    exit 1
fi

# Source image (default or provided)
SOURCE_IMAGE="${1:-source-logo.png}"

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "⚠️  Source image not found. Creating placeholder..."

    # Create a simple placeholder logo
    convert -size 512x512 xc:transparent \
        -fill '#3b82f6' \
        -draw 'roundrectangle 0,0 512,512 100,100' \
        -fill white \
        -font Arial-Bold \
        -pointsize 200 \
        -gravity center \
        -annotate +0+0 '⚡' \
        "$SOURCE_IMAGE"

    echo "✅ Created placeholder logo: $SOURCE_IMAGE"
fi

echo "🎨 Generating PWA assets from $SOURCE_IMAGE..."

# Create icons directory if it doesn't exist
mkdir -p icons

# Generate app icons
ICON_SIZES=(72 96 128 144 152 192 384 512)

echo "📱 Generating app icons..."
for size in "${ICON_SIZES[@]}"; do
    echo "   → ${size}x${size}"
    convert "$SOURCE_IMAGE" \
        -resize ${size}x${size} \
        -background transparent \
        -gravity center \
        -extent ${size}x${size} \
        "icons/icon-${size}x${size}.png"
done

# Generate favicon
echo "🌐 Generating favicon..."
convert "$SOURCE_IMAGE" \
    -resize 32x32 \
    -background transparent \
    -gravity center \
    -extent 32x32 \
    "icons/favicon-32x32.png"

convert "$SOURCE_IMAGE" \
    -resize 16x16 \
    -background transparent \
    -gravity center \
    -extent 16x16 \
    "icons/favicon-16x16.png"

# Convert to .ico
convert icons/favicon-16x16.png icons/favicon-32x32.png \
    -colors 256 \
    "icons/favicon.ico" 2>/dev/null || echo "⚠️  Could not create .ico (optional)"

# Generate shortcut icons
echo "🔗 Generating shortcut icons..."
mkdir -p icons/shortcuts

# New query shortcut (blue + plus icon)
convert "$SOURCE_IMAGE" \
    -resize 96x96 \
    -background '#3b82f6' \
    -gravity center \
    -extent 96x96 \
    "icons/shortcut-new.png"

# History shortcut (purple + clock icon)
convert "$SOURCE_IMAGE" \
    -resize 96x96 \
    -background '#8b5cf6' \
    -gravity center \
    -extent 96x96 \
    "icons/shortcut-history.png"

# Status shortcut (green + chart icon)
convert "$SOURCE_IMAGE" \
    -resize 96x96 \
    -background '#10b981' \
    -gravity center \
    -extent 96x96 \
    "icons/shortcut-status.png"

# Create splash directory if it doesn't exist
mkdir -p splash

# Generate iOS splash screens
echo "🌅 Generating iOS splash screens..."

# iPhone and iPad splash screens (portrait)
declare -A SPLASH_SIZES=(
    ["640x1136"]="iPhone SE"
    ["750x1334"]="iPhone 8"
    ["828x1792"]="iPhone 11"
    ["1125x2436"]="iPhone X/XS"
    ["1242x2208"]="iPhone 8 Plus"
    ["1242x2688"]="iPhone XS Max"
    ["1536x2048"]="iPad 9.7"
    ["1668x2224"]="iPad 10.5"
    ["1668x2388"]="iPad 11"
    ["2048x2732"]="iPad 12.9"
)

for size in "${!SPLASH_SIZES[@]}"; do
    width=$(echo $size | cut -d'x' -f1)
    height=$(echo $size | cut -d'x' -f2)
    name="${SPLASH_SIZES[$size]}"

    echo "   → ${size} (${name})"

    convert -size ${size} \
        gradient:'#667eea-#764ba2' \
        \( "$SOURCE_IMAGE" -resize 200x200 \) \
        -gravity center \
        -composite \
        "splash/splash-${size}.png"
done

# Generate screenshots for app store
echo "📸 Generating screenshots..."
mkdir -p screenshots

# Mobile screenshot (540x720)
convert -size 540x720 \
    gradient:'#667eea-#764ba2' \
    \( "$SOURCE_IMAGE" -resize 150x150 \) \
    -gravity center \
    -composite \
    -fill white \
    -font Arial-Bold \
    -pointsize 30 \
    -gravity south \
    -annotate +0+50 'AI Orchestrator' \
    "screenshots/mobile-1.png"

# Desktop screenshot (1280x720)
convert -size 1280x720 \
    gradient:'#667eea-#764ba2' \
    \( "$SOURCE_IMAGE" -resize 200x200 \) \
    -gravity center \
    -composite \
    -fill white \
    -font Arial-Bold \
    -pointsize 40 \
    -gravity south \
    -annotate +0+80 'AI Orchestrator' \
    "screenshots/desktop-1.png"

echo "✅ Asset generation complete!"
echo ""
echo "📦 Generated assets:"
echo "   • ${#ICON_SIZES[@]} app icons (icons/)"
echo "   • 3 shortcut icons (icons/shortcuts/)"
echo "   • ${#SPLASH_SIZES[@]} splash screens (splash/)"
echo "   • 2 screenshots (screenshots/)"
echo "   • Favicons (icons/favicon.*)"
echo ""
echo "📝 Next steps:"
echo "   1. Review generated assets in icons/, splash/, and screenshots/"
echo "   2. Optionally replace with custom designs"
echo "   3. Test PWA installation on iOS and Android"
echo "   4. Verify icons appear correctly on home screen"
echo ""
echo "💡 Tip: For production, consider using a professional design tool"
echo "   or service like https://realfavicongenerator.net/"
