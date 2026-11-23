/** Shared Phase 1 contracts; they describe the future player and do not start games. */
export type ConsoleId = "gb" | "gbc" | "gba" | "nds" | "n64";
export type PlayerMode = "pc" | "iphone";
export type PlayerModePreference = PlayerMode | "auto";
export type InputSource = "keyboard" | "gamepad" | "touch";

export type DigitalAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "start"
  | "select"
  | "l"
  | "r"
  | "z"
  | "cUp"
  | "cDown"
  | "cLeft"
  | "cRight";

export type GamepadBinding =
  | { kind: "button"; buttonIndex: number }
  | { kind: "axis"; axisIndex: number; direction: -1 | 1; threshold?: number };

export type AnalogBinding = {
  xAxis: number;
  yAxis: number;
  deadZone: number;
  invertY?: boolean;
};

export type VirtualControlPlacement = {
  /** Normalized coordinates within the active player viewport, from 0 through 1. */
  x: number;
  y: number;
  scale: number;
};

export type VirtualControlPreferences = {
  opacity: number;
  controls: Partial<Record<DigitalAction, VirtualControlPlacement>>;
  analogStick?: VirtualControlPlacement;
};

export type ConsoleInputProfile = {
  consoleId: ConsoleId;
  keyboard: Partial<Record<DigitalAction, readonly string[]>>;
  gamepad: Partial<Record<DigitalAction, GamepadBinding>>;
  analogStick?: AnalogBinding;
  virtual?: VirtualControlPreferences;
};

export type InputFrame = {
  source: InputSource;
  pressed: ReadonlySet<DigitalAction>;
  /** Normalized analog values in the inclusive range -1 through 1. */
  analog: { x: number; y: number };
  /** Used by Nintendo DS touch input; coordinates are normalized to the lower screen. */
  touch?: { x: number; y: number; phase: "start" | "move" | "end" };
  timestamp: number;
};

export type PlayerDeviceCapabilities = {
  hasTouch: boolean;
  maxTouchPoints: number;
  hasFinePointer: boolean;
  hasGamepadApi: boolean;
  connectedGamepadCount: number;
  hasFullscreenApi: boolean;
  isInstalledWebApp: boolean;
};

export type PlayerModeSuggestion = {
  mode: PlayerMode;
  preferredInput: "keyboard" | "gamepad" | "touch";
  displayContext: "browser" | "installed-web-app";
  canRequestFullscreen: boolean;
};

export function suggestPlayerMode(
  capabilities: PlayerDeviceCapabilities,
): PlayerModeSuggestion {
  const touchFirst = capabilities.hasTouch && !capabilities.hasFinePointer;
  return {
    mode: touchFirst ? "iphone" : "pc",
    preferredInput:
      capabilities.connectedGamepadCount > 0
        ? "gamepad"
        : touchFirst
          ? "touch"
          : "keyboard",
    displayContext: capabilities.isInstalledWebApp
      ? "installed-web-app"
      : "browser",
    canRequestFullscreen: capabilities.hasFullscreenApi,
  };
}

/** The stored manual preference wins; `auto` uses capability signals, never a user-agent string. */
export function resolvePlayerMode(
  preference: PlayerModePreference,
  capabilities: PlayerDeviceCapabilities,
): PlayerMode {
  return preference === "auto"
    ? suggestPlayerMode(capabilities).mode
    : preference;
}

export interface InputAdapter {
  subscribe(listener: (frame: InputFrame) => void): () => void;
  dispose(): void;
}
