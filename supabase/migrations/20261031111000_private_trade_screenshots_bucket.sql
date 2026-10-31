-- Phase C: the prior project relied on a Lovable-created Storage bucket.
-- Its RLS policies were migrated, but the bucket metadata was never created.
-- A fresh local Supabase stack needs the private bucket for screenshot uploads.
--
-- Intentionally do not overwrite configuration on an existing hosted bucket;
-- inspect its public/file-size/MIME settings separately during remote migration.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('trade-screenshots','trade-screenshots',false,5242880,
        ARRAY['image/png','image/jpeg','image/webp']::text[])
ON CONFLICT(id) DO NOTHING;
