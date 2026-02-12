import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface StrategizeProps {
  isActive: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  selectedMCPs?: string[];
}

export default function Strategize({ isActive }: StrategizeProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [enabledMCPs, setEnabledMCPs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [showNewChatAnimation, setShowNewChatAnimation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceModelLoaded, setVoiceModelLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoConnected = useRef(false);
  // const finalTranscriptRef = useRef(''); // Disabled - voice input disabled

  // Load folder path and MCP settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getUserSettings();
        const path = settings?.strategizeFolderPath || '';
        setFolderPath(path);

        const enabled: string[] = [];
        if (settings?.mcpServers) {
          Object.keys(settings.mcpServers).forEach(serverName => {
            // Filter out removed MCPs (slack, gdrive) and PM-OS (integrated)
            if (settings.mcpServers[serverName].enabled &&
                serverName !== 'slack' &&
                serverName !== 'gdrive' &&
                serverName !== 'pmos') {
              enabled.push(serverName);
            }
          });
        }
        console.log('[Strategize] Loaded enabled MCPs:', enabled);
        setEnabledMCPs(enabled);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Reload MCPs when tab becomes active (to pick up settings changes)
  useEffect(() => {
    if (isActive) {
      const reloadMCPs = async () => {
        try {
          console.log('[Strategize] Tab active, reloading MCPs from settings...');
          const settings = await window.electronAPI.getUserSettings();
          const enabled: string[] = [];
          if (settings?.mcpServers) {
            Object.keys(settings.mcpServers).forEach(serverName => {
              if (settings.mcpServers[serverName].enabled &&
                  serverName !== 'slack' &&
                  serverName !== 'gdrive' &&
                  serverName !== 'pmos') {
                enabled.push(serverName);
              }
            });
          }
          console.log('[Strategize] Reloaded enabled MCPs:', enabled);
          setEnabledMCPs(enabled);
        } catch (error) {
          console.error('[Strategize] Failed to reload MCPs:', error);
        }
      };
      reloadMCPs();
    }
  }, [isActive]);

  // Auto-connect when tab becomes active
  useEffect(() => {
    if (isActive && folderPath && !isConnected && !hasAutoConnected.current) {
      console.log('[Strategize] Auto-connecting on tab activation...');
      hasAutoConnected.current = true;
      handleConnect();
    }
  }, [isActive, folderPath, isConnected]);

  // Auto-focus input when tab becomes active or connected
  useEffect(() => {
    if (isActive && inputRef.current && !isTyping) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isActive, isConnected, isTyping]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, streamingContent]);

  // Set up OpenAI streaming listeners
  useEffect(() => {
    const cleanupStream = window.electronAPI.onStrategizeStream((chunk: string) => {
      setStreamingContent(prev => prev + chunk);
      setIsTyping(true);
    });

    const cleanupComplete = window.electronAPI.onStrategizeComplete(() => {
      // Add completed message to chat
      if (streamingContent) {
        const newMessageId = `msg-${Date.now()}`;
        setChatMessages(prev => [...prev, {
          id: newMessageId,
          role: 'assistant',
          content: streamingContent,
          timestamp: new Date(),
        }]);
        // Auto-expand new assistant message
        setExpandedMessages(prev => new Set(prev).add(newMessageId));
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

  // Listen for restart requests (e.g., when MCP config changes)
  useEffect(() => {
    const cleanup = window.electronAPI.onStrategizeRestartRequired(async () => {
      console.log('[Strategize] Restart required, reconnecting...');

      if (isConnected && folderPath) {
        // Add system message
        setChatMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: 'MCP configuration updated. Reconnecting...',
          timestamp: new Date(),
        }]);

        // Stop and restart
        await window.electronAPI.strategizeStop();
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for cleanup

        const result = await window.electronAPI.strategizeStart(folderPath);

        if (result.success) {
          setChatMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            role: 'system',
            content: 'Reconnected with updated MCP servers',
            timestamp: new Date(),
          }]);
        }
      }
    });

    return cleanup;
  }, [isConnected, folderPath]);

  const handleConnect = async () => {
    if (!folderPath) {
      alert('Please set a folder path first!\\n\\nGo to Settings → Customizations → Strategize Configuration');
      return;
    }

    try {
      const result = await window.electronAPI.strategizeStart(folderPath);
      if (result.success) {
        setIsConnected(true);
      } else {
        alert(`Failed to start chat:\\n\\n${result.error}\\n\\nMake sure Claude Code is installed`);
      }
    } catch (error: any) {
      alert(`Error starting chat:\\n\\n${error.message}`);
    }
  };


  const handleNewChat = async () => {
    try {
      await window.electronAPI.strategizeReset();
      // Clear UI messages
      setChatMessages([]);
      // Trigger new chat animation
      setShowNewChatAnimation(true);
      setTimeout(() => setShowNewChatAnimation(false), 2000);
    } catch (error: any) {
      console.error('Failed to reset chat:', error);
    }
  };

  // Voice recognition with Vosk
  const recognizerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize Vosk on mount
  useEffect(() => {
    const initVosk = async () => {
      try {
        const { createModel } = await import('vosk-browser');
        console.log('[Voice] Initializing Vosk model (39MB, may take a moment)...');

        // Load small English model
        const model = await createModel('/vosk-model-small-en-us-0.15.tar.gz');
        recognizerRef.current = model;
        setVoiceModelLoaded(true);
        console.log('[Voice] Vosk model loaded and ready');
      } catch (error) {
        console.error('[Voice] Failed to initialize Vosk:', error);
        setVoiceModelLoaded(false);
      }
    };

    initVosk();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  /* Voice transcription functions - disabled for now
  // Convert audio blob to WAV format
  const convertToWav = async (audioBlob: Blob): Promise<ArrayBuffer> => {
    const audioContext = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get PCM data
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit PCM
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM format
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // 16-bit
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write PCM data
    const offset = 44;
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return buffer;
  };

  const transcribeAudioChunk = async (audioBlob: Blob) => {
    try {
      console.log('[Voice] Transcribing audio chunk, size:', audioBlob.size);

      // Convert to WAV format
      console.log('[Voice] Converting to WAV format...');
      const wavBuffer = await convertToWav(audioBlob);
      console.log('[Voice] WAV conversion complete, size:', wavBuffer.byteLength);

      // Send to main process for transcription
      console.log('[Voice] Sending to Whisper for transcription...');
      const result = await window.electronAPI.voiceTranscribe(wavBuffer);

      if (result.success && result.text) {
        console.log('[Voice] Transcription result:', result.text);
        // Append transcribed text to input
        setInputValue(prev => {
          const newValue = (prev + ' ' + result.text).trim();
          finalTranscriptRef.current = newValue;
          return newValue;
        });
      } else {
        console.error('[Voice] Transcription failed:', result.error);
      }
    } catch (error: any) {
      console.error('[Voice] Error transcribing audio:', error);
    }
  };
  */

  const toggleVoiceInput = async () => {
    if (!voiceModelLoaded || !recognizerRef.current) {
      alert('Voice model is still loading (39MB). Please wait a moment and try again.');
      return;
    }

    if (isListening) {
      // Stop listening
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setIsListening(false);
    } else {
      // Start listening
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const recognizer = await recognizerRef.current.createRecognizer();

        let fullTranscript = '';

        recognizer.on('result', (message: any) => {
          if (message.result && message.result.text) {
            fullTranscript += ' ' + message.result.text;
            setInputValue(fullTranscript.trim());
          }
        });

        recognizer.on('partialresult', (message: any) => {
          if (message.result && message.result.partial) {
            setInputValue((fullTranscript + ' ' + message.result.partial).trim());
          }
        });

        // Connect audio source to recognizer
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const audioData = e.inputBuffer.getChannelData(0);
          recognizer.acceptWaveform(audioData);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        setInputValue(''); // Clear input before starting
        setIsListening(true);
        console.log('[Voice] Started listening with Vosk');
      } catch (error: any) {
        console.error('[Voice] Error starting microphone:', error);
        alert('Microphone access denied or error: ' + error.message);
      }
    }
  };

  const handleSendMessage = async () => {
    const message = inputValue.trim();
    if (!message || !isConnected) return;

    // Add user message to chat with selected MCPs
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

    // Send to Claude with conversation history
    setIsTyping(true);
    setStreamingContent('');

    // Convert chat messages to history format
    const conversationHistory = chatMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Pass all enabled MCPs to backend - system will use them intelligently based on context
    await window.electronAPI.strategizeSend(message, conversationHistory, enabledMCPs);
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

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };


  return (
    <div className="h-full flex flex-col bg-dark-bg">

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
        {/* New Chat Animation */}
        {showNewChatAnimation && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Sparkle particles */}
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-dark-accent-primary rounded-full animate-sparkle"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${1 + Math.random() * 1}s`,
                }}
              >
                <div className="absolute inset-0 bg-dark-accent-primary blur-sm opacity-70"></div>
              </div>
            ))}
            {/* Center text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center animate-fadeInScale">
                <div className="text-4xl mb-2">✨</div>
                <div className="text-lg font-semibold text-dark-accent-primary">
                  Fresh Start!
                </div>
              </div>
            </div>
          </div>
        )}
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
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-dark-accent-primary/20 to-purple-500/20 flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-dark-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-dark-text-primary mb-3">Let's get sh!t done</h3>
            <p className="text-sm text-dark-text-muted max-w-md">
              I'm PM-OS, your workspace assistant. Ask me anything!
            </p>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => {
              const isExpanded = expandedMessages.has(msg.id);

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
                        className="relative group"
                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        {msg.role === 'user' ? (
                          // User messages: Simple display with MCP pills
                          <div className="bg-blue-500 text-white rounded-2xl rounded-br-sm px-3 py-2">
                            <div className="text-xs leading-relaxed">
                              {msg.content}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="text-[9px] opacity-60">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Assistant messages: Expandable with chevron
                          <div
                            className="px-3 py-2 rounded-2xl transition-all bg-dark-surface text-white rounded-bl-sm border border-dark-border"
                          >
                            <div className="flex items-start gap-2">
                              {/* Expand/Collapse chevron */}
                              <button
                                onClick={() => toggleMessageExpansion(msg.id)}
                                className="flex-shrink-0 mt-0.5 hover:opacity-70 transition-opacity cursor-pointer"
                              >
                                <svg
                                  className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs leading-relaxed ${isExpanded ? '' : 'line-clamp-2'} markdown-content`}>
                                  {isExpanded ? (
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        a: ({ node, ...props }) => (
                                          <a
                                            {...props}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              if (props.href) {
                                                window.electronAPI.openExternal(props.href);
                                              }
                                            }}
                                            className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                                          />
                                        ),
                                      }}
                                    >
                                      {msg.content}
                                    </ReactMarkdown>
                                  ) : (
                                    msg.content
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className={`text-[9px] mt-1 opacity-60 ml-5`}>
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        )}

                        {/* Copy button - only show for assistant messages */}
                        {msg.role === 'assistant' && (
                          <button
                            onClick={() => handleCopyMessage(msg.content, msg.id)}
                            className={`absolute -top-2 -right-2 p-1.5 bg-dark-surface border border-dark-border rounded-md
                                      hover:bg-dark-bg transition-all ${
                                        hoveredMessageId === msg.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                      }`}
                            title="Copy message"
                          >
                            {copiedMessageId === msg.id ? (
                              <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        )}
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
                  <div
                    className="relative group"
                    onMouseEnter={() => setHoveredMessageId('streaming')}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-dark-surface border border-dark-border">
                      <div className="text-xs leading-relaxed text-white markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (props.href) {
                                    window.electronAPI.openExternal(props.href);
                                  }
                                }}
                                className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                              />
                            ),
                          }}
                        >
                          {streamingContent}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Copy button for streaming message */}
                    <button
                      onClick={() => handleCopyMessage(streamingContent, 'streaming')}
                      className={`absolute -top-2 -right-2 p-1.5 bg-dark-surface border border-dark-border rounded-md
                                hover:bg-dark-bg transition-all ${
                                  hoveredMessageId === 'streaming' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                }`}
                      title="Copy message"
                    >
                      {copiedMessageId === 'streaming' ? (
                        <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
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

      {/* Input Area - Anchored to bottom */}
      <div className="flex-shrink-0 border-t border-dark-border pt-3 px-3 pb-2 space-y-2">
        {/* Input container with buttons inside */}
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Let's get sh!t done..."
            disabled={!isConnected || isTyping}
            rows={3}
            className="w-full bg-dark-surface border border-dark-border rounded-2xl pl-3 pr-11 pt-3 pb-10
                     text-xs text-dark-text-primary placeholder-dark-text-muted placeholder:text-left
                     focus:outline-none focus:ring-2 focus:ring-dark-accent-primary/50
                     disabled:opacity-50 disabled:cursor-not-allowed resize-none
                     max-h-[150px] overflow-y-auto"
            style={{ height: 'auto' }}
          />

          {/* New Chat button - positioned inside left */}
          {isConnected && (
            <button
              onClick={handleNewChat}
              className="absolute left-2 bottom-4 w-7 h-7 rounded-full bg-dark-bg border border-dark-border text-dark-text-primary
                       flex items-center justify-center hover:bg-dark-accent-primary/10 hover:border-dark-accent-primary/30
                       transition-colors"
              title="New Chat"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          {/* Voice icon (when empty) or Send button (when typing) - positioned inside right */}
          {!inputValue.trim() ? (
            <button
              onClick={toggleVoiceInput}
              className={`absolute right-2 bottom-4 w-7 h-7 rounded-full flex items-center justify-center
                       transition-all disabled:opacity-50 disabled:cursor-not-allowed
                       ${isListening
                         ? 'bg-red-500 text-white animate-pulse'
                         : 'text-dark-text-muted hover:text-dark-text-primary'
                       }`}
              disabled={!isConnected || isTyping || !voiceModelLoaded}
              title={!voiceModelLoaded ? "Loading voice model..." : (isListening ? "Stop recording" : "Start voice input")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!isConnected || isTyping}
              className="absolute right-2 bottom-4 w-7 h-7 rounded-full bg-dark-accent-primary text-white
                       flex items-center justify-center hover:bg-dark-accent-secondary
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
