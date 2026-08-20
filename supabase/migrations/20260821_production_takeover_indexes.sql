-- Indexes for the production takeover tables added to the live database.
CREATE INDEX IF NOT EXISTS contact_interactions_contact_id_idx
  ON public.contact_interactions(contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS contact_interactions_sequence_id_idx
  ON public.contact_interactions(sequence_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS referrals_referred_user_idx
  ON public.referrals(referred_user_id)
  WHERE referred_user_id IS NOT NULL;
