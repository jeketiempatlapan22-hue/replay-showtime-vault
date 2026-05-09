
-- Public SELECT for storage gallery so admin can list uploaded images
CREATE POLICY "Anyone can view card-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-images');

CREATE POLICY "Anyone can view member-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'member-photos');
