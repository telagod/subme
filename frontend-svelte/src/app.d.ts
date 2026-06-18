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
}

// Vite `?raw` import 类型（用于红线 grep test）
declare module '*?raw' {
	const src: string;
	export default src;
}

export {};
