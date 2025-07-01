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
import { useToast } from "@/hooks/use-toast";

// Enhanced interfaces for all features
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

// Real-time clock component
const RealTimeClock = () => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-sm text-white/60">
      {currentTime}
    </div>
  );
};

const ReplitAgent = () => {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      type: 'agent',
      content: `🤖 **Merhaba! Replit.Agent ile tanışın**

Ben gelişmiş AI kod asistanınızım. Size nasıl yardımcı olabilirim?

**🛠️ Yeteneklerim:**
• **Kod yazma & düzenleme** - TypeScript, React, Node.js ve daha fazlası
• **Bug tespit & düzeltme** - Hataları bulup çözüm öneriyorum
• **API geliştirme** - REST endpoint'leri, database sorguları
• **UI/UX tasarım** - React bileşenleri, responsive tasarım
• **Sistem optimizasyonu** - Performance iyileştirmeleri

**💡 Örnek Sorular:**
• "Bu dosyayı optimize et ve performansını artır"
• "Yeni bir kullanıcı auth sistemi oluştur"
• "Bu hatayı nasıl çözebilirim?"
• "Database şemasını güncelle"
• "Modern bir dashboard tasarla"

**📋 Hızlı başlangıç için aşağıdaki butonları kullanabilir ya da direkt soru sorabilirsiniz!**`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
  const [apiKeyStatus, setApiKeyStatus] = useState<{hasValidKey: boolean, keyPrefix?: string} | null>(null);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update current date/time
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentDateTime(now.toLocaleString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load file system
  const loadFileSystem = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch('/api/agent/files');
      if (response.ok) {
        const data = await response.json();
        setFileSystem(data.files || []);
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
        throw new Error('Save failed');
      }
    } catch (error) {
      toast({
        title: "Hata!",
        description: "Dosya kaydedilemedi",
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
          recentChanges: 0,
          systemStatus: 'Aktif',
          lastSync: data.lastUpdate || new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to load memory context:', error);
    }
  };

  // Check API key status
  const checkApiStatus = async () => {
    try {
      const response = await fetch('/api/agent/api-status');
      if (response.ok) {
        const data = await response.json();
        setApiKeyStatus(data);
      }
    } catch (error) {
      console.error('Failed to check API status:', error);
    }
  };

  // Configure API key
  const configureApiKey = async () => {
    if (!newApiKey.trim() || !newApiKey.startsWith('sk-ant-')) {
      toast({
        title: "Hata",
        description: "Geçerli bir Anthropic API anahtarı girin (sk-ant- ile başlamalı)",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/agent/configure-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: newApiKey }),
      });

      if (response.ok) {
        toast({
          title: "Başarılı",
          description: "API anahtarı güncellendi. AI özellikler artık kullanılabilir.",
        });
        setNewApiKey('');
        setShowApiConfig(false);
        checkApiStatus();
      } else {
        throw new Error('API key update failed');
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "API anahtarı güncellenirken bir hata oluştu",
        variant: "destructive"
      });
    }
  };

  // Send message to agent with conversation history
  const sendMessage = async () => {
    if (!newMessage.trim() || isLoading) return;

    const messageToSend = newMessage;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: messageToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageToSend,
          context: {
            currentFile: selectedFile,
            systemInfo: {
              totalProducts: memoryContext?.totalProducts || 0,
              systemStatus: memoryContext?.systemStatus || 'Unknown'
            }
          },
          conversationHistory: messages.slice(-10) // Send last 10 messages for context
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const agentMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: data.response || 'Yanıt alınamadı',
          timestamp: new Date().toISOString(),
          codeBlocks: data.codeBlocks || [],
          fileChanges: data.fileChanges || []
        };
        setMessages(prev => [...prev, agentMessage]);
      } else {
        throw new Error('Agent response failed');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: '🤖 Özür dilerim, şu anda bir teknik sorun yaşıyorum. Lütfen birkaç saniye sonra tekrar deneyin. Eğer sorun devam ederse, farklı bir şekilde sorunuzu ifade etmeyi deneyebilirsiniz.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Copy message to clipboard
  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Initialize data on mount
  useEffect(() => {
    loadFileSystem();
    loadKnowledge();
    loadMemoryContext();
    checkApiStatus();
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 fixed inset-0 overflow-y-auto">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20"></div>
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
              
              {/* API Status & Configuration */}
              <div className="flex items-center space-x-2">
                {apiKeyStatus?.hasValidKey ? (
                  <div className="flex items-center space-x-2 bg-green-600/20 border border-green-500/30 px-3 py-1 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-green-300 text-xs">AI Aktif</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowApiConfig(true)}
                    className="flex items-center space-x-2 bg-orange-600/20 border border-orange-500/30 hover:bg-orange-600/30 px-3 py-1 rounded-lg transition-colors"
                  >
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span className="text-orange-300 text-xs">API Yapılandır</span>
                  </button>
                )}
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-white/60">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Aktif</span>
              </div>
            </div>
          </div>
        </div>

        {/* API Configuration Modal */}
        {showApiConfig && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700/50 p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">🤖 AI API Yapılandırması</h3>
                <button
                  onClick={() => setShowApiConfig(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Anthropic API Anahtarı
                  </label>
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    console.anthropic.com adresinden API anahtarı alabilirsiniz
                  </p>
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowApiConfig(false)}
                    className="flex-1 bg-gray-600/50 hover:bg-gray-600/70 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={configureApiKey}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

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
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">🚀 E-ticaret Otomasyon</h4>
                      <p className="text-xs text-white/70">Trendyol'dan Shopify'a ürün aktarımı, fiyat ve stok takibi, Telegram bildirimleri</p>
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">🗄️ Database Yapısı</h4>
                      <p className="text-xs text-white/70">PostgreSQL, Drizzle ORM, ürün tabloları, varyant yönetimi, hafıza sistemi</p>
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">🤖 AI Entegrasyonu</h4>
                      <p className="text-xs text-white/70">Anthropic Claude API, ürün kategorilendirme, akıllı etiketleme, feature extraction</p>
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">📊 API Endpoints</h4>
                      <p className="text-xs text-white/70">Express.js routes, TypeScript, error handling, validation, real-time responses</p>
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-orange-300 mb-2">⚛️ Frontend Stack</h4>
                      <p className="text-xs text-white/70">React, TypeScript, Tailwind CSS, Framer Motion, shadcn/ui, wouter routing</p>
                    </div>
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
                  
                  {memoryContext && (
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
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-3xl rounded-lg p-4 ${
                    message.type === 'user' 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-gray-800 text-white border border-gray-700'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                        
                        {/* Enhanced Code blocks */}
                        {message.codeBlocks && message.codeBlocks.map((block, index) => (
                          <div key={index} className="mt-3 bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg border border-gray-700/50 overflow-hidden">
                            <div className="flex items-center justify-between bg-gray-800/50 px-3 py-2 border-b border-gray-700/50">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-blue-400 font-semibold uppercase">{block.language}</span>
                                {block.filename && (
                                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                                    📁 {block.filename}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(block.code);
                                  setCopiedId(`${message.id}-${index}`);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700/50 transition-colors flex items-center space-x-1"
                              >
                                {copiedId === `${message.id}-${index}` ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Kopyalandı</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Kopyala</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-3 text-sm text-gray-300 overflow-x-auto font-mono">
                              <code>{block.code}</code>
                            </pre>
                          </div>
                        ))}
                      </div>
                      
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="ml-2 text-gray-400 hover:text-white transition-colors"
                      >
                        {copiedId === message.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    
                    <div className="mt-2 text-xs opacity-60">
                      {new Date(message.timestamp).toLocaleTimeString('tr-TR')}
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-800 text-white border border-gray-700 rounded-lg p-4 max-w-3xl">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <span className="text-sm text-gray-400 ml-2">Agent düşünüyor...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Message Input */}
            <div className="border-t border-white/10 p-4">
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Agent'inizle bir görev verin... (örn: 'Yeni bir API endpoint oluştur')"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 border border-gray-700"
                    rows={3}
                  />
                </div>
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || isLoading}
                  className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              
              {/* Enhanced Quick Actions */}
              <div className="mt-3 space-y-2">
                <div className="text-xs text-white/60 mb-2">💡 Hızlı İşlemler:</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { text: "🔧 Bu dosyayı optimize et", icon: "⚡" },
                    { text: "🐛 Hataları bul ve düzelt", icon: "🔍" },
                    { text: "📝 Kod açıklaması ekle", icon: "💬" },
                    { text: "🚀 Yeni API endpoint oluştur", icon: "🆕" },
                    { text: "🎨 UI bileşeni tasarla", icon: "🎭" },
                    { text: "🗄️ Database sorgusu yaz", icon: "💾" }
                  ].map((suggestion) => (
                    <button
                      key={suggestion.text}
                      onClick={() => setNewMessage(suggestion.text)}
                      className="text-xs bg-gradient-to-r from-orange-600/20 to-red-600/20 hover:from-orange-600/30 hover:to-red-600/30 text-white/80 hover:text-white px-3 py-2 rounded-lg transition-all duration-200 border border-orange-500/20 hover:border-orange-500/30 flex items-center space-x-1"
                    >
                      <span>{suggestion.icon}</span>
                      <span>{suggestion.text}</span>
                    </button>
                  ))}
                </div>
                
                {/* Context-aware suggestions */}
                {selectedFile && (
                  <div className="mt-2">
                    <div className="text-xs text-orange-400 mb-1">📁 {selectedFile} için:</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Bu dosyayı refactor et",
                        "Performance iyileştirmesi yap",
                        "Test kodu ekle",
                        "Type safety artır"
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setNewMessage(`${suggestion}: ${selectedFile}`)}
                          className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-blue-200 px-2 py-1 rounded-md transition-colors border border-blue-500/30"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Memory context suggestions */}
                {memoryContext && memoryContext.totalProducts > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-purple-400 mb-1">📊 Sistem için:</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Ürün analizi yap",
                        "Database optimizasyonu",
                        "Shopify entegrasyonu geliştir",
                        "Telegram bildirimleri iyileştir"
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setNewMessage(suggestion)}
                          className="text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-purple-200 px-2 py-1 rounded-md transition-colors border border-purple-500/30"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReplitAgent;