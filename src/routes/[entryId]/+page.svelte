<script lang="ts">
import EditorPage from '../(editor)/EditorPage.svelte';
import type { PageData } from './$types';

	export let data: PageData;
</script>

<EditorPage entry={data.entry} />
