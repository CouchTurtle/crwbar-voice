import React, { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  FlaskConical,
  History,
  Info,
  Sparkles,
  Cpu,
  FileAudio,
} from "lucide-react";
import CrwbarVoiceLogo from "./icons/CrwbarVoiceLogo";
import VoiceMark from "./icons/VoiceMark";
import { useSettings } from "../hooks/useSettings";
import { commands } from "@/bindings";
import { hasGlass } from "@/lib/glass";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
  TranscribeSettings,
} from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  general: {
    labelKey: "sidebar.general",
    icon: VoiceMark,
    component: GeneralSettings,
    enabled: () => true,
  },
  transcribe: {
    labelKey: "sidebar.transcribe",
    icon: FileAudio,
    component: TranscribeSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

// Corner radius of the floating glass pane: the window's own corners less the
// 8px inset, so the curves stay concentric.
const GLASS_PANE_RADIUS = 18;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  // macOS 26: the sidebar is a hole in the page with the native glass behind
  // it. While mounted the page goes transparent (App.css) and the pane's shadow
  // paints the background everywhere else.
  const glass = hasGlass();
  const paneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!glass || !pane) return;
    const root = document.documentElement;
    root.dataset.glass = "";
    const place = (opacity: number) => {
      const { x, y, width, height } = pane.getBoundingClientRect();
      void commands.setGlassFrame({
        x,
        y,
        width,
        height,
        radius: GLASS_PANE_RADIUS,
        opacity,
      });
    };
    const observer = new ResizeObserver(() => place(1));
    observer.observe(pane);
    return () => {
      observer.disconnect();
      delete root.dataset.glass;
      place(0); // onboarding and the like draw no pane
    };
  }, [glass]);

  return (
    <div
      ref={paneRef}
      // The pane's empty space moves the window, as a title bar would.
      data-tauri-drag-region={glass || undefined}
      className={`flex flex-col w-40 shrink-0 items-center px-2 ${
        glass ? "glass-pane m-2 pt-8" : "h-full border-e border-mid-gray/20"
      }`}
      style={glass ? { borderRadius: GLASS_PANE_RADIUS } : undefined}
    >
      <CrwbarVoiceLogo width={128} className="m-4 text-base" />
      <div className="flex flex-col w-full items-center gap-1 pt-2 border-t border-mid-gray/20">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <div
              key={section.id}
              className={`flex gap-2 items-center p-2 w-full rounded-[10px] cursor-pointer transition-colors ${
                isActive
                  ? "bg-logo-primary/80"
                  : "hover:bg-mid-gray/20 hover:opacity-100 opacity-85"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              <Icon width={24} height={24} className="shrink-0" />
              <p
                className="text-sm font-medium truncate"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
