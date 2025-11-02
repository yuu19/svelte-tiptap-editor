import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const entryId = url.searchParams.get('entry');

	let [entry] = entryId
		? await db.select().from(entries).where(eq(entries.id, entryId)).limit(1)
		: [undefined];

	if (!entry) {
		[entry] = await db
			.select()
			.from(entries)
			.orderBy(desc(entries.updatedAt))
			.limit(1);
	}

	return {
		entry: entry ?? null
	};
};
