import { useState, useEffect, useRef } from 'react';

interface StrategizeProps {
  isActive: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export default function Strategize({ isActive }: StrategizeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [enabledMCPs, setEnabledMCPs] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load folder path and MCP settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        await window.electronAPI.writeDebugLog('[Strategize] Loading settings...');
        const settings = await window.electronAPI.getUserSettings();
        await window.electronAPI.writeDebugLog(`[Strategize] Settings loaded: ${JSON.stringify({
          hasFolderPath: !!settings?.strategizeFolderPath,
          folderPath: settings?.strategizeFolderPath || 'NOT SET',
          hasMcpServers: !!settings?.mcpServers
        })}`);

        setFolderPath(settings?.strategizeFolderPath || '');

        // Get enabled MCPs
        const enabled: string[] = [];
        if (settings?.mcpServers) {
          Object.keys(settings.mcpServers).forEach(serverName => {
            if (settings.mcpServers[serverName].enabled) {
              enabled.push(serverName);
            }
          });
        }
        setEnabledMCPs(enabled);
        await window.electronAPI.writeDebugLog(`[Strategize] Enabled MCPs: ${enabled.join(', ') || 'none'}`);
      } catch (error) {
        console.error('Failed to load settings:', error);
        await window.electronAPI.writeDebugLog(`[Strategize] ERROR loading settings: ${error}`);
      }
    };
    loadSettings();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when connected
  useEffect(() => {
    if (isConnected && isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected, isActive]);

  // Set up event listeners
  useEffect(() => {
    const handleClaudeOutput = (output: string) => {
      console.log('[Strategize] Received output:', output.substring(0, 100));

      setMessages(prev => {
        // Check if we have a streaming message (typing indicator or existing response)
        if (streamingMessageId) {
          return prev.map(msg => {
            if (msg.id === streamingMessageId) {
              // If it's a typing indicator, replace it with real content
              if (msg.content.startsWith('🤔') || msg.content.startsWith('🔍') ||
                  msg.content.startsWith('✨') || msg.content.startsWith('🧠') ||
                  msg.content.startsWith('⚡') || msg.content.startsWith('🎯') ||
                  msg.content.startsWith('💭')) {
                return { ...msg, content: output, isStreaming: true };
              }
              // Otherwise append to existing content
              return { ...msg, content: msg.content + output, isStreaming: true };
            }
            return msg;
          });
        } else {
          // Create a new streaming message
          const newMessageId = `msg-${Date.now()}`;
          setStreamingMessageId(newMessageId);

          const newMessage: Message = {
            id: newMessageId,
            role: 'assistant',
            content: output,
            timestamp: new Date().toISOString(),
            isStreaming: true,
          };

          return [...prev, newMessage];
        }
      });
    };

    const handleClaudeDisconnected = (data: { code: number | null; signal: string | null }) => {
      console.log('[Strategize] Claude disconnected:', data);
      setIsConnected(false);
      setStreamingMessageId(null);

      // Add system message
      const systemMessage: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `Disconnected from Claude Code (exit code: ${data.code})`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, systemMessage]);
    };

    const cleanupOutput = window.electronAPI.onClaudeOutput(handleClaudeOutput);
    const cleanupDisconnected = window.electronAPI.onClaudeDisconnected(handleClaudeDisconnected);

    return () => {
      cleanupOutput();
      cleanupDisconnected();
    };
  }, [streamingMessageId]);

  const handleConnect = async () => {
    const log = async (msg: string) => {
      console.log(msg);
      await window.electronAPI.writeDebugLog(msg);
    };

    await log('[Strategize] ========== CONNECT BUTTON CLICKED ==========');
    await log(`[Strategize] Folder path: ${folderPath || 'NOT SET'}`);
    await log(`[Strategize] Time: ${new Date().toISOString()}`);

    if (!folderPath) {
      await log('[Strategize] ERROR: No folder path configured');
      const systemMessage: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: 'Please configure a folder path in Settings → Customizations → Strategize Configuration',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, systemMessage]);
      return;
    }

    await log('[Strategize] Starting connection attempt...');
    setIsConnecting(true);

    try {
      await log(`[Strategize] Calling claudeCodeStart with path: ${folderPath}`);
      const result = await window.electronAPI.claudeCodeStart(folderPath);
      await log(`[Strategize] Result: ${JSON.stringify(result)}`);

      if (result.success) {
        await log('[Strategize] SUCCESS: Connected to Claude Code');
        setIsConnected(true);

        // Add welcome message
        const welcomeMessage: Message = {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Connected to Claude Code for folder: ${folderPath}`,
          timestamp: new Date().toISOString(),
        };
        setMessages([welcomeMessage]);
      } else {
        await log(`[Strategize] FAILED: ${result.error || 'Unknown error'}`);
        // Add error message
        const errorMessage: Message = {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Failed to connect: ${result.error || 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error: any) {
      await log(`[Strategize] EXCEPTION: ${error.message || error}`);
      console.error('Failed to start Claude Code:', error);
      const errorMessage: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `Error: ${error.message || 'Failed to connect'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsConnecting(false);
      await log('[Strategize] ========== CONNECT ATTEMPT COMPLETE ==========');
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.claudeCodeStop();
      setIsConnected(false);
      setStreamingMessageId(null);

      const systemMessage: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: 'Disconnected from Claude Code',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, systemMessage]);
    } catch (error: any) {
      console.error('Failed to stop Claude Code:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !isConnected) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setStreamingMessageId(null); // Reset streaming for new response

    // Add fun typing indicator
    const typingMessages = [
      "🤔 Claude is thinking...",
      "🔍 Analyzing your codebase...",
      "✨ Cooking up a response...",
      "🧠 Processing your question...",
      "⚡ Gathering insights...",
      "🎯 Strategizing...",
      "💭 Hmm, let me see...",
    ];
    const randomTyping = typingMessages[Math.floor(Math.random() * typingMessages.length)];

    const typingMessage: Message = {
      id: `typing-${Date.now()}`,
      role: 'assistant',
      content: randomTyping,
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, typingMessage]);
    setStreamingMessageId(typingMessage.id);

    try {
      const result = await window.electronAPI.claudeCodeSend(inputValue);

      if (!result.success) {
        // Remove typing indicator
        setMessages(prev => prev.filter(m => m.id !== typingMessage.id));
        setStreamingMessageId(null);

        const errorMessage: Message = {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Failed to send message: ${result.error}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);

      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== typingMessage.id));
      setStreamingMessageId(null);

      const errorMessage: Message = {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-dark-bg">
      {/* Header */}
      <div className="p-4 border-b border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h2 className="text-sm font-semibold text-dark-text-primary">Strategic Conversations</h2>
        </div>

        {isConnected ? (
          <button
            onClick={handleDisconnect}
            className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30
                     rounded-md hover:bg-red-500/30 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting || !folderPath}
            className="px-3 py-1.5 text-xs bg-dark-accent-primary text-white rounded-md
                     hover:bg-dark-accent-secondary transition-colors disabled:opacity-50
                     disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isConnecting && (
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>

      {/* Folder path and MCP indicators */}
      {(folderPath || enabledMCPs.length > 0) && (
        <div className="px-4 py-2 bg-dark-surface/50 border-b border-dark-border space-y-2">
          {folderPath && (
            <div className="flex items-center gap-2 text-xs text-dark-text-muted">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="truncate">{folderPath}</span>
            </div>
          )}

          {enabledMCPs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-dark-text-muted">MCPs:</span>
              {enabledMCPs.map(mcp => (
                <span
                  key={mcp}
                  className="px-2 py-0.5 text-xs bg-dark-accent-primary/20 text-dark-accent-primary
                           border border-dark-accent-primary/30 rounded-full capitalize"
                >
                  {mcp}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isConnected && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-12 h-12 text-dark-text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-sm text-dark-text-secondary mb-2">
              Strategic AI Conversations
            </div>
            <div className="text-xs text-dark-text-muted max-w-xs">
              Connect to chat with Claude Code about your project. Configure your project folder in Settings.
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.role === 'system'
                  ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'
                  : 'bg-dark-surface text-dark-text-primary border border-dark-border'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap break-words">
                {message.content}
                {message.isStreaming && (message.content.startsWith('🤔') || message.content.startsWith('🔍') ||
                  message.content.startsWith('✨') || message.content.startsWith('🧠') ||
                  message.content.startsWith('⚡') || message.content.startsWith('🎯') ||
                  message.content.startsWith('💭')) && (
                  <span className="inline-flex ml-1">
                    <span className="animate-bounce mx-0.5" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce mx-0.5" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce mx-0.5" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                )}
              </div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user'
                    ? 'text-blue-200'
                    : message.role === 'system'
                    ? 'text-yellow-300'
                    : 'text-dark-text-muted'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
                {message.isStreaming && (
                  <span className="ml-2 inline-flex items-center">
                    <span className="animate-pulse">●</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {isConnected && (
        <div className="p-4 border-t border-dark-border">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Claude about your project..."
              className="flex-1 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg
                       text-dark-text-primary placeholder-dark-text-muted
                       focus:outline-none focus:ring-2 focus:ring-dark-accent-primary text-sm"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className="px-4 py-2 bg-dark-accent-primary text-white rounded-lg
                       hover:bg-dark-accent-secondary transition-colors text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
