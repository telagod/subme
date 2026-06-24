import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Button from './Button.svelte';
import Checkbox from './Checkbox.svelte';
import ConfirmDialog from './ConfirmDialog.svelte';
import FileInput from './FileInput.svelte';
import InteractiveRow from './InteractiveRow.svelte';
import NativeSelect from './NativeSelect.svelte';
import StandardDialog from './StandardDialog.svelte';
import StandardDrawer from './StandardDrawer.svelte';
import Textarea from './Textarea.svelte';
import { cn } from './class';

describe('standard UI primitives', () => {
	it('merges Tailwind classes deterministically', () => {
		expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
	});

	it('renders Button as an anchor when href is provided', () => {
		const { container } = render(Button, { props: { href: '/admin/channels/pricing', variant: 'outline', size: 'icon' } });

		const anchor = container.querySelector('a');
		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute('href')).toBe('/admin/channels/pricing');
		expect(anchor?.className).toContain('rounded-md');
	});

	it('renders NativeSelect options with a non-empty sentinel', () => {
		const { container } = render(NativeSelect, {
			props: {
				value: '__all__',
				options: [
					{ value: '__all__', label: 'All' },
					{ value: 'active', label: 'active' }
				]
			}
		});

		const select = container.querySelector('select');
		expect(select?.value).toBe('__all__');
		expect([...container.querySelectorAll('option')].map((option) => option.value)).toEqual(['__all__', 'active']);
	});

	it('renders Textarea with shared form-control styling', () => {
		const { container } = render(Textarea, { props: { value: 'one model per line', placeholder: 'Models' } });

		const textarea = container.querySelector('textarea');
		expect(textarea?.value).toBe('one model per line');
		expect(textarea?.placeholder).toBe('Models');
		expect(textarea?.className).toContain('focus-visible:ring-2');
	});

	it('renders Checkbox with shared checkbox styling', () => {
		const { container } = render(Checkbox, { props: { checked: true, 'aria-label': 'Select account' } });

		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();
		expect(checkbox?.checked).toBe(true);
		expect(checkbox?.getAttribute('aria-label')).toBe('Select account');
		expect(checkbox?.className).toContain('accent-primary');
	});

	it('renders FileInput as a styled trigger plus hidden file control', () => {
		const { container } = render(FileInput, {
			props: { id: 'site-logo-file', accept: 'image/*', 'aria-label': 'Site logo file' }
		});

		const label = container.querySelector('label');
		const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
		expect(label?.getAttribute('for')).toBe('site-logo-file');
		expect(label?.className).toContain('rounded-md');
		expect(input).not.toBeNull();
		expect(input?.accept).toBe('image/*');
		expect(input?.className).toContain('sr-only');
	});

	it('renders InteractiveRow with shared keyboard-focus semantics', () => {
		const { container } = render(InteractiveRow, {
			props: { 'data-testid': 'interactive-row' }
		});

		const row = container.querySelector('[data-testid="interactive-row"]');
		expect(row?.getAttribute('role')).toBe('button');
		expect(row?.getAttribute('tabindex')).toBe('0');
		expect(row?.className).toContain('focus-visible:ring-2');
	});

	it('rejects empty NativeSelect values', () => {
		expect(() =>
			render(NativeSelect, {
				props: {
					value: '',
					options: [{ value: '__all__', label: 'All' }]
				}
			})
		).toThrow(/NativeSelect sentinel/);
	});

	it('renders ConfirmDialog with danger variant and action buttons', () => {
		render(ConfirmDialog, {
			props: {
				open: true,
				title: 'Delete item?',
				description: 'This action cannot be undone.',
				'data-testid': 'confirm-dialog-test'
			}
		});

		const dialog = document.body.querySelector('[data-testid="confirm-dialog-test"]');
		expect(dialog).not.toBeNull();
		expect(document.body.textContent).toContain('Delete item?');
		expect(document.body.textContent).toContain('This action cannot be undone.');
		// Default buttons: Cancel + Delete
		const buttons = dialog?.querySelectorAll('button');
		expect(buttons?.length).toBeGreaterThanOrEqual(2);
	});

	it('renders ConfirmDialog with warning variant amber button', () => {
		render(ConfirmDialog, {
			props: {
				open: true,
				title: 'Regenerate key?',
				variant: 'warning',
				confirmLabel: 'Regenerate',
				'data-testid': 'confirm-dialog-warning'
			}
		});

		const dialog = document.body.querySelector('[data-testid="confirm-dialog-warning"]');
		expect(dialog).not.toBeNull();
		const buttons = [...(dialog?.querySelectorAll('button') ?? [])];
		const confirmBtn = buttons.find((b) => b.textContent?.includes('Regenerate'));
		expect(confirmBtn).not.toBeUndefined();
		expect(confirmBtn?.className).toContain('amber');
	});

	it('renders StandardDialog through the shared bits-ui shell', async () => {
		const rendered = render(StandardDialog, {
			props: {
				open: true,
				title: 'Edit proxy',
				description: 'Proxy configuration',
				'data-testid': 'standard-dialog-test'
			}
		});

		const dialog = document.body.querySelector('[data-testid="standard-dialog-test"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.getAttribute('role')).toBe('dialog');
		expect(document.body.textContent).toContain('Edit proxy');
		expect(document.body.textContent).toContain('Proxy configuration');

		await rendered.rerender({ open: false, title: 'Edit proxy' });
		expect(document.body.querySelector('[data-testid="standard-dialog-test"]')).toBeNull();
	});

	it('lets StandardDialog hide its default visual header', () => {
		render(StandardDialog, {
			props: {
				open: true,
				title: 'Hidden visual title',
				description: 'Hidden visual description',
				showHeader: false,
				'data-testid': 'standard-dialog-hidden-header'
			}
		});

		const dialog = document.body.querySelector('[data-testid="standard-dialog-hidden-header"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.getAttribute('role')).toBe('dialog');
		expect(document.body.querySelector('.sr-only')?.textContent).toContain('Hidden visual title');
	});

	it('renders StandardDrawer through the shared bits-ui shell', async () => {
		const rendered = render(StandardDrawer, {
			props: {
				open: true,
				title: 'Refund detail',
				description: 'Queue item',
				'data-testid': 'standard-drawer-test'
			}
		});

		const drawer = document.body.querySelector('[data-testid="standard-drawer-test"]');
		expect(drawer).not.toBeNull();
		expect(drawer?.getAttribute('role')).toBe('dialog');
		expect(drawer?.className).toContain('right-0');
		expect(document.body.textContent).toContain('Refund detail');

		await rendered.rerender({ open: false, title: 'Refund detail' });
		expect(document.body.querySelector('[data-testid="standard-drawer-test"]')).toBeNull();
	});
});
