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
import { Building2, MapPin, Users, Calendar, Clock, Sun, Plus, Search, Eye, Edit, Trash2, Briefcase, Award, Moon } from 'lucide-react'
import { useState } from 'react'

const companies = [
  { name: 'Nexus Technologies', code: 'NEXTECH', city: 'Mumbai', state: 'Maharashtra', status: 'Active', branches: 3, departments: 8, employees: 11, gst: '27AABCN1234F1Z5', phone: '+91 22 4567 8901' },
  { name: 'Nexus Solutions', code: 'NEXSOL', city: 'Hyderabad', state: 'Telangana', status: 'Active', branches: 2, departments: 8, employees: 10, gst: '36AABCN5678F1Z3', phone: '+91 40 2345 6789' },
  { name: 'Nexus Staffing', code: 'NEXSTAFF', city: 'Pune', state: 'Maharashtra', status: 'Active', branches: 1, departments: 8, employees: 10, gst: '27AABCN9012F1Z1', phone: '+91 20 3456 7890' },
]

const branches = [
  { name: 'Mumbai HQ', company: 'NEXTECH', city: 'Mumbai', state: 'Maharashtra', address: 'BKC, Bandra East', status: 'Active', head: 'Aarav Sharma' },
  { name: 'Bangalore Tech Park', company: 'NEXTECH', city: 'Bangalore', state: 'Karnataka', address: 'Whitefield Main Road', status: 'Active', head: 'Priya Patel' },
  { name: 'Delhi NCR Office', company: 'NEXTECH', city: 'New Delhi', state: 'Delhi', address: 'Connaught Place', status: 'Active', head: 'Rohan Kumar' },
  { name: 'Hyderabad Campus', company: 'NEXSOL', city: 'Hyderabad', state: 'Telangana', address: 'HITEC City, Madhapur', status: 'Active', head: 'Amit Rao' },
  { name: 'Chennai Center', company: 'NEXSOL', city: 'Chennai', state: 'Tamil Nadu', address: 'OMR, Thoraipakkam', status: 'Active', head: 'Suresh Babu' },
  { name: 'Pune Office', company: 'NEXSTAFF', city: 'Pune', state: 'Maharashtra', address: 'Hinjewadi Phase 2', status: 'Active', head: 'Sanjay Deshmukh' },
]

const departments = [
  { name: 'Engineering', head: 'Aarav Sharma', employees: 8, budget: '₹1.2Cr', status: 'Active' },
  { name: 'HR', head: 'Ananya Singh', employees: 4, budget: '₹45L', status: 'Active' },
  { name: 'Finance', head: 'Neha Gupta', employees: 3, budget: '₹38L', status: 'Active' },
  { name: 'Sales', head: 'Arjun Mehta', employees: 3, budget: '₹55L', status: 'Active' },
  { name: 'Marketing', head: 'Sneha Joshi', employees: 3, budget: '₹32L', status: 'Active' },
  { name: 'Operations', head: 'Karan Verma', employees: 3, budget: '₹42L', status: 'Active' },
  { name: 'Quality', head: 'Divya Nair', employees: 3, budget: '₹28L', status: 'Active' },
  { name: 'Admin', head: 'Vikram Reddy', employees: 3, budget: '₹22L', status: 'Active' },
]

const designations = [
  { name: 'Software Engineer', grade: 'E1', department: 'Engineering', minSalary: '₹3L', maxSalary: '₹6L', status: 'Active' },
  { name: 'Senior Engineer', grade: 'E2', department: 'Engineering', minSalary: '₹6L', maxSalary: '₹12L', status: 'Active' },
  { name: 'Tech Lead', grade: 'E3', department: 'Engineering', minSalary: '₹12L', maxSalary: '₹20L', status: 'Active' },
  { name: 'HR Executive', grade: 'E1', department: 'HR', minSalary: '₹3L', maxSalary: '₹6L', status: 'Active' },
  { name: 'HR Manager', grade: 'M1', department: 'HR', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { name: 'Finance Manager', grade: 'M1', department: 'Finance', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { name: 'Sales Manager', grade: 'M1', department: 'Sales', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { name: 'Operations Manager', grade: 'M1', department: 'Operations', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
]

const grades = [
  { name: 'E1 - Junior', code: 'E1', range: '₹3-6L', min: 300000, max: 600000, employees: 8, status: 'Active' },
  { name: 'E2 - Mid Level', code: 'E2', range: '₹6-12L', min: 600000, max: 1200000, employees: 6, status: 'Active' },
  { name: 'E3 - Senior', code: 'E3', range: '₹12-20L', min: 1200000, max: 2000000, employees: 4, status: 'Active' },
  { name: 'M1 - Manager', code: 'M1', range: '₹20-35L', min: 2000000, max: 3500000, employees: 5, status: 'Active' },
]

const shifts = [
  { name: 'General Shift', code: 'GS', startTime: '09:00 AM', endTime: '06:00 PM', breakTime: '1 hour', graceMinutes: 15, status: 'Active' },
  { name: 'Morning Shift', code: 'MS', startTime: '06:00 AM', endTime: '02:00 PM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
  { name: 'Evening Shift', code: 'ES', startTime: '02:00 PM', endTime: '10:00 PM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
  { name: 'Night Shift', code: 'NS', startTime: '10:00 PM', endTime: '06:00 AM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
]

const holidays = [
  { name: 'Republic Day', date: 'Jan 26, 2026', day: 'Monday', type: 'National', status: 'Active' },
  { name: 'Holi', date: 'Mar 10, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { name: 'Maharashtra Day', date: 'May 1, 2026', day: 'Friday', type: 'State', status: 'Active' },
  { name: 'Eid ul-Fitr', date: 'Apr 2, 2026', day: 'Thursday', type: 'Festival', status: 'Active' },
  { name: 'Independence Day', date: 'Aug 15, 2026', day: 'Saturday', type: 'National', status: 'Active' },
  { name: 'Ganesh Chaturthi', date: 'Aug 27, 2026', day: 'Thursday', type: 'Festival', status: 'Active' },
  { name: 'Gandhi Jayanti', date: 'Oct 2, 2026', day: 'Friday', type: 'National', status: 'Active' },
  { name: 'Dussehra', date: 'Oct 20, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { name: 'Diwali', date: 'Nov 10, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { name: 'Christmas', date: 'Dec 25, 2026', day: 'Friday', type: 'Festival', status: 'Active' },
]

const policies = [
  { name: 'Leave Policy', category: 'Leave', version: '3.2', lastUpdated: 'Jun 1, 2026', status: 'Active' },
  { name: 'Attendance Policy', category: 'Attendance', version: '2.1', lastUpdated: 'May 15, 2026', status: 'Active' },
  { name: 'Code of Conduct', category: 'HR', version: '4.0', lastUpdated: 'Apr 20, 2026', status: 'Active' },
  { name: 'Remote Work Policy', category: 'Work', version: '1.5', lastUpdated: 'Jun 3, 2026', status: 'Active' },
  { name: 'Travel & Expense Policy', category: 'Finance', version: '2.3', lastUpdated: 'Mar 10, 2026', status: 'Active' },
  { name: 'IT Security Policy', category: 'IT', version: '3.0', lastUpdated: 'May 1, 2026', status: 'Active' },
]

export default function CompanyManagement() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTitle, setDialogTitle] = useState('')
  const [activeTab, setActiveTab] = useState('companies')

  const openAddDialog = (title: string) => {
    setDialogTitle(title)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-emerald-400" /> Company Management</h1>
          <p className="text-slate-400 mt-1">Manage companies, branches, departments, and organizational structure</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openAddDialog('Add ' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}>
          <Plus className="w-4 h-4 mr-2" /> Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).slice(0, -1)}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input placeholder="Search..." className="pl-9 bg-slate-900 border-slate-700 text-slate-300" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-900 border border-slate-700 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="companies" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Companies</TabsTrigger>
          <TabsTrigger value="branches" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Branches</TabsTrigger>
          <TabsTrigger value="departments" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Departments</TabsTrigger>
          <TabsTrigger value="designations" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Designations</TabsTrigger>
          <TabsTrigger value="grades" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Grades</TabsTrigger>
          <TabsTrigger value="shifts" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Shifts</TabsTrigger>
          <TabsTrigger value="holidays" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Holidays</TabsTrigger>
          <TabsTrigger value="policies" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="companies">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Card className="bg-slate-900 border-slate-800"><CardContent className="p-4"><p className="text-sm text-slate-400">Total Companies</p><p className="text-2xl font-bold text-white">{companies.length}</p></CardContent></Card>
            <Card className="bg-slate-900 border-slate-800"><CardContent className="p-4"><p className="text-sm text-slate-400">Total Branches</p><p className="text-2xl font-bold text-white">{branches.length}</p></CardContent></Card>
            <Card className="bg-slate-900 border-slate-800"><CardContent className="p-4"><p className="text-sm text-slate-400">Total Employees</p><p className="text-2xl font-bold text-emerald-400">31</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => (
              <Card key={c.code} className="bg-slate-900 border-slate-800 hover:border-emerald-600/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-400" /></div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <h3 className="text-white font-semibold text-lg">{c.name}</h3>
                  <p className="text-slate-500 text-sm mb-1">{c.code} · {c.city}, {c.state}</p>
                  <p className="text-slate-600 text-xs mb-4">GST: {c.gst} · {c.phone}</p>
                  <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-800 pt-3">
                    <div><p className="text-lg font-bold text-white">{c.branches}</p><p className="text-xs text-slate-500">Branches</p></div>
                    <div><p className="text-lg font-bold text-white">{c.departments}</p><p className="text-xs text-slate-500">Depts</p></div>
                    <div><p className="text-lg font-bold text-emerald-400">{c.employees}</p><p className="text-xs text-slate-500">Employees</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="branches">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-400" /> Branches ({branches.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Branch</TableHead><TableHead className="text-slate-400">Company</TableHead><TableHead className="text-slate-400">City</TableHead><TableHead className="text-slate-400">Address</TableHead><TableHead className="text-slate-400">Branch Head</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.city.toLowerCase().includes(search.toLowerCase())).map(b => (
                    <TableRow key={b.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium"><MapPin className="w-4 h-4 inline mr-2 text-emerald-400" />{b.name}</TableCell>
                      <TableCell className="text-slate-300">{b.company}</TableCell>
                      <TableCell className="text-slate-300">{b.city}, {b.state}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{b.address}</TableCell>
                      <TableCell className="text-slate-300">{b.head}</TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{b.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Departments ({departments.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Department</TableHead><TableHead className="text-slate-400">Head</TableHead><TableHead className="text-slate-400">Employees</TableHead><TableHead className="text-slate-400">Budget</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).map(d => (
                    <TableRow key={d.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium">{d.name}</TableCell>
                      <TableCell className="text-slate-300">{d.head}</TableCell>
                      <TableCell className="text-slate-300">{d.employees}</TableCell>
                      <TableCell className="text-emerald-400 font-medium">{d.budget}</TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{d.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="designations">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Award className="w-5 h-5 text-emerald-400" /> Designations ({designations.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Designation</TableHead><TableHead className="text-slate-400">Grade</TableHead><TableHead className="text-slate-400">Department</TableHead><TableHead className="text-slate-400">Salary Range</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {designations.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).map(d => (
                    <TableRow key={d.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium">{d.name}</TableCell>
                      <TableCell><Badge variant="outline" className="border-teal-600/30 text-teal-400">{d.grade}</Badge></TableCell>
                      <TableCell className="text-slate-300">{d.department}</TableCell>
                      <TableCell className="text-emerald-400">{d.minSalary} - {d.maxSalary}</TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{d.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {grades.filter(g => g.name.toLowerCase().includes(search.toLowerCase())).map(g => (
              <Card key={g.code} className="bg-slate-900 border-slate-800 hover:border-emerald-600/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-emerald-600/30 text-emerald-400 text-base px-3 py-1">{g.code}</Badge>
                    <Badge className="bg-emerald-600/20 text-emerald-400">{g.status}</Badge>
                  </div>
                  <p className="text-white font-semibold text-lg">{g.name}</p>
                  <p className="text-emerald-400 text-2xl font-bold mt-2">{g.range}</p>
                  <p className="text-slate-500 text-sm mt-1">Per annum</p>
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <div className="flex justify-between text-sm"><span className="text-slate-400">Employees</span><span className="text-white font-medium">{g.employees}</span></div>
                    <div className="flex justify-between text-sm mt-1"><span className="text-slate-400">Min</span><span className="text-slate-300">₹{(g.min / 100000).toFixed(0)}L</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-400">Max</span><span className="text-slate-300">₹{(g.max / 100000).toFixed(0)}L</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="shifts">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-400" /> Shifts ({shifts.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Shift</TableHead><TableHead className="text-slate-400">Code</TableHead><TableHead className="text-slate-400">Start Time</TableHead><TableHead className="text-slate-400">End Time</TableHead><TableHead className="text-slate-400">Break</TableHead><TableHead className="text-slate-400">Grace</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {shifts.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).map(s => (
                    <TableRow key={s.code} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium flex items-center gap-2">
                        {s.code === 'NS' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                        {s.name}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="border-slate-600 text-slate-300 font-mono">{s.code}</Badge></TableCell>
                      <TableCell className="text-slate-300">{s.startTime}</TableCell>
                      <TableCell className="text-slate-300">{s.endTime}</TableCell>
                      <TableCell className="text-slate-300">{s.breakTime}</TableCell>
                      <TableCell className="text-slate-300">{s.graceMinutes} min</TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{s.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-emerald-400" /> Holidays 2026 ({holidays.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Holiday</TableHead><TableHead className="text-slate-400">Date</TableHead><TableHead className="text-slate-400">Day</TableHead><TableHead className="text-slate-400">Type</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {holidays.filter(h => h.name.toLowerCase().includes(search.toLowerCase())).map(h => (
                    <TableRow key={h.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium">{h.name}</TableCell>
                      <TableCell className="text-slate-300">{h.date}</TableCell>
                      <TableCell className="text-slate-400">{h.day}</TableCell>
                      <TableCell><Badge variant="outline" className={h.type === 'National' ? 'border-amber-600/30 text-amber-400' : h.type === 'Festival' ? 'border-purple-600/30 text-purple-400' : 'border-teal-600/30 text-teal-400'}>{h.type}</Badge></TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{h.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card className="bg-slate-900 border-slate-800 mt-4">
            <CardHeader><CardTitle className="text-white text-lg">Company Policies ({policies.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Policy</TableHead><TableHead className="text-slate-400">Category</TableHead><TableHead className="text-slate-400">Version</TableHead><TableHead className="text-slate-400">Last Updated</TableHead><TableHead className="text-slate-400">Status</TableHead><TableHead className="text-slate-400">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {policies.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                    <TableRow key={p.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="outline" className="border-slate-600 text-slate-300">{p.category}</Badge></TableCell>
                      <TableCell className="text-slate-300 font-mono">v{p.version}</TableCell>
                      <TableCell className="text-slate-400">{p.lastUpdated}</TableCell>
                      <TableCell><Badge className="bg-emerald-600/20 text-emerald-400">{p.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader><DialogTitle className="text-white">{dialogTitle}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-4">
            <div><Label className="text-slate-300">Name</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Enter name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300">Code</Label><Input className="bg-slate-800 border-slate-700 text-white mt-1" placeholder="Code" /></div>
              <div><Label className="text-slate-300">Status</Label>
                <Select><SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="active" className="text-slate-300">Active</SelectItem>
                    <SelectItem value="inactive" className="text-slate-300">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setDialogOpen(false)}>Save</Button>
              <Button variant="outline" className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
