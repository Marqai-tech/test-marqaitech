'use client';

import { useRouter } from 'next/navigation';
import {
  FiShield,
  FiHome,
  FiSliders,
  FiUsers,
  FiCalendar,
  FiClock,
  FiFolder,
  FiDollarSign,
  FiBookOpen,
  FiTrendingUp,
  FiMap,
  FiLogOut,
  FiGitBranch,
  FiLifeBuoy,
  FiGrid,
  FiLock,
  FiSettings,
  FiBook,
  FiArrowRight,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useModuleStore, modules, type ModuleConfig } from '@/store/moduleStore';

const iconMap: Record<string, React.ReactNode> = {
  FiShield: <FiShield className="w-8 h-8" />,
  FiHome: <FiHome className="w-8 h-8" />,
  FiSliders: <FiSliders className="w-8 h-8" />,
  FiUsers: <FiUsers className="w-8 h-8" />,
  FiCalendar: <FiCalendar className="w-8 h-8" />,
  FiClock: <FiClock className="w-8 h-8" />,
  FiFolder: <FiFolder className="w-8 h-8" />,
  FiDollarSign: <FiDollarSign className="w-8 h-8" />,
  FiBookOpen: <FiBookOpen className="w-8 h-8" />,
  FiTrendingUp: <FiTrendingUp className="w-8 h-8" />,
  FiMap: <FiMap className="w-8 h-8" />,
  FiLogOut: <FiLogOut className="w-8 h-8" />,
  FiGitBranch: <FiGitBranch className="w-8 h-8" />,
  FiLifeBuoy: <FiLifeBuoy className="w-8 h-8" />,
  FiGrid: <FiGrid className="w-8 h-8" />,
  FiLock: <FiLock className="w-8 h-8" />,
  FiSettings: <FiSettings className="w-8 h-8" />,
  FiBook: <FiBook className="w-8 h-8" />,
};

function ModuleTile({ module, onClick }: { module: ModuleConfig; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02] text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-nexus-primary"
      style={{ minHeight: '220px' }}
    >
      {/* Gradient Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${module.gradientFrom} ${module.gradientTo} opacity-90`} />

      {/* Decorative circle */}
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10 group-hover:scale-110 transition-transform duration-500" />
      <div className="absolute -right-2 -bottom-8 w-24 h-24 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-500" />

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col h-full justify-between" style={{ minHeight: '220px' }}>
        <div>
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white mb-4 group-hover:scale-110 group-hover:bg-white/30 transition-all duration-300">
            {iconMap[module.icon] || <FiGrid className="w-8 h-8" />}
          </div>
          <h3 className="text-lg font-bold text-white mb-1">
            {module.name}
          </h3>
          <p className="text-sm text-white/75 line-clamp-2 leading-relaxed">
            {module.description}
          </p>
        </div>
        <div className="flex items-center text-white/60 group-hover:text-white transition-colors mt-4">
          <span className="text-xs font-medium">Explore module</span>
          <FiArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { setActiveModule } = useModuleStore();
  const router = useRouter();

  const firstName = user?.name?.split(' ')[0] || 'User';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const userRole = user?.role || 'employee';

  // Filter modules based on role
  const visibleModules = modules.filter(
    (m) => !m.roles || m.roles.includes(userRole)
  );

  const handleModuleClick = (module: ModuleConfig) => {
    setActiveModule(module.id);
    router.push(module.route);
  };

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-nexus-text-primary">
            {greeting}, {firstName}!
          </h1>
          <p className="text-nexus-text-secondary mt-2 text-base">
            Welcome to NEXUS HRMS. Select a module to get started.
          </p>
        </div>
        <div className="text-sm text-nexus-text-muted bg-nexus-card-bg border border-nexus-border rounded-lg px-4 py-2">
          {today}
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Modules', value: visibleModules.length, color: 'text-blue-500' },
          { label: 'Your Role', value: userRole.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()), color: 'text-violet-500' },
          { label: 'Quick Access', value: 'All', color: 'text-emerald-500' },
          { label: 'Status', value: 'Online', color: 'text-amber-500' },
        ].map((stat) => (
          <div key={stat.label} className="nexus-card p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-nexus-text-muted">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color} truncate`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Module Tiles Grid */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-nexus-text-primary">Modules</h2>
          <p className="text-sm text-nexus-text-muted">{visibleModules.length} modules available</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {visibleModules.map((module) => (
            <ModuleTile
              key={module.id}
              module={module}
              onClick={() => handleModuleClick(module)}
            />
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-center py-4">
        <p className="text-xs text-nexus-text-muted">
          Click on any module tile to navigate to its workspace. Use the sidebar to switch between sub-modules.
        </p>
      </div>
    </div>
  );
}
