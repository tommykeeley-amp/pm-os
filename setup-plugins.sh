#!/bin/bash

# PM-OS Plugin Setup Script
# This script installs recommended Claude Code plugins for PM-OS

set -e

echo "🚀 PM-OS Plugin Setup"
echo "===================="
echo ""

# Check if Claude Code is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code CLI not found!"
    echo "Please install Claude Code first: https://claude.com/claude-code"
    exit 1
fi

echo "✓ Claude Code CLI found"
echo ""

# Add marketplaces
echo "📦 Adding plugin marketplaces..."
echo ""

echo "→ Adding Anthropic skills marketplace..."
claude plugin marketplace add anthropics/skills || echo "  (Already added)"

echo "→ Adding Amplitude marketplace..."
claude plugin marketplace add amplitude/mcp-marketplace || echo "  (Already added)"

echo ""
echo "✓ Marketplaces added"
echo ""

# Install plugins
echo "📥 Installing plugins..."
echo ""

echo "→ Installing document-skills (Word, PDF, PowerPoint, Excel)..."
claude plugin install document-skills@anthropic-agent-skills || echo "  (Already installed)"

echo "→ Installing amplitude-analysis (Product analytics)..."
claude plugin install amplitude-analysis@amplitude || echo "  (Already installed)"

echo ""
echo "✓ Plugins installed"
echo ""

# Verify installation
echo "🔍 Verifying installation..."
echo ""
claude plugin list

echo ""
echo "✅ Setup complete!"
echo ""
echo "Your PM-OS Strategize now has access to:"
echo "  • Document creation (Word, PDF, PowerPoint, Excel)"
echo "  • Amplitude analysis capabilities"
echo ""
echo "Try asking Claude in Strategize:"
echo "  • 'Create a Word document with our Q2 goals'"
echo "  • 'Generate a PowerPoint presentation about metrics'"
echo ""
