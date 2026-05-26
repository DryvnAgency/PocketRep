import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type V2Tag = { id: string; name: string; color: string };

export function useTags() {
  const [tags, setTags] = useState<V2Tag[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('tags')
      .select('id,name,color')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setTags((data ?? []) as V2Tag[]);
      });
    return () => { cancelled = true; };
  }, []);

  return tags;
}
