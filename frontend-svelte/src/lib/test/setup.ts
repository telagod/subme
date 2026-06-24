import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	document.body.innerHTML = '';
	document.body.style.cssText = '';
});
