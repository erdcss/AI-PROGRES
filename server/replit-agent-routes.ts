import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { promisify } from 'util';

const router = Router();

// Initialize Anthropic client dynamically
const getAnthropicClient = () => {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
};

// The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219"
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileSystemItem[];
}

interface FileChange {
  type: 'create' | 'modify' | 'delete';
  path: string;
  content?: string;
  description: string;
}

interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

// AI Chat endpoint with comprehensive capabilities and fallback system
router.post('/chat', async (req, res) => {
  try {
    const { message, context, conversationHistory } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Mesaj gerekli'
      });
    }

    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.length < 10) {
      return res.json({
        success: true,
        response: `🤖 **Replit Agent - Fallback Mode**

Merhaba! Şu anda AI API bağlantısı mevcut değil, ancak size yardımcı olmaya devam edebilirim.

**📋 Önerilerim:**

**Kod Geliştirme İçin:**
- **TypeScript hatalarını gidermek**: \`npm run type-check\` komutu çalıştırın
- **React bileşeni oluşturmak**: shadcn/ui bileşenlerini kullanın
- **API endpoint eklemek**: server/routes.ts dosyasına yeni route ekleyin
- **Database şeması güncellemek**: shared/schema.ts dosyasını düzenleyin

**Mevcut Sistem:**
${context?.currentFile ? `- Açık dosya: ${context.currentFile}` : ''}
${context?.systemInfo ? `- Sistem durumu: ${context.systemInfo.systemStatus}` : ''}
${context?.systemInfo ? `- Toplam ürün: ${context.systemInfo.totalProducts}` : ''}

**🔧 Hızlı Çözümler:**
- Dosya sistemi explorer kullanarak dosyaları görüntüleyin
- Knowledge base'den proje dokümantasyonunu inceleyin
- Memory context'den sistem durumunu kontrol edin

Tam AI desteği için lütfen geçerli bir Anthropic API anahtarı sağlayın.`,
        codeBlocks: [],
        fileChanges: [],
        timestamp: new Date().toISOString()
      });
    }

    // Build system prompt with project context
    const systemPrompt = `Sen Replit.Agent'sın - gelişmiş bir AI kod asistanısın. Türkçe olarak yanıt ver.

**Yeteneklerin:**
- Her türlü programlama dilinde kod yazma ve düzenleme
- Bug analizi ve düzeltme önerileri
- Kod optimizasyonu ve refactoring
- API ve veritabanı tasarımı
- Frontend ve backend geliştirme
- TypeScript, React, Node.js, SQL uzmanı
- Sistem mimarisi ve tasarım desenleri

**Mevcut Proje Bağlamı:**
- E-ticaret otomasyon sistemi (Trendyol → Shopify)
- Tech Stack: TypeScript, React, Express.js, PostgreSQL, Drizzle ORM
- Özellikler: Ürün scraping, AI analizi, otomatik fiyatlandırma, Telegram bildirimleri
- API Endpoints: /api/scrape, /api/shopify/*, /api/analysis/*, /api/memory/*

**Kullanıcı Konteksti:**
${context?.currentFile ? `- Şu anda açık dosya: ${context.currentFile}` : ''}
${context?.systemInfo ? `- Sistem durumu: ${context.systemInfo.systemStatus}` : ''}
${context?.systemInfo ? `- Toplam ürün: ${context.systemInfo.totalProducts}` : ''}

**Davranış Kuralları:**
- Pratik, uygulanabilir çözümler sun
- Kod örnekleri verirken tam kod blokları kullan
- Hataları tespit ettiğinde düzeltme önerileri sun
- Dosya değişikliği gerekiyorsa belirt
- Türkçe açıklama yap ama kod yorumları İngilizce olabilir`;

    // Prepare conversation history for context (without system message)
    let messages: any[] = [];

    // Add conversation history if provided (filter out system messages)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.forEach((msg: any) => {
        if (msg.type === 'user' && msg.role !== 'system') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.type === 'agent' && msg.role !== 'system') {
          messages.push({ role: 'assistant', content: msg.content });
        }
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Filter out any system messages that might have slipped through
    messages = messages.filter(msg => msg.role !== 'system');

    // Call Anthropic API with dynamic client
    const anthropicClient = getAnthropicClient();
    const response = await anthropicClient.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 4000,
      system: systemPrompt,
      messages: messages
    });

    const responseText = (response.content[0] as any)?.text || 'Yanıt alınamadı';

    // Parse response for code blocks and file changes
    const codeBlocks = extractCodeBlocks(responseText);
    const fileChanges = extractFileChanges(responseText);

    res.json({
      success: true,
      response: responseText,
      codeBlocks,
      fileChanges,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    
    // Enhanced fallback response for API errors
    const fallbackResponse = `🤖 **Replit Agent - Teknik Destek**

Şu anda AI API ile bağlantı sorunu yaşıyorum, ancak size yardımcı olmaya devam edebilirim.

**🔧 Genel Kod Yardımı:**

**TypeScript/React İçin:**
- Component oluşturma: \`function MyComponent() { return <div>Content</div>; }\`
- State kullanımı: \`const [value, setValue] = useState('')\`
- API çağrısı: \`useQuery({ queryKey: ['/api/endpoint'] })\`

**Express.js API İçin:**
- Route ekleme: \`router.get('/api/endpoint', (req, res) => { res.json({success: true}); })\`
- Middleware: \`app.use(express.json())\`

**Database (Drizzle) İçin:**
- Tablo tanımı: \`export const table = pgTable('name', { id: serial('id').primaryKey() })\`
- Sorgu: \`await db.select().from(table)\`

Tam AI desteği için API anahtarını kontrol ediniz.`;

    res.json({
      success: true,
      response: fallbackResponse,
      codeBlocks: [],
      fileChanges: [],
      timestamp: new Date().toISOString()
    });
  }
});

// Extract code blocks from AI response
function extractCodeBlocks(text: string) {
  const codeBlocks: Array<{language: string, code: string, filename?: string}> = [];
  const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();
    
    // Check if filename is mentioned in the code block
    const filenameMatch = code.match(/^\/\/ (.+\.(ts|tsx|js|jsx|css|html|json))/);
    const filename = filenameMatch ? filenameMatch[1] : undefined;
    
    codeBlocks.push({ language, code, filename });
  }
  
  return codeBlocks;
}

// Extract file change suggestions from AI response
function extractFileChanges(text: string) {
  const fileChanges: Array<{type: string, path: string, description: string}> = [];
  
  // Look for file modification suggestions
  const fileChangePatterns = [
    /Dosyayı?\s+([^\s]+\.(ts|tsx|js|jsx|css|html|json))\s+(?:güncelleyin?|değiştirin?|düzenleyin?)/gi,
    /([^\s]+\.(ts|tsx|js|jsx|css|html|json))\s+dosyasını?\s+(?:güncelleyin?|değiştirin?|düzenleyin?)/gi
  ];
  
  fileChangePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const path = match[1];
      fileChanges.push({
        type: 'modify',
        path,
        description: `${path} dosyasını güncelle`
      });
    }
  });
  
  return fileChanges;
}

// API Key configuration endpoint
router.post('/configure-api', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return res.status(400).json({
        success: false,
        error: 'Geçerli bir Anthropic API anahtarı gerekli (sk-ant- ile başlamalı)'
      });
    }

    // Update the environment variable
    process.env.ANTHROPIC_API_KEY = apiKey;
    
    res.json({
      success: true,
      message: 'API anahtarı başarıyla güncellendi'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'API anahtarı güncellenirken hata oluştu'
    });
  }
});

// Get API key status
router.get('/api-status', async (req, res) => {
  try {
    const hasValidKey = process.env.ANTHROPIC_API_KEY && 
                       process.env.ANTHROPIC_API_KEY.length > 10 && 
                       process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
    
    res.json({
      success: true,
      hasValidKey,
      keyPrefix: hasValidKey ? process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...' : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'API anahtarı durumu kontrol edilemedi'
    });
  }
});

// Get knowledge base
router.get('/knowledge', async (req, res) => {
  try {
    const knowledge = [
      {
        title: "E-ticaret Otomasyon Sistemi",
        content: "Trendyol'dan Shopify'a otomatik ürün aktarımı, fiyat ve stok takibi, Telegram bildirimleri. 15% kar marjı ile otomatik fiyatlandırma.",
        category: "System Overview",
        lastUpdated: new Date().toISOString()
      },
      {
        title: "Database Yapısı",
        content: "PostgreSQL + Drizzle ORM. Ana tablolar: products, productVariants, priceHistory, stockHistory. Memory sistem ile real-time tracking.",
        category: "Database",
        lastUpdated: new Date().toISOString()
      },
      {
        title: "API Endpoints",
        content: "Express.js routes: /api/scrape (ürün çekme), /api/shopify/* (Shopify ops), /api/analysis/* (dashboard), /api/memory/* (hafıza). TypeScript + validation.",
        category: "API",
        lastUpdated: new Date().toISOString()
      },
      {
        title: "AI Entegrasyonu",
        content: "Anthropic Claude API ile akıllı ürün kategorilendirme, etiketleme, feature extraction. Automatic Türkçe content generation.",
        category: "AI",
        lastUpdated: new Date().toISOString()
      },
      {
        title: "Frontend Stack",
        content: "React + TypeScript + Tailwind CSS + Framer Motion + shadcn/ui. Wouter routing, React Query, real-time updates, responsive design.",
        category: "Frontend",
        lastUpdated: new Date().toISOString()
      },
      {
        title: "Automation Features",
        content: "Scheduled tasks: 12:00 monitoring, 23:00 reports. Real-time Shopify sync, Telegram notifications, error detection, price/stock tracking.",
        category: "Automation",
        lastUpdated: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      knowledge
    });
  } catch (error) {
    console.error('Knowledge base error:', error);
    res.status(500).json({
      success: false,
      error: 'Bilgi bankası yüklenemedi'
    });
  }
});

// Get file system structure
router.get('/files', async (req, res) => {
  try {
    const projectRoot = process.cwd();
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      '.replit',
      'attached_assets',
      'exports',
      '.env'
    ];

    const getFileSystem = async (dirPath: string, relativePath: string = ''): Promise<FileSystemItem[]> => {
      const items: FileSystemItem[] = [];
      
      try {
        const entries = await readdir(dirPath);
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const relativeEntryPath = path.join(relativePath, entry);
          
          // Skip excluded patterns
          if (excludePatterns.some(pattern => entry.includes(pattern))) {
            continue;
          }
          
          try {
            const stats = await stat(fullPath);
            
            if (stats.isDirectory()) {
              const children = await getFileSystem(fullPath, relativeEntryPath);
              items.push({
                name: entry,
                type: 'folder',
                path: relativeEntryPath,
                lastModified: stats.mtime.toISOString(),
                children: children.length > 0 ? children : undefined
              });
            } else if (stats.isFile()) {
              // Only include relevant file types
              const ext = path.extname(entry).toLowerCase();
              const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md', '.txt'];
              
              if (relevantExtensions.includes(ext)) {
                items.push({
                  name: entry,
                  type: 'file',
                  path: relativeEntryPath,
                  size: stats.size,
                  lastModified: stats.mtime.toISOString()
                });
              }
            }
          } catch (error) {
            console.error(`Error processing ${fullPath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
      }
      
      return items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const fileSystem = await getFileSystem(projectRoot);
    
    res.json({
      success: true,
      files: fileSystem
    });
  } catch (error) {
    console.error('File system error:', error);
    res.status(500).json({
      success: false,
      error: 'Dosya sistemi okunamadı'
    });
  }
});

// Get file content
router.get('/file-content', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Dosya yolu belirtilmedi'
      });
    }

    const fullPath = path.join(process.cwd(), filePath);
    
    // Security check - ensure path is within project directory
    const projectRoot = process.cwd();
    if (!fullPath.startsWith(projectRoot)) {
      return res.status(403).json({
        success: false,
        error: 'Erişim reddedildi'
      });
    }

    const content = await readFile(fullPath, 'utf-8');
    
    res.json({
      success: true,
      content,
      path: filePath
    });
  } catch (error) {
    console.error('File read error:', error);
    res.status(500).json({
      success: false,
      error: 'Dosya okunamadı'
    });
  }
});

// AI Chat endpoint for code assistance
router.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mesaj boş olamaz'
      });
    }

    // Analyze the user's request and provide intelligent responses
    const response = await processAgentRequest(message, context);
    
    res.json({
      success: true,
      response: response.message,
      codeBlocks: response.codeBlocks || [],
      fileChanges: response.fileChanges || []
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Agent yanıt veremedi'
    });
  }
});

// Apply file changes
router.post('/apply-changes', async (req, res) => {
  try {
    const { changes } = req.body;
    
    if (!Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz değişiklik listesi'
      });
    }

    const results = [];
    
    for (const change of changes as FileChange[]) {
      try {
        const fullPath = path.join(process.cwd(), change.path);
        
        // Security check
        if (!fullPath.startsWith(process.cwd())) {
          throw new Error('Erişim reddedildi');
        }

        switch (change.type) {
          case 'create':
            // Ensure directory exists
            await mkdir(path.dirname(fullPath), { recursive: true });
            await writeFile(fullPath, change.content || '', 'utf-8');
            results.push({ path: change.path, status: 'created' });
            break;
            
          case 'modify':
            await writeFile(fullPath, change.content || '', 'utf-8');
            results.push({ path: change.path, status: 'modified' });
            break;
            
          case 'delete':
            await unlink(fullPath);
            results.push({ path: change.path, status: 'deleted' });
            break;
        }
      } catch (error) {
        console.error(`Error applying change to ${change.path}:`, error);
        results.push({ 
          path: change.path, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Apply changes error:', error);
    res.status(500).json({
      success: false,
      error: 'Değişiklikler uygulanamadı'
    });
  }
});

// Process agent requests with intelligent responses
async function processAgentRequest(message: string, context: any): Promise<{
  message: string;
  codeBlocks?: CodeBlock[];
  fileChanges?: FileChange[];
}> {
  const lowerMessage = message.toLowerCase();
  
  // API endpoint creation
  if (lowerMessage.includes('api endpoint') || lowerMessage.includes('yeni endpoint')) {
    return {
      message: `🚀 **Yeni API Endpoint Oluşturuldu**

Express.js tabanlı yeni bir API endpoint oluşturdım. Bu endpoint:

• RESTful yapıda tasarlandı
• Error handling ve validation içeriyor
• TypeScript tip güvenliği sağlıyor
• JSON response formatında çalışıyor

Endpoint'i test etmek için Postman veya curl kullanabilirsiniz.`,
      codeBlocks: [
        {
          language: 'typescript',
          filename: 'server/new-endpoint.ts',
          code: `import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schema
const requestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  data: z.object({}).optional()
});

// GET endpoint
router.get('/data', async (req, res) => {
  try {
    // Your logic here
    const data = {
      message: 'Success',
      timestamp: new Date().toISOString(),
      items: []
    };
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST endpoint
router.post('/data', async (req, res) => {
  try {
    const validatedData = requestSchema.parse(req.body);
    
    // Process the data
    const result = {
      id: Date.now().toString(),
      ...validatedData,
      createdAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    console.error('POST /data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;`
        }
      ],
      fileChanges: [
        {
          type: 'create',
          path: 'server/new-endpoint.ts',
          content: `import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schema
const requestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  data: z.object({}).optional()
});

// GET endpoint
router.get('/data', async (req, res) => {
  try {
    // Your logic here
    const data = {
      message: 'Success',
      timestamp: new Date().toISOString(),
      items: []
    };
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST endpoint
router.post('/data', async (req, res) => {
  try {
    const validatedData = requestSchema.parse(req.body);
    
    // Process the data
    const result = {
      id: Date.now().toString(),
      ...validatedData,
      createdAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    console.error('POST /data error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;`,
          description: 'Yeni API endpoint dosyası oluşturuldu'
        }
      ]
    };
  }
  
  // React component creation
  if (lowerMessage.includes('react') && (lowerMessage.includes('component') || lowerMessage.includes('bileşen'))) {
    return {
      message: `⚛️ **Yeni React Bileşeni Oluşturuldu**

Modern React bileşeni oluşturdım. Bu bileşen:

• TypeScript ile tip güvenli
• Responsive tasarım
• State management ile interaktif
• Tailwind CSS ile stillendi
• Accessibility standartlarına uygun

Bileşeni projenizde import ederek kullanabilirsiniz.`,
      codeBlocks: [
        {
          language: 'tsx',
          filename: 'client/src/components/NewComponent.tsx',
          code: `import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, X } from 'lucide-react';

interface NewComponentProps {
  title?: string;
  onSubmit?: (data: any) => void;
  isLoading?: boolean;
}

export const NewComponent: React.FC<NewComponentProps> = ({
  title = "Yeni Bileşen",
  onSubmit,
  isLoading = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsValid(inputValue.length > 2);
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && onSubmit) {
      onSubmit({ value: inputValue });
      setMessage('İşlem başarılı!');
      setInputValue('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md mx-auto"
    >
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-white flex items-center">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Bir değer girin..."
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                disabled={isLoading}
              />
              <div className="flex items-center text-sm">
                {isValid ? (
                  <div className="flex items-center text-green-400">
                    <Check className="w-4 h-4 mr-1" />
                    Geçerli
                  </div>
                ) : (
                  <div className="flex items-center text-red-400">
                    <X className="w-4 h-4 mr-1" />
                    En az 3 karakter gerekli
                  </div>
                )}
              </div>
            </div>
            
            <Button
              type="submit"
              disabled={!isValid || isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                'Gönder'
              )}
            </Button>
          </form>
          
          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center text-green-400 text-sm font-medium"
            >
              {message}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default NewComponent;`
        }
      ],
      fileChanges: [
        {
          type: 'create',
          path: 'client/src/components/NewComponent.tsx',
          content: `import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, X } from 'lucide-react';

interface NewComponentProps {
  title?: string;
  onSubmit?: (data: any) => void;
  isLoading?: boolean;
}

export const NewComponent: React.FC<NewComponentProps> = ({
  title = "Yeni Bileşen",
  onSubmit,
  isLoading = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsValid(inputValue.length > 2);
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && onSubmit) {
      onSubmit({ value: inputValue });
      setMessage('İşlem başarılı!');
      setInputValue('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md mx-auto"
    >
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-white flex items-center">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Bir değer girin..."
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                disabled={isLoading}
              />
              <div className="flex items-center text-sm">
                {isValid ? (
                  <div className="flex items-center text-green-400">
                    <Check className="w-4 h-4 mr-1" />
                    Geçerli
                  </div>
                ) : (
                  <div className="flex items-center text-red-400">
                    <X className="w-4 h-4 mr-1" />
                    En az 3 karakter gerekli
                  </div>
                )}
              </div>
            </div>
            
            <Button
              type="submit"
              disabled={!isValid || isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                'Gönder'
              )}
            </Button>
          </form>
          
          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center text-green-400 text-sm font-medium"
            >
              {message}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default NewComponent;`,
          description: 'Yeni React bileşeni oluşturuldu'
        }
      ]
    };
  }
  
  // Database schema updates
  if (lowerMessage.includes('database') || lowerMessage.includes('schema') || lowerMessage.includes('tablo')) {
    return {
      message: `🗄️ **Database Şeması Güncellendi**

Drizzle ORM kullanarak yeni database şeması oluşturdım:

• TypeScript tip güvenliği
• İlişkiler ve indexler
• Validation kuralları
• Migration desteği

Şemayı uygulamak için \`npm run db:push\` komutunu çalıştırın.`,
      codeBlocks: [
        {
          language: 'typescript',
          filename: 'shared/new-schema.ts',
          code: `import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// New table schema
export const newTable = pgTable('new_table', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Relations
export const newTableRelations = relations(newTable, ({ one, many }) => ({
  user: one(users, {
    fields: [newTable.userId],
    references: [users.id]
  }),
  // Add more relations as needed
}));

// Zod schemas for validation
export const insertNewTableSchema = createInsertSchema(newTable, {
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending']).default('active')
});

export const selectNewTableSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  metadata: z.any().nullable(),
  isActive: z.boolean(),
  userId: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Types
export type InsertNewTable = z.infer<typeof insertNewTableSchema>;
export type SelectNewTable = typeof newTable.$inferSelect;`
        }
      ],
      fileChanges: [
        {
          type: 'create',
          path: 'shared/new-schema.ts',
          content: `import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// New table schema
export const newTable = pgTable('new_table', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Relations
export const newTableRelations = relations(newTable, ({ one, many }) => ({
  user: one(users, {
    fields: [newTable.userId],
    references: [users.id]
  }),
  // Add more relations as needed
}));

// Zod schemas for validation
export const insertNewTableSchema = createInsertSchema(newTable, {
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending']).default('active')
});

export const selectNewTableSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  metadata: z.any().nullable(),
  isActive: z.boolean(),
  userId: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Types
export type InsertNewTable = z.infer<typeof insertNewTableSchema>;
export type SelectNewTable = typeof newTable.$inferSelect;`,
          description: 'Yeni database şeması oluşturuldu'
        }
      ]
    };
  }

  // CSS/Styling fixes
  if (lowerMessage.includes('css') || lowerMessage.includes('stil') || lowerMessage.includes('design')) {
    return {
      message: `🎨 **CSS Stilleri Güncellendi**

Responsive ve modern CSS stilleri oluşturdım:

• Tailwind CSS utility classes
• Responsive breakpoints
• Dark mode desteği
• Animation ve transitions
• Accessibility improvements

Stiller otomatik olarak uygulanacak.`,
      codeBlocks: [
        {
          language: 'css',
          filename: 'styles/custom.css',
          code: `/* Custom CSS Styles */

/* Modern gradient backgrounds */
.gradient-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Custom animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in-up {
  animation: fadeInUp 0.6s ease-out;
}

/* Card hover effects */
.card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-hover:hover {
  transform: translateY(-8px);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Button styles */
.btn-primary {
  @apply bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105;
}

/* Responsive utilities */
@media (max-width: 768px) {
  .mobile-padding {
    @apply px-4 py-6;
  }
  
  .mobile-text {
    @apply text-sm;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .auto-dark {
    @apply bg-gray-900 text-white;
  }
}

/* Loading states */
.loading-skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Focus states for accessibility */
.focus-ring {
  @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
}`
        }
      ],
      fileChanges: [
        {
          type: 'create',
          path: 'client/src/styles/custom.css',
          content: `/* Custom CSS Styles */

/* Modern gradient backgrounds */
.gradient-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Custom animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in-up {
  animation: fadeInUp 0.6s ease-out;
}

/* Card hover effects */
.card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-hover:hover {
  transform: translateY(-8px);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Button styles */
.btn-primary {
  @apply bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105;
}

/* Responsive utilities */
@media (max-width: 768px) {
  .mobile-padding {
    @apply px-4 py-6;
  }
  
  .mobile-text {
    @apply text-sm;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .auto-dark {
    @apply bg-gray-900 text-white;
  }
}

/* Loading states */
.loading-skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Focus states for accessibility */
.focus-ring {
  @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
}`,
          description: 'Custom CSS dosyası oluşturuldu'
        }
      ]
    };
  }

  // Generic helpful response
  return {
    message: `🤖 **Replit.Agent Yanıtı**

Mesajınızı aldım! Size yardımcı olmak için elimden geleni yapacağım.

**Yapabileceğim şeyler:**
• Kod yazma ve düzenleme
• API endpoint'leri oluşturma
• React bileşenleri geliştirme
• Database şeması tasarlama
• Bug'ları tespit etme ve düzeltme
• CSS/Styling sorunlarını çözme
• TypeScript tip güvenliği ekleme

**Daha spesifik olmak için şunları deneyebilirsiniz:**
- "Yeni bir API endpoint oluştur"
- "React bileşeni geliştir"
- "Database tablosu ekle"
- "Bu hatayı düzelt: [hata açıklaması]"
- "CSS stillerini iyileştir"

Ne yapmamı istiyorsunuz?`,
    codeBlocks: [],
    fileChanges: []
  };
}

export default router;