import { Page, PageBody, PageHeader, PageTitle } from '@blinkdotnew/ui'
import { SharedAppLayout } from './layouts/shared-app-layout'

export default function App() {
  return (
    <SharedAppLayout appName="App">
      <Page>
        <PageHeader>
          <PageTitle>Home</PageTitle>
        </PageHeader>
        <PageBody>
          <p className="text-sm text-muted-foreground">
            App chrome lives only in{' '}
            <code className="rounded bg-muted px-1">SharedAppLayout</code> — add routes/pages as children here (or
            TanStack Router root layout), never wrap each page in <code className="rounded bg-muted px-1">Shell</code>{' '}
            again. Customize nav in{' '}
            <code className="rounded bg-muted px-1">src/components/AppSidebarShell.tsx</code>. User / Sign out stay in{' '}
            <code className="rounded bg-muted px-1">SidebarFooter</code> only.
          </p>
        </PageBody>
      </Page>
    </SharedAppLayout>
  )
}
