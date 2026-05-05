CREATE TABLE IF NOT EXISTS sample_data (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  value INTEGER NOT NULL
);

INSERT INTO sample_data (name, value)
VALUES
  ('alpha', 10),
  ('beta', 20),
  ('gamma', 30)
ON CONFLICT DO NOTHING;
