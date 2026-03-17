-- Add encrypted thumbnail column to documents table
-- Stores AES-encrypted base64 data URL of the first page/attachment thumbnail
-- Follows same encryption pattern as metadata and content columns
ALTER TABLE public.documents ADD COLUMN thumbnail text;
