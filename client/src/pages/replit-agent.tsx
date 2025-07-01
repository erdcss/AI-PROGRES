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
  RefreshCw
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
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Load file system structure
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
        setSelectedFile(filePath);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
    }
  };

  // Send message to agent
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

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
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newMessage,
          context: {
            selectedFile,
            fileContent: selectedFile ? fileContent : null,
            fileSystem: fileSystem.slice(0, 10) // Send limited context
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
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
      } else {
        throw new Error('Agent response failed');
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: '❌ Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
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
    try {
      const response = await fetch('/api/agent/apply-changes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes: fileChanges }),
      });

      if (response.ok) {
        toast({
          title: "Değişiklikler Uygulandı!",
          description: `${fileChanges.length} dosya değişikliği başarıyla uygulandı`,
        });
        loadFileSystem();
      } else {
        throw new Error('Failed to apply changes');
      }
    } catch (error) {
      toast({
        title: "Hata!",
        description: "Değişiklikler uygulanırken hata oluştu",
        variant: "destructive"
      });
    }
  };

  // Initialize file system on mount
  useEffect(() => {
    loadFileSystem();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
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
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Aktif</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-100px)]">
        {/* File System Panel */}
        <div className="lg:col-span-1 bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Folder className="w-5 h-5 mr-2" />
              Dosya Sistemi
            </h3>
            <button
              onClick={loadFileSystem}
              disabled={isLoadingFiles}
              className="text-white/60 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="space-y-2 overflow-y-auto max-h-96">
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
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="lg:col-span-3 flex flex-col bg-black/20 backdrop-blur-sm rounded-xl border border-white/10">
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
                disabled={!newMessage.trim() || isTyping}
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
  );
};

export default ReplitAgent;