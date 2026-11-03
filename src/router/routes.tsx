import {
  AppstoreOutlined,
  CalculatorOutlined,
  ControlOutlined,
  DashboardOutlined,
  FundProjectionScreenOutlined,
  HomeOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/Layout";
import { AccountMatcherPage } from "@/pages/AccountMatcher";
import { CalculatorWorkspace } from "@/pages/Calculator";
import { CbgWindowPage } from "@/pages/CbgWindow";
import { HeroSkillsPage } from "@/pages/HeroSkills";
import { HomePage } from "@/pages/Home";
import { MaintenancePage } from "@/pages/Maintenance";
import { PvePage } from "@/pages/Pve";
import { RelicsPage } from "@/pages/Relics";
import { SpeedPage } from "@/pages/Speed";
import { SettingsPage } from "@/pages/Settings";
import type {
  AppNavigationItem,
  AppRoute,
  AppRouteTableEntry,
} from "@/types/router";

const pageRoutes: readonly AppRouteTableEntry[] = [
  { path: "/", element: <Navigate to="/home" replace /> },
  {
    path: "/overview",
    element: <Navigate to="/home" replace />,
  },
  {
    route: "home",
    path: "/home",
    menu: { label: "账号查询", icon: HomeOutlined },
    element: <HomePage />,
  },
  {
    route: "account-matcher",
    path: "/account-matcher",
    menu: { label: "账号匹配", icon: SearchOutlined },
    element: <AccountMatcherPage />,
  },
  {
    route: "speed",
    path: "/speed",
    requiresProduct: true,
    menu: { label: "速度盘点", icon: DashboardOutlined },
    element: <SpeedPage />,
  },
  {
    route: "pve",
    path: "/pve",
    requiresProduct: true,
    menu: { label: "PVE 预览", icon: FundProjectionScreenOutlined },
    element: <PvePage />,
  },
  {
    route: "hero-skills",
    path: "/hero-skills",
    requiresProduct: true,
    menu: { label: "式神技能", icon: StarOutlined },
    element: <HeroSkillsPage />,
  },
  {
    route: "calculator",
    path: "/calculator",
    requiresProduct: true,
    menu: { label: "御魂计算器", icon: CalculatorOutlined },
    element: <CalculatorWorkspace />,
  },
  {
    route: "relics",
    path: "/relics",
    requiresProduct: true,
    menu: { label: "御魂库存", icon: AppstoreOutlined },
    element: <RelicsPage />,
  },
  {
    route: "settings",
    path: "/settings",
    menu: { label: "设置", icon: ControlOutlined },
    element: <SettingsPage />,
  },
  {
    route: "maintenance",
    path: "/maintenance",
    menu: { label: "维护", icon: SettingOutlined },
    element: <MaintenancePage />,
  },
  { path: "*", element: <Navigate to="/home" replace /> },
];

export const routes: readonly AppRouteTableEntry[] = [
  { path: "/about", element: <Navigate to="/settings" replace /> },
  { path: "/cbg-window", element: <CbgWindowPage /> },
  {
    element: <AppLayout />,
    children: pageRoutes,
  },
];

const pageRouteEntries = routes.flatMap((route) => route.children || []);

export const APP_ROUTE_PATHS = pageRouteEntries.reduce<
  Record<AppRoute, string>
>(
  (paths, route) => {
    if (route.route && route.path) paths[route.route] = route.path;
    return paths;
  },
  {} as Record<AppRoute, string>,
);

export const navigationItems: AppNavigationItem[] = pageRouteEntries.flatMap(
  (route) =>
    route.route && route.menu ? [{ route: route.route, ...route.menu }] : [],
);

export const desktopNavigationItems = navigationItems.filter(
  (item) => item.route !== "maintenance",
);

export const maintenanceNavigationItem = navigationItems.find(
  (item) => item.route === "maintenance",
)!;

export function getRouteFromPath(pathname: string): AppRoute {
  if (pathname === "/overview") return "home";
  const entry = pageRouteEntries.find(
    (route) => route.route && route.path === pathname,
  );
  return entry?.route || "home";
}
