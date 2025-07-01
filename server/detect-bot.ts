export async function detectAndBypassProtection(page: any) {
  // Gelişmiş bot algılama scriptlerini tespit et ve engelle
  const scripts = await page.evaluate(() => {
    return Array.from(document.scripts).map(script => script.src);
  });

  // Request interception'ı aktifleştir
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    const url = request.url();
    const resourceType = request.resourceType();
    
    // Bot algılama servislerini engelle
    if (
      url.includes('datadome') ||
      url.includes('imperva') ||
      url.includes('perimeterx') ||
      url.includes('akamai') ||
      url.includes('cloudflare') ||
      url.includes('recaptcha') ||
      url.includes('hcaptcha') ||
      url.includes('funcaptcha') ||
      url.includes('bot-detection') ||
      url.includes('antibot') ||
      url.includes('challenge') ||
      url.includes('protection') ||
      url.includes('fingerprint') ||
      url.includes('device-check') ||
      url.includes('browser-check')
    ) {
      console.log(`Bot algılama engellendi: ${url}`);
      request.abort();
      return;
    }
    
    // Gereksiz kaynak türlerini engelle (performans artışı)
    if (['stylesheet', 'font', 'media'].includes(resourceType)) {
      request.abort();
      return;
    }
    
    request.continue();
  });

  // Gelişmiş bot algılama bypass teknikleri
  await page.evaluateOnNewDocument(() => {
    // Tüm bilinen bot algılama değişkenlerini gizle
    const botProperties = [
      '_phantom', '__nightmare', 'callPhantom', '_selenium', 'selenium',
      'domAutomation', 'domAutomationController', '_WEBDRIVER_ELEM_CACHE',
      '__webdriver_script_fn', '__driver_evaluate', '__webdriver_evaluate',
      '__selenium_evaluate', '__fxdriver_evaluate', '__driver_unwrapped',
      '__webdriver_unwrapped', '__selenium_unwrapped', '__fxdriver_unwrapped',
      '__webdriver_script_func', '__webdriver_script_function',
      'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
      'cdc_adoQpoasnfa76pfcZLmcfl_Symbol', '$chrome_asyncScriptInfo',
      '$cdc_asdjflasutopfhvcZLmcfl_', 'webdriver', 'driver-evaluate',
      'webdriver-evaluate', 'selenium-evaluate', 'webdriverCommand',
      'webdriver-evaluate-response', '_Selenium_IDE_Recorder', 
      'calledSelenium', '_selenium', 'calledPhantom', '__phantomas'
    ];

    botProperties.forEach(prop => {
      try {
        delete (window as any)[prop];
        delete (document as any)[prop];
      } catch (e) {}
    });

    // Navigator özelliklerini gizle
    Object.defineProperty(navigator, 'webdriver', { 
      get: () => false,
      configurable: true 
    });
    
    Object.defineProperty(navigator, 'automationController', { 
      get: () => undefined,
      configurable: true 
    });

    // Chrome Runtime'ı gizle
    if ((window as any).chrome) {
      Object.defineProperty((window as any).chrome, 'runtime', {
        get: () => undefined,
        configurable: true
      });
    }

    // Permissions API'yi override et
    if (navigator.permissions && navigator.permissions.query) {
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = (parameters) => {
        return parameters.name === 'notifications' 
          ? Promise.resolve({ state: 'denied' })
          : originalQuery(parameters);
      };
    }

    // WebGL renderer bilgilerini gizle
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter(parameter);
    };

    // Plugin bilgilerini normalize et
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: {} },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        }
      ],
      configurable: true
    });

    // User Agent string'ini normalize et
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true
    });

    // Language bilgilerini normalize et
    Object.defineProperty(navigator, 'languages', {
      get: () => ['tr-TR', 'tr', 'en-US', 'en'],
      configurable: true
    });

    // Screen bilgilerini normalize et
    Object.defineProperty(screen, 'width', { get: () => 1920 });
    Object.defineProperty(screen, 'height', { get: () => 1080 });
    Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
    Object.defineProperty(screen, 'availHeight', { get: () => 1040 });

    // Timezone bilgilerini normalize et
    if (Intl && Intl.DateTimeFormat) {
      const originalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(...args) {
        if (args.length === 0) {
          return new originalDateTimeFormat('tr-TR');
        }
        return new originalDateTimeFormat(...args);
      };
    }

    // Function.prototype.toString bypass
    const originalFunction = Function.prototype.toString;
    Function.prototype.toString = function() {
      if (this === Function.prototype.toString) {
        return 'function toString() { [native code] }';
      }
      if (this === window.alert) {
        return 'function alert() { [native code] }';
      }
      if (this === window.prompt) {
        return 'function prompt() { [native code] }';
      }
      if (this === window.confirm) {
        return 'function confirm() { [native code] }';
      }
      return originalFunction.call(this);
    };

    // Console mesajlarını filtrele
    ['debug', 'info', 'warn', 'error', 'log'].forEach(method => {
      const originalMethod = console[method];
      console[method] = function(...args) {
        const message = args.join(' ');
        if (/selenium|webdriver|puppeteer|phantom|automation|bot.?detect|headless|chrome.?driver/i.test(message)) {
          return;
        }
        return originalMethod.apply(this, args);
      };
    });

    // Mouse ve keyboard event'lerini simüle et
    let mouseX = Math.floor(Math.random() * 800) + 100;
    let mouseY = Math.floor(Math.random() * 600) + 100;
    
    setInterval(() => {
      mouseX += (Math.random() - 0.5) * 20;
      mouseY += (Math.random() - 0.5) * 20;
      
      if (mouseX < 0) mouseX = 0;
      if (mouseY < 0) mouseY = 0;
      if (mouseX > window.innerWidth) mouseX = window.innerWidth;
      if (mouseY > window.innerHeight) mouseY = window.innerHeight;
      
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: mouseX,
        clientY: mouseY,
        bubbles: true
      }));
    }, Math.random() * 5000 + 1000);

    // Canvas fingerprinting'i engelle
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png') {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      }
      return originalToDataURL.apply(this, arguments);
    };

    // Audio fingerprinting'i engelle
    const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function() {
      const analyser = originalCreateAnalyser.call(this);
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
      analyser.getFloatFrequencyData = function(array) {
        const result = originalGetFloatFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] = array[i] + Math.random() * 0.0001;
        }
        return result;
      };
      return analyser;
    };

    console.log('Gelişmiş bot koruması aktifleştirildi');
  });

  // Rastgele gecikme ekle (daha human-like davranış)
  await page.waitForTimeout(Math.random() * 2000 + 1000);
  
  // User-Agent ve diğer header'ları ayarla
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  });

  // Viewport'u gerçekçi bir boyuta ayarla
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });
}
