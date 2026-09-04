// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    umami?: {
      track(
        payload?:
          | Record<string, unknown>
          | ((props: Record<string, unknown>) => Record<string, unknown>),
      ): void
      track(eventName: string, data?: Record<string, unknown>): void
    }
  }
}

export {}
