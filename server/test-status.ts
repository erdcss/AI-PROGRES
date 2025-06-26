/**
 * Direct test endpoint for system status
 */

import express from 'express';
import { getSystemStatus, sendStatusToTelegram } from './simple-system-status';

const testApp = express();
testApp.use(express.json());

// Direct status endpoint
testApp.get('/status', async (req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      error: 'Sistem durumu alınamadı',
      timestamp: new Date().toISOString()
    });
  }
});

// Direct report endpoint
testApp.post('/report', async (req, res) => {
  try {
    const success = await sendStatusToTelegram();
    res.json({ 
      success,
      message: success ? 'Rapor gönderildi' : 'Rapor gönderilemedi'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: `Hata: ${error}` 
    });
  }
});

const port = 5001;
testApp.listen(port, () => {
  console.log(`🧪 Test server running on port ${port}`);
});

export { testApp };