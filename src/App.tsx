import React from 'react'
import { createRouter, createRoute, createRootRoute, RouterProvider, Outlet } from '@tanstack/react-router'
import { AppShell, Sidebar, SidebarItem, SidebarGroup, SidebarGroupLabel, SidebarContent, SidebarHeader, SidebarFooter } from '@blinkdotnew/ui'
import { LayoutDashboard, Database, TrendingUp, Users, Settings } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import LeadsDatabase from './pages/LeadsDatabase'
import Performance from './pages/Performance'
import SitePreview from './pages/SitePreview'

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  component: () => (
    <AppShell
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-white font-bold text-sm">AG</span>
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">LeadGen AI</p>
                <p className="text-xs text-muted-foreground leading-tight">Operations</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Operations</SidebarGroupLabel>
              <SidebarItem href="/" icon={<LayoutDashboard size={16} />} label="Lead Dashboard" />
              <SidebarItem href="/performance" icon={<TrendingUp size={16} />} label="Performance" />
              <SidebarItem href="/leads" icon={<Database size={16} />} label="Leads Database" />
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarItem href="/team" icon={<Users size={16} />} label="Team Management" />
              <SidebarItem href="/settings" icon={<Settings size={16} />} label="Agency Settings" />
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-xs">AO</span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Agency Owner</p>
                <p className="text-xs text-muted-foreground leading-tight">Admin Access</p>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
      }
    >
      <Outlet />
    </AppShell>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: Dashboard,
})

const performanceRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/performance',
  component: Performance,
})

const leadsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/leads',
  component: LeadsDatabase,
})

const teamRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/team',
  component: () => (
    <div className="p-8 text-center text-muted-foreground">Team Management — coming soon</div>
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: () => (
    <div className="p-8 text-center text-muted-foreground">Agency Settings — coming soon</div>
  ),
})

const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preview/$id',
  component: SitePreview,
})

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([indexRoute, performanceRoute, leadsRoute, teamRoute, settingsRoute]),
  previewRoute,
])

const router = createRouter({ routeTree })

export default function App() {
  return <RouterProvider router={router} />
}
