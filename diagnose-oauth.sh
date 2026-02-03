#!/bin/bash
# OAuth Connection Diagnostic Script for PM-OS
# Run this and send the output to Tommy

echo "=================================="
echo "PM-OS OAuth Connection Diagnostics"
echo "=================================="
echo ""

echo "1. Checking PM-OS Installation..."
if [ -d "/Applications/PM-OS.app" ]; then
    echo "✅ PM-OS found in Applications"
    ls -lh "/Applications/PM-OS.app/Contents/MacOS/PM-OS"
else
    echo "❌ PM-OS not found in Applications"
    echo "   Checking release folder..."
    if [ -d "$HOME/pm-os/release/mac-arm64/PM-OS.app" ]; then
        echo "   ✅ Found in release folder"
    else
        echo "   ❌ Not found in release folder either"
    fi
fi
echo ""

echo "2. Checking for .env file..."
if [ -f "$HOME/pm-os/.env" ]; then
    echo "✅ .env found in project folder"
    echo "   Checking OAuth credentials..."
    if grep -q "SLACK_CLIENT_ID" "$HOME/pm-os/.env"; then
        SLACK_ID=$(grep "SLACK_CLIENT_ID" "$HOME/pm-os/.env" | cut -d'=' -f2)
        echo "   ✅ SLACK_CLIENT_ID: ${SLACK_ID:0:20}..."
    else
        echo "   ❌ SLACK_CLIENT_ID not found"
    fi

    if grep -q "OAUTH_REDIRECT_URI" "$HOME/pm-os/.env"; then
        REDIRECT_URI=$(grep "OAUTH_REDIRECT_URI" "$HOME/pm-os/.env" | cut -d'=' -f2)
        echo "   ✅ OAUTH_REDIRECT_URI: $REDIRECT_URI"
    else
        echo "   ❌ OAUTH_REDIRECT_URI not found"
    fi
else
    echo "❌ .env file not found in $HOME/pm-os/"
fi
echo ""

echo "3. Checking PM-OS app data..."
if [ -d "$HOME/Library/Application Support/pm-os" ]; then
    echo "✅ PM-OS app data folder exists"
    ls -lha "$HOME/Library/Application Support/pm-os/" | head -10
else
    echo "❌ PM-OS app data folder not found"
fi
echo ""

echo "4. Checking if PM-OS is running..."
PM_OS_PROCESS=$(ps aux | grep "PM-OS.app" | grep -v grep)
if [ -n "$PM_OS_PROCESS" ]; then
    echo "✅ PM-OS is running"
    echo "$PM_OS_PROCESS" | head -1
else
    echo "❌ PM-OS is not running"
fi
echo ""

echo "5. Checking protocol handler registration..."
if defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist 2>/dev/null | grep -q "pmos"; then
    echo "✅ pmos:// protocol handler registered"
else
    echo "⚠️  pmos:// protocol handler may not be registered"
    echo "   (This is normal if PM-OS hasn't been opened yet)"
fi
echo ""

echo "6. Checking OAuth logs..."
if [ -f "/tmp/pm-os-oauth-debug.log" ]; then
    echo "✅ OAuth log file exists"
    echo "   Last 10 lines:"
    tail -10 /tmp/pm-os-oauth-debug.log
else
    echo "⚠️  No OAuth log file found (normal if haven't tried connecting yet)"
fi
echo ""

echo "7. Checking Jira logs..."
if [ -f "$HOME/pm-os-jira-debug.log" ]; then
    echo "✅ Jira log file exists"
    echo "   Last 5 lines:"
    tail -5 "$HOME/pm-os-jira-debug.log"
else
    echo "⚠️  No Jira log file found (normal if haven't created tickets yet)"
fi
echo ""

echo "8. Testing Vercel endpoint connectivity..."
if curl -s -o /dev/null -w "%{http_code}" "https://pm-os.vercel.app/oauth-callback" | grep -q "200\|301\|302"; then
    echo "✅ Can reach Vercel endpoint"
else
    echo "❌ Cannot reach Vercel endpoint (may be firewall issue)"
fi
echo ""

echo "=================================="
echo "Diagnostic Complete!"
echo "=================================="
echo ""
echo "📋 To share this output:"
echo "   ./diagnose-oauth.sh > oauth-diagnosis.txt"
echo "   Then send oauth-diagnosis.txt to Tommy"
