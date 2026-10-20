Deno.serve(async () => {
  const k = Deno.env.get('PAKASIR_API_KEY') || '';
  const s = Deno.env.get('PAKASIR_PROJECT_SLUG') || '';
  const oid = 'tcmvfgsyy01464b6551a7d41ba95';
  const out: any = { slug: s, keyLen: k.length };
  const tries: [string, string, RequestInit?][] = [
    ['v1_detail', `https://app.pakasir.com/api/transactiondetail?project=${s}&amount=6000&order_id=${oid}&api_key=${k}`],
    ['v2_detail', `https://app.pakasir.com/api/v2/transactiondetail?project=${s}&amount=6000&order_id=${oid}&api_key=${k}`],
    ['v1_create', 'https://app.pakasir.com/api/transactioncreate/qris', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: s, order_id: 'diag' + Date.now(), amount: 1000, api_key: k }) }],
  ];
  for (const [n, u, i] of tries) {
    try { const r = await fetch(u, i); out[n] = { status: r.status, body: (await r.text()).slice(0, 400).replaceAll(k, '***') }; }
    catch (e) { out[n] = String(e); }
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
});
