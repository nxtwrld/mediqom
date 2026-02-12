declare module 'nano-markdown' {
	function markdown(text: string): string;
	export default markdown;
}

declare module 'simple-svelte-autocomplete' {
	import type { SvelteComponent } from 'svelte';

	export default class Autocomplete extends SvelteComponent<{
		items?: any[];
		searchFunction?: (keyword: string) => Promise<any[]>;
		labelFieldName?: string;
		valueFieldName?: string;
		[key: string]: any;
	}> {}
}
