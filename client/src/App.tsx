import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, type PropsWithChildren } from "react";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const BrandProfile = lazy(() => import("@/pages/BrandProfile"));
const ContentCalendar = lazy(() => import("@/pages/ContentCalendar"));
const Home = lazy(() => import("@/pages/Home"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const PostEditor = lazy(() => import("@/pages/PostEditor"));

function RouteFallback() {
  return (
    <div className="space-y-5" aria-label="Loading workspace" aria-live="polite">
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function WorkspacePage({ children }: PropsWithChildren) {
  return (
    <DashboardLayout>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <WorkspacePage><Home /></WorkspacePage>} />
      <Route path="/onboarding" component={() => <WorkspacePage><Onboarding /></WorkspacePage>} />
      <Route path="/calendar" component={() => <WorkspacePage><ContentCalendar /></WorkspacePage>} />
      <Route path="/brand" component={() => <WorkspacePage><BrandProfile /></WorkspacePage>} />
      <Route path="/posts/:postId" component={() => <WorkspacePage><PostEditor /></WorkspacePage>} />
      <Route path="/404" component={() => <WorkspacePage><NotFound /></WorkspacePage>} />
      <Route component={() => <WorkspacePage><NotFound /></WorkspacePage>} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
