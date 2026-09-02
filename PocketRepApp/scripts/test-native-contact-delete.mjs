import { readFileSync } from 'node:fs';
const src = readFileSync('app/(tabs)/contacts.tsx','utf8');
let pass=0, fail=0;
function ok(c,l){if(c){pass++;console.log('PASS  '+l)}else{fail++;console.error('FAIL  '+l)}}
ok(src.includes(".eq('user_id', user.id)\n        .eq('is_deleted', false)"), 'native contacts list excludes deleted rows');
ok(src.includes(".update({ is_deleted: true, updated_at: new Date().toISOString() })"), 'native delete soft-deletes contact');
ok(src.includes(".eq('is_deleted', false)\n        .select('id')\n        .maybeSingle()"), 'native delete verifies an owned visible row changed');
ok(!src.includes("supabase.from('contacts').delete().eq('id', c.id)"), 'native contact delete no longer hard-deletes history');
ok(src.includes('Their history stays saved.'), 'delete confirmation matches preserved-history behavior');
if(fail){console.error(`\n❌ ${fail} FAILED (${pass} passed)`);process.exit(1)}console.log(`\n✅ ALL PASSED (${pass} checks)`);
