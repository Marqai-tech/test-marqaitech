#!/usr/bin/env python3
"""Task 139 — My Profile parity stage 4: policies grid, documents View, avatar pending."""
p = 'src/app/(dashboard)/my-profile/page.tsx'
src = open(p).read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# ── A. Policies tab: real grid with View/Download (keep mapping InfoRows) ──
rep("""            <SectionCard title="Assigned Policies" icon={<FiFileText className="w-4 h-4" />} accent="amber">""",
"""            {/* Task 139 — real assigned-policies grid (View opens the ORIGINAL document) */}
            <SectionCard title="Assigned Company Policies" icon={<FiFileText className="w-4 h-4" />} accent="violet">
              <div className="col-span-full">
                {companyPolicies.length === 0 ? (
                  <p className="text-xs text-thb-text-muted py-2">No active company policies available right now.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {companyPolicies.map((pol) => {
                      const fileUrl = String(pol.fileUrl || '');
                      const title = String(pol.title || 'Policy');
                      const fileName = String(pol.fileName || '');
                      return (
                        <div key={String(pol.id)} className="p-3 rounded-xl border border-thb-border bg-slate-50/60">
                          <p className="text-sm font-semibold text-thb-text-primary truncate" title={title}>{title}</p>
                          <p className="text-[11px] text-thb-text-muted">{String(pol.category || '')}{pol.version ? ` · v${pol.version}` : ''}{pol.effectiveDate ? ` · eff. ${formatDate(pol.effectiveDate)}` : ''}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {fileUrl ? (
                              <button type="button" onClick={() => { const ok = openDocumentInNewTab(fileUrl, fileName || `${title}.pdf`); if (!ok) toast.error('Could not open the policy'); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold hover:bg-violet-100">
                                <FiEye className="w-3.5 h-3.5" /> View
                              </button>
                            ) : (
                              <button type="button" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(`<html><head><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:24px;white-space:pre-wrap"><h2>${title}</h2>${String(pol.description || '').slice(0, 100000)}</body></html>`); w.document.close(); } }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold hover:bg-violet-100">
                                <FiEye className="w-3.5 h-3.5" /> View description
                              </button>
                            )}
                            {fileUrl && (
                              <a href={fileUrl} download={fileName || `${title}.pdf`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200">
                                <FiDownload className="w-3.5 h-3.5" /> Download
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Assigned Policies" icon={<FiFileText className="w-4 h-4" />} accent="amber">""")

# ── B. Documents list: View button next to Download ──
rep("""                      <div className="flex items-center gap-2 shrink-0">
                        {fileUrl && (
                          <a href={fileUrl} {...(isData ? { download: str(doc.name) } : { target: '_blank', rel: 'noopener noreferrer' })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 rounded">
                            <FiDownload className="w-3 h-3" /> Download
                          </a>
                        )}""",
"""                      <div className="flex items-center gap-2 shrink-0">
                        {fileUrl && (
                          <button type="button" onClick={() => { const ok = openDocumentInNewTab(fileUrl, str(doc.name)); if (!ok) toast.error('Could not open the document'); }} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-violet-600 hover:bg-violet-50 rounded">
                            <FiEye className="w-3 h-3" /> View
                          </button>
                        )}
                        {fileUrl && (
                          <a href={fileUrl} {...(isData ? { download: str(doc.name) } : { target: '_blank', rel: 'noopener noreferrer' })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 rounded">
                            <FiDownload className="w-3 h-3" /> Download
                          </a>
                        )}""")

open(p, 'w', encoding='utf-8').write(src)
print(f"stage 4 OK — {edits} edits")
