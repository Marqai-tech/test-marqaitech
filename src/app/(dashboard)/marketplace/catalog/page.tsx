'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function CatalogPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, [category]);
  async function load(): Promise<void> {
    setLoading(true);
    const token = localStorage.getItem('token');
    const url = `/api/marketplace/products${category ? `?category=${category}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    setProducts((await r.json()).products || []); setLoading(false);
  }
  async function buy(p: any) {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!u.employeeId) { alert('No employee context'); return; }
    // For demo: use first wallet bucket of allowed category
    const token = localStorage.getItem('token');
    const wr = await fetch(`/api/wallet?employeeId=${u.employeeId}`, { headers: { Authorization: `Bearer ${token}` } });
    const wallet = (await wr.json()).wallet;
    const allowed = p.allowedBuckets.split(',').map((s: any) => s.trim());
    const bucket = wallet?.buckets?.find((b: any) => allowed.includes(b.category));
    if (!bucket) { alert(`No eligible bucket. Allowed: ${p.allowedBuckets}`); return; }
    if (!confirm(`Buy ${p.name} for ${p.currency} ${p.corporatePrice} from ${bucket.category} bucket?`)) return;
    const r = await fetch('/api/marketplace/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeId: u.employeeId, productId: p.id, qty: 1, walletBucketId: bucket.id }) });
    if (r.ok) { const o = await r.json(); alert(`✓ Order placed! Code: ${o.order.fulfillmentRef}`); }
    else { const e = await r.json(); alert(e.error); }
  }
  const cats = ['', 'voucher', 'gift_card', 'physical_goods', 'digital_goods', 'course', 'insurance_topup'];
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Corporate Catalog</h1>
        <p className="text-sm text-gray-600 mt-1">White-labeled · API integrations · Corporate vs public pricing (REQ-SHP-01/02/03)</p>
      </div>
      <div className="flex gap-2">
        {cats.map(c => <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1 text-sm rounded ${category === c ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{c || 'All'}</button>)}
      </div>
      {loading ? <div className="text-gray-500">Loading...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map(p => (
            <div key={p.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded mb-3 flex items-center justify-center text-4xl">🎁</div>
              <h3 className="font-semibold text-sm">{p.name}</h3>
              <p className="text-xs text-gray-500 mb-2">{p.providerName} · {p.category}</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs text-gray-400 line-through">{p.currency} {p.publicPrice}</span>
                <span className="text-lg font-bold text-green-600">{p.currency} {p.corporatePrice}</span>
              </div>
              <div className="text-xs text-gray-500 mb-3">Buckets: {p.allowedBuckets}</div>
              <button onClick={() => buy(p)} className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Buy Now</button>
            </div>
          ))}
          {products.length === 0 && <div className="col-span-full text-center text-gray-500 py-12">No products in catalog. Add products as super_admin.</div>}
        </div>
      )}
    </div>
  );
}
