import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Palette,
  PanelLeft,
  Plus,
  Sparkles,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: CalendarDays, label: "Content calendar", path: "/calendar" },
  { icon: Palette, label: "Brand profile", path: "/brand" },
];

const SIDEBAR_WIDTH_KEY = "localpost-sidebar-width";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 228;
const MAX_WIDTH = 332;

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_24px_oklch(0.12_0.04_168/0.2)]">
        <Sparkles className="h-4 w-4" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-accent" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-[-0.02em] text-sidebar-foreground">
            LocalPost <span className="text-sidebar-primary">AI</span>
          </p>
          <p className="truncate text-[0.63rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
            GBP content studio
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed)) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="hairline-grid relative min-h-screen overflow-hidden px-5 py-10">
        <div className="absolute left-[8%] top-[12%] h-52 w-52 rounded-full bg-secondary/80 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-52 w-52 rounded-full bg-accent/35 blur-3xl" />
        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl place-items-center">
          <div className="surface-card grid w-full overflow-hidden lg:grid-cols-[1.08fr_0.92fr]">
            <div className="bg-sidebar p-8 text-sidebar-foreground sm:p-12">
              <LogoMark />
              <p className="mt-16 text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
                Your local content rhythm
              </p>
              <h1 className="mt-4 max-w-lg text-5xl leading-[0.96] text-sidebar-foreground sm:text-6xl">
                A month of posts, shaped around your brand.
              </h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-sidebar-foreground/68">
                Analyze your business website, refine the voice, and create a ready-to-review Google Business Profile calendar with matching visuals.
              </p>
            </div>
            <div className="flex flex-col justify-center p-8 sm:p-12">
              <span className="eyebrow">Welcome back</span>
              <h2 className="mt-3 text-4xl leading-tight">Sign in to your studio</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Your businesses, brand profiles, posts, and images remain private to your authenticated account.
              </p>
              <Button onClick={() => startLogin()} size="lg" className="mt-8 h-12 w-full rounded-xl text-sm font-bold shadow-lg shadow-primary/15">
                Continue securely
              </Button>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Secure authentication is provided by Manus.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const activeMenuItem = menuItems.find(item => {
    if (item.path === "/") return location === "/";
    if (item.path === "/calendar") return location.startsWith("/calendar") || location.startsWith("/posts/");
    return location.startsWith(item.path);
  });

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-[76px] justify-center px-3">
            <div className="flex w-full items-center justify-between gap-2">
              <LogoMark compact={isCollapsed} />
              {!isCollapsed && (
                <button
                  onClick={toggleSidebar}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  aria-label="Collapse navigation"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2">
            <SidebarMenu className="gap-1 py-3">
              {menuItems.map(item => {
                const isActive = item === activeMenuItem;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-11 rounded-xl font-semibold data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <div className="mt-3 px-2 group-data-[collapsible=icon]:px-0">
              <button
                onClick={() => setLocation("/onboarding")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/45 px-3 text-sm font-bold text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                title="Add a business"
              >
                <Plus className="h-4 w-4" />
                <span className="group-data-[collapsible=icon]:hidden">Add a business</span>
              </button>
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 shrink-0 border border-sidebar-border">
                    <AvatarFallback className="bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
                      {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-bold leading-none text-sidebar-foreground">
                      {user?.name || "LocalPost user"}
                    </p>
                    <p className="mt-1.5 truncate text-[0.68rem] text-sidebar-foreground/55">
                      {user?.email || "Authenticated workspace"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-sidebar-primary/30 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => !isCollapsed && setIsResizing(true)}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-transparent">
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/88 px-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-card" />
              <span className="text-sm font-bold tracking-tight">{activeMenuItem?.label ?? "LocalPost AI"}</span>
            </div>
            <Button size="sm" className="h-9 rounded-lg" onClick={() => setLocation("/onboarding")}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        )}
        <main className="min-h-screen flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
