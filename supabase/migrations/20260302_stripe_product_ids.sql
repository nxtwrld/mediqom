-- Add stripe_product_id to scan_packs (subscription_tiers already has it)
ALTER TABLE public.scan_packs ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

-- Populate known Stripe product IDs
UPDATE public.subscription_tiers SET stripe_product_id = 'prod_TzpztgKGXKmvBj' WHERE id = 'caretaker';
UPDATE public.scan_packs SET stripe_product_id = 'prod_U4iwQotxqfvGQo' WHERE id = 'pack_50';
