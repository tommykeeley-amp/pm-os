# PM-OS Recommended Plugins

PM-OS uses Claude Code plugins to enhance Strategize capabilities. These plugins are optional but recommended for the best experience.

## Required Plugins

### 1. **Document Skills** (Anthropic)
Create and edit Word, PDF, PowerPoint, and Excel documents directly from Strategize.

**Capabilities:**
- 📄 Word documents (.docx)
- 📑 PDF files
- 📊 PowerPoint presentations
- 📈 Excel spreadsheets

### 2. **Amplitude Analysis** (Amplitude)
Advanced product analytics capabilities for data analysis and insights.

**Capabilities:**
- 📊 Chart and dashboard creation
- 🔬 Data analysis tools
- 💬 Feedback synthesis
- 🏥 Account health monitoring

## Installation

### Automatic Setup (Recommended)

Run this command in your terminal:

```bash
# Add marketplaces
claude plugin marketplace add anthropics/skills
claude plugin marketplace add amplitude/mcp-marketplace

# Install plugins
claude plugin install document-skills@anthropic-agent-skills
claude plugin install amplitude-analysis@amplitude
```

### Manual Setup

1. Open your terminal
2. Add the Anthropic skills marketplace:
   ```bash
   claude plugin marketplace add anthropics/skills
   ```
3. Add the Amplitude marketplace:
   ```bash
   claude plugin marketplace add amplitude/mcp-marketplace
   ```
4. Install document skills:
   ```bash
   claude plugin install document-skills@anthropic-agent-skills
   ```
5. Install Amplitude analysis:
   ```bash
   claude plugin install amplitude-analysis@amplitude
   ```

## Verification

Check that plugins are installed and enabled:

```bash
claude plugin list
```

You should see:
- ✔ `document-skills@anthropic-agent-skills` - enabled
- ✔ `amplitude-analysis@amplitude` - enabled

## Usage

Once installed, these plugins are automatically available in **Strategize**. Just ask Claude to:
- "Create a Word document summarizing our Q2 goals"
- "Generate a PowerPoint presentation about user metrics"
- "Analyze the chart data from last week"
- "Create an Excel spreadsheet with this data"

## Troubleshooting

### Plugins not showing up
```bash
# Check plugin status
claude plugin list

# If disabled, enable them
claude plugin enable document-skills@anthropic-agent-skills
claude plugin enable amplitude-analysis@amplitude
```

### Remove a plugin
```bash
claude plugin remove <plugin-name>
```

## Additional Resources

- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Amplitude MCP Marketplace](https://github.com/amplitude/mcp-marketplace)
- [Claude Code Plugin Documentation](https://docs.claude.com/en/docs/claude-code)
