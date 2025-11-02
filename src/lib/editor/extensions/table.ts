import { InputRule } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';

const tableInputRegex = /^:::table(?:(\d+)\s*[x×-]\s*(\d+))?\s$/;

export const ZennTable = Table.extend({
	addOptions() {
		return {
			...this.parent?.(),
			resizable: true,
			HTMLAttributes: {
				class: 'zenn-table',
			},
		};
	},

	addInputRules() {
		return [
			new InputRule({
				find: tableInputRegex,
				handler: ({ chain, range, match }) => {
					const rows = Number(match[1] ?? 2);
					const cols = Number(match[2] ?? 2);

					chain()
						.deleteRange(range)
						.insertTable({
							rows: Math.max(1, rows),
							cols: Math.max(1, cols),
							withHeaderRow: true,
						})
						.focus()
						.run();
				},
			}),
		];
	},
});

export const ZennTableHeader = TableHeader.extend({
	content: 'paragraph',
});

export const ZennTableCell = TableCell.extend({
	content: 'paragraph',
});

export const ZennTableRow = TableRow;
