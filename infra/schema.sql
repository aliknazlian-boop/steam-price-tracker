CREATE TABLE IF NOT EXISTS games (
    appid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    tiny_image TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL PRIMARY KEY,
    appid INTEGER NOT NULL REFERENCES games(appid),
    price_cents INTEGER,
    currency TEXT,
    discount_percent INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_appid_time
  ON price_history(appid, recorded_at DESC);

CREATE TABLE IF NOT EXISTS discount_alert(
    id BIGSERIAL PRIMARY KEY,
    appid INTEGER NOT NULL REFERENCES games(appid),
    email TEXT NOT NULL,
    min_discount_percent INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    latest_trigger TIMESTAMPTZ, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount
    ON discount_alert(appid, active);

ALTER TABLE discount_alert
ADD CONSTRAINT unique_discount_alert
UNIQUE (appid, email, min_discount_percent);