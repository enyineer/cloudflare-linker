-- Demo data for local development. Idempotent: safe to run repeatedly
-- (INSERT OR IGNORE relies on the unique constraints on hostname / slug / path).
-- Uses the IANA-reserved example.com so there are no real brands or domains.

INSERT OR IGNORE INTO domains (hostname, kind, status)
VALUES ('demo.example.com', 'subdomain', 'active');

INSERT OR IGNORE INTO campaigns (name, slug, utm_source, utm_medium, utm_campaign, notes)
VALUES ('Spring Promo', 'spring-promo', 'newsletter', 'email', 'spring-promo',
        'Demo campaign seeded for local development.');

-- Root/default link for the demo host (also serves as the host catch-all).
INSERT OR IGNORE INTO links (domain_id, path, target_url, redirect_type, query_params, enabled)
SELECT d.id, '/', 'https://example.com/welcome', 301, '[]', 1
FROM domains d
WHERE d.hostname = 'demo.example.com';

-- Campaign-attached link with an extra query parameter.
INSERT OR IGNORE INTO links (domain_id, path, target_url, redirect_type, query_params, campaign_id, enabled)
SELECT d.id, '/promo', 'https://example.com/spring', 302, '[{"key":"ref","value":"flyer"}]', c.id, 1
FROM domains d, campaigns c
WHERE d.hostname = 'demo.example.com' AND c.slug = 'spring-promo';

-- Anonymous demo clicks spread over the last ~14 days so the dashboard has
-- something to show. Only seeded when the clicks table is empty (idempotent).
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
INSERT INTO clicks (link_id, campaign_id, ts, hostname, path, country, region, device_category, browser_family, referer_origin, utm_source, utm_medium, redirect_type)
SELECT
  l.id,
  l.campaign_id,
  unixepoch('now', '-' || (abs(random()) % 14) || ' days', '-' || (abs(random()) % 86400) || ' seconds'),
  d.hostname,
  l.path,
  (CASE abs(random()) % 5 WHEN 0 THEN 'US' WHEN 1 THEN 'DE' WHEN 2 THEN 'GB' WHEN 3 THEN 'FR' ELSE 'CA' END),
  NULL,
  (CASE abs(random()) % 3 WHEN 0 THEN 'mobile' WHEN 1 THEN 'desktop' ELSE 'tablet' END),
  (CASE abs(random()) % 3 WHEN 0 THEN 'Chrome' WHEN 1 THEN 'Safari' ELSE 'Firefox' END),
  NULL,
  (CASE abs(random()) % 4 WHEN 0 THEN 'newsletter' WHEN 1 THEN 'twitter' WHEN 2 THEN 'google' ELSE 'direct' END),
  (CASE abs(random()) % 3 WHEN 0 THEN 'email' WHEN 1 THEN 'social' ELSE 'cpc' END),
  l.redirect_type
FROM seq
JOIN links l ON 1 = 1
JOIN domains d ON d.id = l.domain_id
WHERE d.hostname = 'demo.example.com' AND (SELECT COUNT(*) FROM clicks) = 0;
