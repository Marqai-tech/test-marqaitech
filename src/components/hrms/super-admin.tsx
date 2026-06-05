'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Building2, Users, CreditCard, Activity, Server, Zap, TrendingUp, CheckCircle2, Search, Plus, Eye, Edit, Trash2, BarChart3, Cpu, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface CompanyData {
  id: string
  tenantId: string
  code: string
  name: string
  status: string
  country: string
  createdAt: string
  _count: { employees: number }
  branches: { id: string; name: string; status: string }[]
  departments: { id: string; name: string; status: string }[]
}

const packages = [
  { name: 'Starter', price: '₹29,000/mo', employees: '50', companies: '1', credits: '1,000', features: ['Basic HRMS', 'Employee Management', 'Leave & Attendance', 'Email Support', '5 GB Storage'], status: 'Active', popular: false },
  { name: 'Professional', price: '₹79,000/mo', employees: '200', companies: '3', credits: '5,000', features: ['All Starter features', 'Recruitment & Onboarding', 'AI Interview (Basic)', 'Payroll Management', 'Priority Support', '25 GB Storage'], status: 'Active', popular: true },
  { name: 'Enterprise', price: '₹1,99,000/mo', employees: '1,000', companies: '10', credits: '15,000', features: ['All Professional features', 'AI Interview (Advanced)', 'Custom Workflows', 'Dedicated Account Manager', 'API Access', 'Unlimited Storage'], status: 'Active', popular: false },
]

export default function SuperAdmin() {
  const { toast } = useToast()
  const [tenantSearch, setTenantSearch] = useState('')
  const [subSearch, setSubSearch] = useState('')
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add tenant form state
  const [newTenant, setNewTenant] = useState({
    name: '',
    code: '',
    type: 'single',
    plan: 'starter',
    adminEmail: '',
    adminName: '',
  })
  const [creating, setCreating] = useState(false)

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiGet<CompanyData[]>('/api/companies')
      setCompanies(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load companies')
      toast({ title: 'Error', description: 'Failed to load company data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  // Derived stats from real data
  const totalEmployees = companies.reduce((sum, c) => sum + (c._count?.employees || 0), 0)
  const totalBranches = companies.reduce((sum, c) => sum + (c.branches?.length || 0), 0)
  const totalDepartments = companies.reduce((sum, c) => sum + (c.departments?.length || 0), 0)
  const activeCompanies = companies.filter(c => c.status === 'active').length

  // Build tenant rows from real companies
  const tenants = companies.map(c => ({
    id: c.code,
    name: c.name,
    type: c.branches?.length > 1 ? 'Multi Branch' : 'Single Branch',
    status: c.status === 'active' ? 'Active' : 'Inactive',
    plan: 'Professional' as string,
    companies: 1,
    employees: c._count?.employees || 0,
    branches: c.branches?.length || 0,
    departments: c.departments?.length || 0,
    joined: new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    revenue: '₹79,000/mo',
  }))

  // Subscriptions derived from companies (simulated)
  const subscriptions = companies.map(c => ({
    tenant: c.name,
    plan: 'Professional',
    amount: '₹79,000',
    billing: 'Monthly',
    status: c.status === 'active' ? 'Active' : 'Suspended',
    nextBilling: 'Jul 1, 2026',
    usedCredits: Math.floor(Math.random() * 3000) + 1000,
    totalCredits: 5000,
  }))

  const platformStats = [
    { label: 'Total Tenants', value: String(companies.length), icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Active Tenants', value: String(activeCompanies), icon: CheckCircle2, color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { label: 'Total Employees', value: totalEmployees.toLocaleString(), icon: Users, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'AI Credits Used', value: '12,450', icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ]

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
    t.id.toLowerCase().includes(tenantSearch.toLowerCase()) ||
    t.plan.toLowerCase().includes(tenantSearch.toLowerCase())
  )

  const filteredSubs = subscriptions.filter(s =>
    s.tenant.toLowerCase().includes(subSearch.toLowerCase()) ||
    s.plan.toLowerCase().includes(subSearch.toLowerCase())
  )

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.code || !newTenant.adminEmail) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }
    try {
      setCreating(true)
      await apiPost('/api/companies', {
        tenantId: 'default',
        name: newTenant.name,
        code: newTenant.code.toLowerCase().replace(/\s+/g, '-'),
        country: 'India',
        status: 'active',
        adminName: newTenant.adminName,
        adminEmail: newTenant.adminEmail,
      })
      toast({ title: 'Tenant Created', description: `${newTenant.name} has been created successfully` })
      setAddTenantOpen(false)
      setNewTenant({ name: '', code: '', type: 'single', plan: 'starter', adminEmail: '', adminName: '' })
      fetchCompanies()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create tenant', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const analyticsData = [
    { label: 'Total Users', value: String(totalEmployees), change: '+12%', icon: Users, color: 'text-emerald-400' },
    { label: 'Active Sessions', value: '89', change: '+5%', icon: Activity, color: 'text-teal-400' },
    { label: 'API Calls (Today)', value: '24,567', change: '+18%', icon: Server, color: 'text-amber-400' },
    { label: 'AI Credits (Month)', value: '12,450 / 21,000', change: '59%', icon: Cpu, color: 'text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" /> Super Admin
          </h1>
          <p className="text-slate-400 mt-1">Platform management and subscription overview</p>
        </div>
        <Dialog open={addTenantOpen} onOpenChange={setAddTenantOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
            <DialogHeader><DialogTitle className="text-white">Add New Tenant</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-4">
              <div><Label className="text-slate-300">Organization Name *</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Enter organization name" value={newTenant.name} onChange={e => setNewTenant(p => ({ ...p, name: e.target.value, code: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} /></div>
              <div><Label className="text-slate-300">Company Code *</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="e.g. nexus-corp" value={newTenant.code} onChange={e => setNewTenant(p => ({ ...p, code: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-slate-300">Type</Label>
                  <Select value={newTenant.type} onValueChange={v => setNewTenant(p => ({ ...p, type: v }))}><SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="single" className="text-slate-300">Single Company</SelectItem>
                      <SelectItem value="multi" className="text-slate-300">Multi Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-slate-300">Plan</Label>
                  <Select value={newTenant.plan} onValueChange={v => setNewTenant(p => ({ ...p, plan: v }))}><SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1"><SelectValue placeholder="Select plan" /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {packages.map(p => <SelectItem key={p.name} value={p.name.toLowerCase()} className="text-slate-300">{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-slate-300">Admin Email *</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" type="email" placeholder="admin@company.com" value={newTenant.adminEmail} onChange={e => setNewTenant(p => ({ ...p, adminEmail: e.target.value }))} /></div>
              <div><Label className="text-slate-300">Admin Name</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Full name" value={newTenant.adminName} onChange={e => setNewTenant(p => ({ ...p, adminName: e.target.value }))} /></div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateTenant} disabled={creating}>
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Tenant'}
                </Button>
                <Button variant="outline" className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setAddTenantOpen(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="bg-slate-900 border border-slate-700 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Dashboard</TabsTrigger>
          <TabsTrigger value="tenants" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Tenants</TabsTrigger>
          <TabsTrigger value="subscriptions" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Subscriptions</TabsTrigger>
          <TabsTrigger value="packages" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Packages</TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Platform Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="ml-3 text-slate-400">Loading platform data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-400 mb-4">{error}</p>
              <Button variant="outline" onClick={fetchCompanies} className="border-slate-700 text-slate-300 hover:bg-slate-800">Retry</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {platformStats.map(s => (
                  <Card key={s.label} className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-400">{s.label}</p>
                          <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
                        </div>
                        <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                          <s.icon className={`w-5 h-5 ${s.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader><CardTitle className="text-white text-lg">Company Overview</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow className="border-slate-700">
                        <TableHead className="text-slate-400">Company</TableHead>
                        <TableHead className="text-slate-400">Employees</TableHead>
                        <TableHead className="text-slate-400">Branches</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {companies.slice(0, 5).map(c => (
                          <TableRow key={c.id} className="border-slate-800">
                            <TableCell className="text-white font-medium">{c.name}</TableCell>
                            <TableCell className="text-slate-300">{c._count?.employees || 0}</TableCell>
                            <TableCell className="text-slate-300">{c.branches?.length || 0}</TableCell>
                            <TableCell><Badge className={c.status === 'active' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}>{c.status === 'active' ? 'Active' : 'Inactive'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader><CardTitle className="text-white text-lg">Platform Stats</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-300">Total Companies</span>
                      <span className="text-emerald-400 font-bold text-lg">{companies.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-300">Total Employees</span>
                      <span className="text-amber-400 font-bold text-lg">{totalEmployees}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-300">Total Branches</span>
                      <span className="text-teal-400 font-bold text-lg">{totalBranches}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-300">Total Departments</span>
                      <span className="text-slate-300 font-bold text-lg">{totalDepartments}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="tenants">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input placeholder="Search tenants..." className="pl-9 bg-slate-900 border-slate-700 text-slate-300" value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-300">All Status</SelectItem>
                <SelectItem value="active" className="text-slate-300">Active</SelectItem>
                <SelectItem value="suspended" className="text-slate-300">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <span className="ml-3 text-slate-400">Loading tenants...</span>
            </div>
          ) : (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Company Code</TableHead>
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Type</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Plan</TableHead>
                    <TableHead className="text-slate-400">Employees</TableHead>
                    <TableHead className="text-slate-400">Branches</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredTenants.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No tenants found</TableCell></TableRow>
                    ) : (
                      filteredTenants.map(t => (
                        <TableRow key={t.id} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-slate-400 font-mono text-sm">{t.id}</TableCell>
                          <TableCell className="text-white font-medium">{t.name}</TableCell>
                          <TableCell className="text-slate-300">{t.type}</TableCell>
                          <TableCell><Badge className={t.status === 'Active' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}>{t.status}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="border-teal-600/30 text-teal-400">{t.plan}</Badge></TableCell>
                          <TableCell className="text-slate-300">{t.employees}</TableCell>
                          <TableCell className="text-slate-300">{t.branches}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Eye className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="subscriptions">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input placeholder="Search subscriptions..." className="pl-9 bg-slate-900 border-slate-700 text-slate-300" value={subSearch} onChange={e => setSubSearch(e.target.value)} />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-300">All Plans</SelectItem>
                <SelectItem value="starter" className="text-slate-300">Starter</SelectItem>
                <SelectItem value="professional" className="text-slate-300">Professional</SelectItem>
                <SelectItem value="enterprise" className="text-slate-300">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <span className="ml-3 text-slate-400">Loading subscriptions...</span>
            </div>
          ) : (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Tenant</TableHead>
                    <TableHead className="text-slate-400">Plan</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-slate-400">Billing</TableHead>
                    <TableHead className="text-slate-400">AI Credits</TableHead>
                    <TableHead className="text-slate-400">Next Billing</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredSubs.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">No subscriptions found</TableCell></TableRow>
                    ) : (
                      filteredSubs.map((s, i) => (
                        <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-white font-medium">{s.tenant}</TableCell>
                          <TableCell><Badge variant="outline" className="border-teal-600/30 text-teal-400">{s.plan}</Badge></TableCell>
                          <TableCell className="text-emerald-400 font-medium">{s.amount}</TableCell>
                          <TableCell className="text-slate-300">{s.billing}</TableCell>
                          <TableCell className="text-slate-300">{s.usedCredits.toLocaleString()} / {s.totalCredits.toLocaleString()}</TableCell>
                          <TableCell className="text-slate-400">{s.nextBilling}</TableCell>
                          <TableCell><Badge className={s.status === 'Active' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}>{s.status}</Badge></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packages">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            {packages.map(p => (
              <Card key={p.name} className={`bg-slate-900 border-slate-800 relative ${p.popular ? 'ring-2 ring-emerald-500/50' : ''}`}>
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-emerald-600 text-white px-3">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold text-lg">{p.name}</h3>
                    <Badge className="bg-emerald-600/20 text-emerald-400">{p.status}</Badge>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400 mb-1">{p.price}</p>
                  <p className="text-slate-500 text-sm mb-6">per month</p>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <p className="text-white font-bold">{p.employees}</p>
                      <p className="text-slate-500 text-xs">Employees</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <p className="text-white font-bold">{p.companies}</p>
                      <p className="text-slate-500 text-xs">Companies</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center col-span-2">
                      <p className="text-white font-bold">{p.credits}</p>
                      <p className="text-slate-500 text-xs">AI Credits / Month</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-6">
                    {p.features.map(f => (
                      <div key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-slate-300">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Button className={`w-full ${p.popular ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'}`}>
                    Manage Plan
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {analyticsData.map(a => (
              <Card key={a.label} className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <a.icon className={`w-5 h-5 ${a.color}`} />
                    <Badge className="bg-emerald-600/20 text-emerald-400 text-xs">{a.change}</Badge>
                  </div>
                  <p className="text-2xl font-bold text-white">{a.value}</p>
                  <p className="text-sm text-slate-400 mt-1">{a.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-400" /> Usage by Module</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { module: 'Employee Management', usage: 85 },
                  { module: 'Recruitment', usage: 72 },
                  { module: 'AI Interview', usage: 45 },
                  { module: 'Payroll', usage: 90 },
                  { module: 'Attendance', usage: 88 },
                  { module: 'Leave Management', usage: 76 },
                ].map(m => (
                  <div key={m.module} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{m.module}</span>
                      <span className="text-emerald-400">{m.usage}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${m.usage}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Cpu className="w-5 h-5 text-purple-400" /> Company Distribution</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {companies.map(c => {
                  const empCount = c._count?.employees || 0
                  const maxEmp = Math.max(...companies.map(co => co._count?.employees || 1), 1)
                  const usagePct = (empCount / maxEmp) * 100
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{c.name}</span>
                        <span className="text-purple-400">{empCount} employees</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-purple-500'}`} style={{ width: `${usagePct}%` }} />
                      </div>
                    </div>
                  )
                })}
                {companies.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No company data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
