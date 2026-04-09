/**
 * useTagsManagement — Extracted tag CRUD logic for RecipesCard tags formZone state.
 */

import { useState, useMemo, useCallback } from 'react';
import { useTags, useCreateTag, useDeleteTag } from '@/hooks/useTags';
import { useToastStore } from '@/stores/toastStore';
import type { PillListItem } from '../../shapes';

const TAG_COLORS = [
  '#34d399', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa',
  '#fb923c', '#4ade80', '#22d3ee', '#e879f9', '#f87171',
];

export function useTagsManagement() {
  const { data: allTags = [] } = useTags();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const addToast = useToastStore((s) => s.addToast);

  const [tagSearch, setTagSearch] = useState('');
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<number | null>(null);

  const filteredTags = useMemo(() => {
    let pool = [...allTags];
    if (tagSearch.trim()) {
      const lower = tagSearch.toLowerCase();
      pool = pool.filter((t) => t.name.toLowerCase().includes(lower));
    }
    return pool.sort((a, b) => (b.recipe_count ?? 0) - (a.recipe_count ?? 0));
  }, [allTags, tagSearch]);

  const canCreateTag = tagSearch.trim().length > 0
    && !allTags.some((t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase());

  const handleCreateTag = useCallback(async () => {
    const trimmed = tagSearch.trim();
    if (!trimmed) return;
    try {
      const nextColor = TAG_COLORS[allTags.length % TAG_COLORS.length];
      await createTag.mutateAsync({ name: trimmed, color: nextColor });
      addToast({ message: `Tag "${trimmed}" created`, type: 'success', durationMs: 2000 });
      setTagSearch('');
    } catch {
      addToast({ message: 'Failed to create tag', type: 'error', durationMs: 3000 });
    }
  }, [tagSearch, allTags.length, createTag, addToast]);

  const handleDeleteTag = useCallback(async (tagId: number, tagName: string) => {
    try {
      await deleteTag.mutateAsync(tagId);
      addToast({ message: `Deleted "${tagName}"`, type: 'success', durationMs: 2000 });
      setConfirmDeleteTagId(null);
    } catch {
      addToast({ message: 'Failed to delete tag', type: 'error', durationMs: 3000 });
    }
  }, [deleteTag, addToast]);

  const tagPills: PillListItem[] = useMemo(() =>
    filteredTags.map((tag) => {
      const count = tag.recipe_count ?? 0;
      const isConfirming = confirmDeleteTagId === tag.id;
      return {
        label: tag.name,
        badge: count > 0 ? `${count}` : 'unused',
        dotColor: tag.color ?? '#64748b',
        onItemAction: isConfirming
          ? () => handleDeleteTag(tag.id, tag.name)
          : () => {
              if (count === 0) handleDeleteTag(tag.id, tag.name);
              else setConfirmDeleteTagId(tag.id);
            },
        actionLabel: isConfirming ? 'Confirm' : '\u2715',
      };
    }),
  [filteredTags, confirmDeleteTagId, handleDeleteTag]);

  const resetTags = useCallback(() => {
    setTagSearch('');
    setConfirmDeleteTagId(null);
  }, []);

  return {
    allTags,
    tagSearch, setTagSearch,
    canCreateTag,
    handleCreateTag,
    tagPills,
    resetTags,
  };
}
