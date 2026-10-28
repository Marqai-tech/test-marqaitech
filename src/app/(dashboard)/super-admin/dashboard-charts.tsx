'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FiBriefcase, FiTrendingUp } from 'react-icons/fi';

interface DashboardChartsProps {
  companiesByMonth?: { month: string; companies: number }[];
  revenueByMonth?: { month: string; revenue: number }[];
  currencySymbol: string;
}

export default function DashboardCharts({
  companiesByMonth,
  revenueByMonth,
  currencySymbol,
}: DashboardChartsProps) {
  const companies = companiesByMonth?.length ? companiesByMonth : [{ month: '-', companies: 0 }];
  const revenue = revenueByMonth?.length ? revenueByMonth : [{ month: '-', revenue: 0 }];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="thb-card p-5">
        <h3 className="font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiBriefcase className="w-4 h-4" /> Tenants by Month
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={companies}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="companies" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="thb-card p-5">
        <h3 className="font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiTrendingUp className="w-4 h-4" /> Revenue Trend
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94A3B8" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#94A3B8"
                tickFormatter={(value: number) => `${currencySymbol}${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, 'Revenue']} />
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={2} fill="url(#revenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
