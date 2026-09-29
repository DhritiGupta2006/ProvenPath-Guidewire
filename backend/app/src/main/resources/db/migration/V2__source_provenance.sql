-- Where each source comes from: the issuing body, the document, the official URL, and what kind of source it is
-- (REGULATION / REGULATOR_GUIDANCE are verbatim official texts; UNDERWRITING_GUIDELINE / TECHNICAL_SPEC / GOVERNANCE are our own).
ALTER TABLE pp_regulatory_source ADD COLUMN kind VARCHAR(40);
ALTER TABLE pp_regulatory_source ADD COLUMN issuer VARCHAR(300);
ALTER TABLE pp_regulatory_source ADD COLUMN document VARCHAR(500);
ALTER TABLE pp_regulatory_source ADD COLUMN url VARCHAR(500);
