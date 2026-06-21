import type { Reroute } from '@sveltejs/kit';
import { reroutePath } from '$lib/routing/reroute';

export const reroute: Reroute = ({ url }) => {
	return reroutePath(url.pathname);
};

