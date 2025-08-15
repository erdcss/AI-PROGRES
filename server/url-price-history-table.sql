-- URL Price History Table
-- Stores detailed price movement history for URL tracking system

CREATE TABLE IF NOT EXISTS url_price_history (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  previous_price DECIMAL(10, 2),
  change_amount DECIMAL(10, 2),
  change_percentage DECIMAL(5, 2),
  recorded_at TIMESTAMP DEFAULT NOW(),
  product_title TEXT,
  currency TEXT DEFAULT 'TL',
  FOREIGN KEY (url) REFERENCES url_tracking(url) ON DELETE CASCADE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_url_price_history_url ON url_price_history(url);
CREATE INDEX IF NOT EXISTS idx_url_price_history_recorded_at ON url_price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_price_history_url_date ON url_price_history(url, recorded_at DESC);