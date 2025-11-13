import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Bot, 
  Send, 
  Code, 
  FileText, 
  Terminal, 
  Zap, 
  ArrowLeft, 
  Copy, 
  Check,
  Folder,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  X
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: string;
  codeBlocks?: CodeBlock[];
  fileChanges?: FileChange[];
}

interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

interface FileChange {
  type: 'create' | 'modify' | 'delete';
  path: string;
  content?: string;
  description: string;
}

interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileSystemItem[];
}

interface KnowledgeItem {
  title: string;
  content: string;
  category: string;
  lastUpdated: string;
}

interface MemoryContext {
  totalProducts: number;
  totalVariants: number;
  recentChanges: number;
  systemStatus: string;
  lastSync: string;
}

const ReplitAgent = () => {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'agent',
      content: `👋 Merhaba! Ben Replit.Agent'iniz. Size nasıl yardımcı olabilirim?

🚀 **Yeteneklerim:**
• Kod yazma ve düzenleme
• Yeni dosyalar oluşturma
• Mevcut dosyaları değiştirme
• Uygulama mimarisi geliştirme
• Bug'ları tespit etme ve düzeltme
• API entegrasyonları
• Database şeması güncellemeleri
• Frontend/Backend optimizasyonu

**Örnek Komutlar:**
- "Yeni bir API endpoint oluştur"
- "Bu hatayı düzelt: [hata açıklaması]"
- "Dashboard'a yeni bir bileşen ekle"
- "Database'e yeni tablo ekle"
- "Shopify entegrasyonunu geliştir"

Ne yapmak istiyorsunuz?`,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fileSystem, setFileSystem] = useState<FileSystemItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [memoryContext, setMemoryContext] = useState<MemoryContext | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'knowledge' | 'memory'>('files');
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Update current date and time every second
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('tr-TR');
      const timeStr = now.toLocaleTimeString('tr-TR');
      setCurrentDateTime(`${dateStr} ${timeStr}`);
    };

    updateDateTime();
    const dateTimeInterval = setInterval(updateDateTime, 1000);

    return () => clearInterval(dateTimeInterval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // WebSocket connection and message handling
  useEffect(() => {
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_INTERVAL = 5000; // 5 seconds

    const connectWebSocket = () => {
      try {
        // Production-ready WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        console.log('🔌 Connecting to WebSocket:', wsUrl);
        const socket = new WebSocket(wsUrl);

        // Connection timeout
        const connectionTimeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            console.warn('⏱️ WebSocket connection timeout');
            socket.close();
          }
        }, 10000);

        socket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('✅ WebSocket connected');
          setReconnectAttempts(0); // Reset reconnect attempts on successful connection
          setWs(socket);
        };

        socket.onmessage = (event) => {
          try {
            // Safe JSON parsing with validation
            if (!event.data || typeof event.data !== 'string') {
              console.warn('⚠️ Invalid WebSocket data format');
              return;
            }

            const data = JSON.parse(event.data);

            if (!data || typeof data !== 'object') {
              console.warn('⚠️ Invalid WebSocket message structure');
              return;
            }

            if (data.type === 'agent_response') {
              const agentMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                type: 'agent',
                content: data.response,
                timestamp: new Date().toLocaleTimeString('tr-TR'),
                codeBlocks: data.codeBlocks || [],
                fileChanges: data.fileChanges || []
              };
              setMessages(prev => [...prev, agentMessage]);

              // If there are file changes, reload file system
              if (data.fileChanges && data.fileChanges.length > 0) {
                setTimeout(() => loadFileSystem(), 1000);
              }
            } else if (data.type === 'agent_status') {
              // Handle agent status updates if any
              console.log('Agent status:', data.status);
            }
          } catch (error) {
            console.error('❌ WebSocket message parse error:', error instanceof Error ? error.message : 'Unknown error');
          }
        };

        socket.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.warn('❌ WebSocket disconnected:', event.code, event.reason);
          setWs(null);
          // Attempt to reconnect if not intentionally closed and within limits
          if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const nextReconnectAttempt = reconnectAttempts + 1;
            console.log(`Attempting to reconnect... Attempt ${nextReconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}`);
            setReconnectAttempts(nextReconnectAttempt);
            setTimeout(connectWebSocket, RECONNECT_INTERVAL * Math.pow(2, nextReconnectAttempt - 1)); // Exponential backoff
          } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('Max reconnect attempts reached. Manual reconnection required.');
          }
        };

        socket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          socket.close(); // Ensure close is called on error
        };
      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        setWs(null);
      }
    };

    connectWebSocket();

    // Cleanup function to close WebSocket connection on component unmount
    return () => {
      if (ws) {
        console.log('Closing WebSocket connection');
        ws.close(1000, "Component unmounting");
      }
    };
  }, [reconnectAttempts]); // Re-run effect when reconnectAttempts changes

  // Load file system structure
  const loadFileSystem = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch('/api/agent/files');
      if (response.ok) {
        const data = await response.json();
        setFileSystem(data.files || []);
      } else {
        console.error('Failed to load file system:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to load file system:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Load file content
  const loadFileContent = async (filePath: string) => {
    try {
      const response = await fetch(`/api/agent/file-content?path=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const data = await response.json();
        setFileContent(data.content || '');
        setEditedContent(data.content || '');
        setSelectedFile(filePath);
        setIsEditMode(false);
      } else {
        console.error('Failed to load file content:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
    }
  };

  // Save file content
  const saveFileContent = async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/agent/apply-changes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes: [{
            type: 'modify',
            path: selectedFile,
            content: editedContent,
            description: `Dosya düzenlendi: ${selectedFile}`
          }]
        }),
      });

      if (response.ok) {
        setFileContent(editedContent);
        setIsEditMode(false);
        toast({
          title: "Başarılı!",
          description: "Dosya kaydedildi",
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Save failed');
      }
    } catch (error) {
      toast({
        title: "Hata!",
        description: `Dosya kaydedilemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Load knowledge base
  const loadKnowledge = async () => {
    try {
      const response = await fetch('/api/agent/knowledge');
      if (response.ok) {
        const data = await response.json();
        setKnowledge(data.knowledge || []);
      } else {
        console.error('Failed to load knowledge:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to load knowledge:', error);
    }
  };

  // Load memory context
  const loadMemoryContext = async () => {
    try {
      const response = await fetch('/api/analysis/memory-stats');
      if (response.ok) {
        const data = await response.json();
        setMemoryContext({
          totalProducts: data.totalProducts || 0,
          totalVariants: data.totalVariants || 0,
          recentChanges: 0, // Assuming this is not provided by the API
          systemStatus: data.systemStatus || 'Aktif', // Use API data if available
          lastSync: data.lastUpdate || new Date().toISOString()
        });
      } else {
        console.error('Failed to load memory context:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to load memory context:', error);
    }
  };

  // Send message to agent via WebSocket
  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!ws) {
      toast({
        title: "Bağlantı Yok",
        description: "WebSocket sunucusuna bağlı değil. Lütfen daha sonra tekrar deneyin.",
        variant: "destructive"
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: newMessage,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);

    try {
      const messagePayload = {
        message: newMessage,
        context: {
          selectedFile,
          fileContent: selectedFile ? fileContent : null,
          fileSystem: fileSystem.slice(0, 10) // Send limited context
        }
      };
      ws.send(JSON.stringify({ type: 'user_message', payload: messagePayload }));

    } catch (error) {
      console.error('Failed to send message via WebSocket:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: '❌ Mesaj gönderilemedi. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsTyping(false);
    }
  };

  // Copy code block
  const copyCodeBlock = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Kopyalandı!",
        description: "Kod panoya kopyalandı",
      });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Apply file changes
  const applyFileChanges = async (fileChanges: FileChange[]) => {
    if (!ws) {
      toast({
        title: "Bağlantı Yok",
        description: "WebSocket sunucusuna bağlı değil. Değişiklikler uygulanamadı.",
        variant: "destructive"
      });
      return;
    }
    try {
      const payload = { changes: fileChanges };
      ws.send(JSON.stringify({ type: 'apply_file_changes', payload }));

      toast({
        title: "İstek Gönderildi!",
        description: `${fileChanges.length} dosya değişikliği uygulama isteği gönderildi.`,
      });
      // Assuming the agent will confirm via WebSocket message
      loadFileSystem(); // Optimistically reload file system
    } catch (error) {
      console.error('Failed to send apply file changes request:', error);
      toast({
        title: "Hata!",
        description: "Değişiklikler uygulanırken hata oluştu",
        variant: "destructive"
      });
    }
  };

  // Initialize data on mount
  useEffect(() => {
    loadFileSystem();
    loadKnowledge();
    loadMemoryContext();
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 fixed inset-0 overflow-y-auto">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.1%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 min-h-screen">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setLocation("/")}
              className="text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Bot className="w-8 h-8 text-orange-500" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Replit.Agent</h1>
                <p className="text-sm text-white/60">AI Kod Asistanı</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <RealTimeClock />
            <div className="flex items-center space-x-2 text-sm text-white/60">
              <div className={`w-2 h-2 rounded-full ${ws ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span>{ws ? 'Bağlı' : 'Bağlantı Yok'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
        {/* Enhanced Side Panel with Tabs */}
        <div className="lg:col-span-1 bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                activeTab === 'files'
                  ? 'bg-orange-500/20 text-orange-300 border-b-2 border-orange-500'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Folder className="w-4 h-4 mx-auto mb-1" />
              Dosyalar
            </button>
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                activeTab === 'knowledge'
                  ? 'bg-orange-500/20 text-orange-300 border-b-2 border-orange-500'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bot className="w-4 h-4 mx-auto mb-1" />
              Bilgi
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                activeTab === 'memory'
                  ? 'bg-orange-500/20 text-orange-300 border-b-2 border-orange-500'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap className="w-4 h-4 mx-auto mb-1" />
              Hafıza
            </button>
          </div>

          <div className="p-4 h-full overflow-y-auto">
            {/* File System Tab */}
            {activeTab === 'files' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Dosya Sistemi</h3>
                  <button
                    onClick={loadFileSystem}
                    disabled={isLoadingFiles}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="space-y-2">
                  {fileSystem.map((item, index) => (
                    <div key={index} className="group">
                      <button
                        onClick={() => item.type === 'file' && loadFileContent(item.path)}
                        className={`w-full text-left p-2 rounded-lg transition-colors ${
                          selectedFile === item.path
                            ? 'bg-orange-500/20 text-orange-300'
                            : 'text-white/70 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {item.type === 'folder' ? (
                            <Folder className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                          <span className="text-sm truncate">{item.name}</span>
                        </div>
                        {item.size && (
                          <div className="text-xs text-white/40 mt-1">
                            {(item.size / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Knowledge Base Tab */}
            {activeTab === 'knowledge' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Bilgi Bankası</h3>
                  <button
                    onClick={loadKnowledge}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {knowledge.length > 0 ? (
                    knowledge.map((item, index) => (
                      <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-orange-300 mb-2">{item.title}</h4>
                        <p className="text-xs text-white/70">{item.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/60">Bilgi bankası yükleniyor veya boş.</p>
                  )}
                </div>
              </div>
            )}

            {/* Memory Context Tab */}
            {activeTab === 'memory' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Sistem Hafızası</h3>
                  <button
                    onClick={loadMemoryContext}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {memoryContext ? (
                  <div className="space-y-3">
                    <div className="bg-blue-600/20 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/70">Toplam Ürün</span>
                        <span className="text-lg font-bold text-blue-300">{memoryContext.totalProducts}</span>
                      </div>
                    </div>

                    <div className="bg-purple-600/20 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/70">Toplam Varyant</span>
                        <span className="text-lg font-bold text-purple-300">{memoryContext.totalVariants}</span>
                      </div>
                    </div>

                    <div className="bg-green-600/20 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/70">Sistem Durumu</span>
                        <span className="text-sm font-medium text-green-300">{memoryContext.systemStatus}</span>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="text-sm text-white/70 mb-1">Son Güncelleme</div>
                      <div className="text-xs text-white/50">
                        {new Date(memoryContext.lastSync).toLocaleString('tr-TR')}
                      </div>
                    </div>

                    <div className="bg-yellow-600/20 rounded-lg p-3">
                      <div className="text-sm font-medium text-yellow-300 mb-2">🔄 Aktif Süreçler</div>
                      <div className="text-xs text-white/70">
                        • Otomatik fiyat takibi (12:00)<br/>
                        • Telegram raporları (23:00)<br/>
                        • Shopify senkronizasyonu<br/>
                        • Error detection sistemi
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/60">Hafıza bağlamı yükleniyor...</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 flex flex-col bg-black/20 backdrop-blur-sm rounded-xl border border-white/10">
          {/* File Preview/Editor Section */}
          {selectedFile && (
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-medium text-sm">{selectedFile}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {!isEditMode ? (
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="text-white/60 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setIsEditMode(false);
                          setEditedContent(fileContent);
                        }}
                        className="text-white/60 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={saveFileContent}
                        disabled={isSaving}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin inline" />
                            Kaydediliyor...
                          </>
                        ) : (
                          'Kaydet'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg overflow-hidden">
                {isEditMode ? (
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full h-64 bg-transparent text-white text-sm font-mono p-4 resize-none focus:outline-none"
                    placeholder="Kod düzenleyin..."
                  />
                ) : (
                  <pre className="text-white text-sm font-mono p-4 overflow-auto h-64">
                    <code>{fileContent}</code>
                  </pre>
                )}
              </div>
            </div>
          )}
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-4xl ${message.type === 'user' ? 'bg-orange-600' : 'bg-gray-700'} rounded-xl p-4`}>
                  <div className="flex items-start space-x-3">
                    {message.type === 'agent' && (
                      <Bot className="w-6 h-6 text-orange-500 mt-1 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">
                          {message.type === 'user' ? 'Siz' : 'Replit.Agent'}
                        </span>
                        <span className="text-xs text-white/60">{message.timestamp}</span>
                      </div>

                      <div className="text-white/90 whitespace-pre-wrap">
                        {message.content}
                      </div>

                      {/* Code Blocks */}
                      {message.codeBlocks && message.codeBlocks.map((block, index) => (
                        <div key={index} className="mt-4 bg-gray-900 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
                            <div className="flex items-center space-x-2">
                              <Code className="w-4 h-4 text-orange-500" />
                              <span className="text-sm text-white/80">
                                {block.filename || block.language}
                              </span>
                            </div>
                            <button
                              onClick={() => copyCodeBlock(block.code, `${message.id}-${index}`)}
                              className="text-white/60 hover:text-white transition-colors"
                            >
                              {copiedId === `${message.id}-${index}` ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <pre className="p-4 text-sm text-white/90 overflow-x-auto">
                            <code>{block.code}</code>
                          </pre>
                        </div>
                      ))}

                      {/* File Changes */}
                      {message.fileChanges && message.fileChanges.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <h4 className="text-sm font-medium text-white flex items-center">
                            <Zap className="w-4 h-4 mr-2 text-yellow-500" />
                            Dosya Değişiklikleri
                          </h4>
                          {message.fileChanges.map((change, index) => (
                            <div key={index} className="bg-gray-800 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {change.type === 'create' && <Plus className="w-4 h-4 text-green-500" />}
                                  {change.type === 'modify' && <Edit3 className="w-4 h-4 text-blue-500" />}
                                  {change.type === 'delete' && <Trash2 className="w-4 h-4 text-red-500" />}
                                  <span className="text-sm text-white/80">{change.path}</span>
                                </div>
                              </div>
                              <p className="text-xs text-white/60 mt-1">{change.description}</p>
                            </div>
                          ))}
                          <button
                            onClick={() => applyFileChanges(message.fileChanges!)}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium"
                          >
                            Değişiklikleri Uygula
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-gray-700 rounded-xl p-4">
                  <div className="flex items-center space-x-3">
                    <Bot className="w-6 h-6 text-orange-500" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="border-t border-white/10 p-6">
            <div className="flex space-x-4">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Agent'inize bir görev verin... (örn: 'Yeni bir API endpoint oluştur')"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || isTyping || !ws}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Yeni bir React bileşeni oluştur",
                "API endpoint'i düzelt",
                "Database şemasını güncelle",
                "CSS stil sorununu çöz",
                "TypeScript hatalarını gider"
              ].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setNewMessage(suggestion)}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white/70 hover:text-white px-3 py-1 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ReplitAgent;