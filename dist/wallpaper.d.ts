import type { RGB } from "./math.js";
export interface Scene {
    readonly W: number;
    readonly H: number;
    readonly pixels: Uint8Array;
    readonly changed?: readonly number[];
    readonly touched?: readonly number[];
    readonly orbs?: readonly number[];
    readonly points?: {
        readonly count: number;
        readonly data: Float32Array;
    };
    resize(W: number, H: number, cells?: boolean): void;
    step(dt: number): void;
    render(): void;
    react?(event: AgentEvent): void;
    poke?(x: number, y: number): void;
    textMap?(map: TextMap): void;
}
export interface TextMap {
    readonly cols: number;
    readonly rows: number;
    readonly cover: Float32Array;
}
export declare const AGENT_EVENTS: readonly ["busy", "idle", "done", "error"];
export type AgentEvent = (typeof AGENT_EVENTS)[number];
export interface Wallpaper {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly fixedTime?: Time;
    readonly scrim: Readonly<Record<Time, Scrim>>;
    readonly activity: Readonly<Record<Activity, string>>;
    create(settings: Settings): Scene;
}
export type Scrim = readonly [RGB, RGB, RGB];
export declare function settingsFor(wallpaper: Wallpaper, settings: Settings): Settings;
export interface Settings {
    readonly activity: Activity;
    readonly time: Time;
    readonly brightness?: Brightness;
}
export declare const ACTIVITIES: readonly ["calm", "lively", "teeming"];
export type Activity = (typeof ACTIVITIES)[number];
export declare const TIMES: readonly ["day", "sunset", "night"];
export type Time = (typeof TIMES)[number];
export declare const BRIGHTNESSES: readonly ["subtle", "normal", "vivid"];
export type Brightness = (typeof BRIGHTNESSES)[number];
export declare const POWERS: readonly ["saver", "smooth"];
export type Power = (typeof POWERS)[number];
