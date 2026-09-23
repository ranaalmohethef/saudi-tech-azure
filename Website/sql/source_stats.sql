-- Pipeline numbers per university, read by the website (/api/stats).
-- cleaned   = records after cleaning, before validation
-- validated = records that passed validation (before the technology filter)

CREATE TABLE IF NOT EXISTS research.source_stats (
    university  text        PRIMARY KEY,
    source      text,
    cleaned     integer     NOT NULL CHECK (cleaned >= 0),
    validated   integer     NOT NULL CHECK (validated >= 0 AND validated <= cleaned),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Current numbers. Running this again updates them instead of duplicating.
INSERT INTO research.source_stats (university, source, cleaned, validated) VALUES
    ('KAUST', 'KAUST Repository 2023 + Crossref',  1133,  1019),
    ('KFUPM', 'KFUPM Pure (OAI-PMH)',               441,   415),
    ('KSU',   'KSU open data',                    41183, 15622),
    ('KAU',   'OpenAlex',                          2428,  2428),
    ('KKU',   'OpenAlex',                          1765,  1765),
    ('PSAU',  'OpenAlex',                          1691,  1691)
ON CONFLICT (university) DO UPDATE
SET source     = EXCLUDED.source,
    cleaned    = EXCLUDED.cleaned,
    validated  = EXCLUDED.validated,
    updated_at = now();
