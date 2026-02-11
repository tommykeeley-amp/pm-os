import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StrategizeProps {
  isActive: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export default function Strategize({ isActive }: StrategizeProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [enabledMCPs, setEnabledMCPs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load folder path and MCP settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getUserSettings();
        setFolderPath(settings?.strategizeFolderPath || '');

        const enabled: string[] = [];
        if (settings?.mcpServers) {
          Object.keys(settings.mcpServers).forEach(serverName => {
            if (settings.mcpServers[serverName].enabled) {
              enabled.push(serverName);
            }
          });
        }
        setEnabledMCPs(enabled);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, streamingContent]);

  // Focus input when connected
  useEffect(() => {
    if (isConnected && isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected, isActive]);

  // Set up OpenAI streaming listeners
  useEffect(() => {
    const cleanupStream = window.electronAPI.onStrategizeStream((chunk: string) => {
      setStreamingContent(prev => prev + chunk);
      setIsTyping(true);
    });

    const cleanupComplete = window.electronAPI.onStrategizeComplete(() => {
      // Add completed message to chat
      if (streamingContent) {
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: streamingContent,
          timestamp: new Date(),
        }]);
      }
      setStreamingContent('');
      setIsTyping(false);
    });

    return () => {
      cleanupStream();
      cleanupComplete();
    };
  }, [streamingContent]);

  // Listen for MCP OAuth callbacks
  useEffect(() => {
    const cleanup = window.electronAPI.onMCPOAuthCallback(async (data) => {
      console.log(`[Strategize] Received OAuth callback for ${data.serverName}`);

      // Add system message
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `OAuth completed for ${data.serverName}. Reconnecting...`,
        timestamp: new Date(),
      }]);

      // Complete OAuth and reconnect
      await window.electronAPI.mcpOAuthComplete(data.serverName);

      // Reconnect to strategize
      if (isConnected && folderPath) {
        await window.electronAPI.strategizeStop();
        await window.electronAPI.strategizeStart(folderPath);

        setChatMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `${data.serverName} connected successfully!`,
          timestamp: new Date(),
        }]);
      }
    });

    return cleanup;
  }, [isConnected, folderPath]);

  const handleConnect = async () => {
    if (!folderPath) {
      alert('Please set a folder path first!\\n\\nGo to Settings → Customizations → Strategize Configuration');
      return;
    }

    setIsConnecting(true);

    try {
      const result = await window.electronAPI.strategizeStart(folderPath);
      if (result.success) {
        setIsConnected(true);
        setChatMessages([{
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Connected • Using Claude Code to chat about ${folderPath.split('/').pop()}`,
          timestamp: new Date(),
        }]);
      } else {
        alert(`Failed to start chat:\\n\\n${result.error}\\n\\nMake sure Claude Code is installed`);
      }
    } catch (error: any) {
      alert(`Error starting chat:\\n\\n${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.strategizeStop();
      setIsConnected(false);
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: 'Disconnected',
        timestamp: new Date(),
      }]);
    } catch (error: any) {
      console.error('Failed to stop chat:', error);
    }
  };

  const handleNewChat = async () => {
    try {
      await window.electronAPI.strategizeReset();
      // Clear UI messages except system messages
      setChatMessages(prev => prev.filter(msg => msg.role === 'system' && msg.content.includes('Connected')));
      // Add new chat indicator
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: 'New chat started',
        timestamp: new Date(),
      }]);
    } catch (error: any) {
      console.error('Failed to reset chat:', error);
    }
  };

  const handleSendMessage = async () => {
    const message = inputValue.trim();
    if (!message || !isConnected) return;

    // Add user message to chat
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    }]);

    // Clear input
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Send to OpenAI
    setIsTyping(true);
    setStreamingContent('');
    await window.electronAPI.strategizeSend(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 text-xs bg-dark-accent-primary/20 text-dark-accent-primary border border-dark-accent-primary/30
                       rounded-md hover:bg-dark-accent-primary/30 transition-colors"
            >
              New Chat
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30
                       rounded-md hover:bg-red-500/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
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

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!isConnected && chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-dark-accent-primary/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-dark-text-primary mb-2">AI Chat Workspace</h3>
            <p className="text-sm text-dark-text-muted max-w-md mb-4">
              Connect to start a conversation powered by Claude Code
            </p>
            <div className="text-xs text-dark-text-muted/70 space-y-1">
              <p>💬 Real conversational AI</p>
              <p>⚡ Streaming responses</p>
              <p>🔧 MCP tool support</p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, index) => {
              const isLastMessage = index === chatMessages.length - 1;
              const shouldExpand = isLastMessage;

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] ${msg.role === 'system' ? 'w-full flex justify-center' : ''}`}>
                    {msg.role === 'system' ? (
                      <div className="px-3 py-1 bg-dark-surface/50 text-dark-text-muted text-[10px] rounded-full border border-dark-border">
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        className={`px-3 py-2 rounded-2xl transition-all ${
                          msg.role === 'user'
                            ? 'bg-dark-accent-primary text-white rounded-br-sm'
                            : 'bg-dark-surface text-white rounded-bl-sm border border-dark-border'
                        }`}
                      >
                        <div className={`text-xs leading-relaxed ${shouldExpand ? '' : 'truncate'} markdown-content`}>
                          {shouldExpand ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>
                        <div className={`text-[9px] mt-1 opacity-60`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Streaming message */}
            {isTyping && streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[75%]">
                  <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-dark-surface border border-dark-border">
                    <div className="text-xs leading-relaxed text-white markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {isTyping && !streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[75%]">
                  <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-dark-surface border border-dark-border">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-dark-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-dark-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-dark-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      {isConnected && (
        <div className="border-t border-dark-border p-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={!isConnected || isTyping}
              rows={1}
              className="flex-1 bg-dark-surface border border-dark-border rounded-2xl px-3 py-2
                       text-xs text-dark-text-primary placeholder-dark-text-muted
                       focus:outline-none focus:ring-2 focus:ring-dark-accent-primary/50
                       disabled:opacity-50 disabled:cursor-not-allowed resize-none
                       max-h-[100px] overflow-y-auto"
              style={{ height: 'auto' }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || !isConnected || isTyping}
              className="w-9 h-9 rounded-full bg-dark-accent-primary text-white
                       flex items-center justify-center hover:bg-dark-accent-secondary
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
          <div className="text-[9px] text-dark-text-muted mt-1.5 text-center">
            Enter to send • Shift+Enter for new line
          </div>
        </div>
      )}
    </div>
  );
}
