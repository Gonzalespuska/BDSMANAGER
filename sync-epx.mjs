import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const epx = new pg.Client({ connectionString: process.env.EPX_DB_URL, ssl: { rejectUnauthorized: false } });
await epx.connect();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Pull all epoxidovo leads
const { rows: epxLeads } = await epx.query(`
  SELECT id, "createdAt", name, email, phone, source, "spaceType", service, area, message, "utmSource", "utmMedium", "utmCampaign", referrer, status
  FROM "Lead"
  ORDER BY "createdAt" ASC
`);
console.log(`Epoxidovo.sk má ${epxLeads.length} leadov`);

// Get existing bdsmanager leads to avoid duplicates (match by data.epx_id in JSONB)
const { data: existing } = await sb.from('leads').select('id, data');
const existingEpxIds = new Set((existing || []).map(l => l.data?.epx_id).filter(Boolean));
console.log(`bdsmanager už má ${existingEpxIds.size} synced z epoxidovo`);

// Map spaceType + service to human labels
const spaceLabels = { dom: "Dom / byt", garaz: "Garáž", "hala-firma": "Hala / firma", ine: "Iné" };
const serviceLabels = { jednofarebne: "Jednofarebná", chipsove: "Chipsová", mramorove: "Mramorová", metalicke: "Metalická", nezvolene: null };

// Map source to bdsmanager source_type + fixed source_id
// Všetko z epoxidovo.sk = web_webhook source (11111111...)
const SOURCE_WEB = "11111111-1111-1111-1111-111111111111";

const inserts = [];
for (const l of epxLeads) {
  if (existingEpxIds.has(l.id)) { continue; }
  // Cap area — niektoré zákazníci napíšu absurd (93101 m² dom = 93 km² — určite tam mysleli inak)
  const areaValid = l.area && l.area > 0 && l.area < 20000 ? l.area : null;
  const payload = {
    source_id: SOURCE_WEB,
    source_type: "web_webhook",
    source_campaign: l.utmCampaign || (l.source === "kontakt_message_form" ? "Kontakt (epoxidovo.sk)" : "Cenová ponuka (epoxidovo.sk)"),
    name: (l.name || "").trim() || "Bez mena",
    phone: l.phone || null,
    email: l.email ? l.email.toLowerCase() : null,
    priority: "medium",
    status: "new",
    created_at: l.createdAt.toISOString(),
    data: {
      epx_id: l.id,   // idempotency key
      plocha: areaValid ? String(areaValid) : (l.area ? `${l.area} (over cap)` : undefined),
      priestor: spaceLabels[l.spaceType] || l.spaceType || undefined,
      typ_podlahy: serviceLabels[l.service] || l.service || undefined,
      message: l.message || undefined,
      utm_source: l.utmSource || undefined,
      utm_medium: l.utmMedium || undefined,
      utm_campaign: l.utmCampaign || undefined,
      referrer: l.referrer || undefined,
      _epx_source: l.source,
      _epx_status: l.status,
    },
  };
  // Strip undefined
  payload.data = Object.fromEntries(Object.entries(payload.data).filter(([,v]) => v != null));
  inserts.push(payload);
}

console.log(`\nZasynchronizujem ${inserts.length} nových leadov...`);

if (inserts.length > 0) {
  const { data: inserted, error } = await sb.from('leads').insert(inserts).select('id, name, created_at');
  if (error) {
    console.error("Insert error:", error.message);
    console.error("Detail:", error.details);
  } else {
    console.log(`✅ Insertol ${inserted.length} leadov:`);
    for (const i of inserted) console.log(`   ${i.created_at.slice(0,10)} | ${i.name}`);
  }
}

await epx.end();
