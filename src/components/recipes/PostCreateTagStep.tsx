/**
 * PostCreateTagStep — Lightweight tag suggestion UI shown after recipe creation.
 *
 * Shows AI suggestions, popular tags, search, and inline create.
 * User can skip at any time. Designed for embedding in modals.
 */

import { useState } from 'react';
import { useTagIntelligence, useTags, useCreateTag } from '@/hooks/useTags';
import { TagChip } from './RecipeTags';

interface PostCreateTagStepProps {
  recipeId: number;
  recipeName: string;
  onDone: () => void;
}

export function PostCreateTagStep({ recipeId, recipeName, onDone }: PostCreateTagStepProps) {
  const {
    currentTags,
    suggestions,
    popularTags,
    isLoading,
    addTag,
    removeTag,
    isAdding,
  } = useTagIntelligence(recipeId);

  const { data: allTags = [] } = useTags();
  const createTag = useCreateTag();
  const [searchQuery, setSearchQuery] = useState('');

  const currentTagIds = new Set(currentTags.map(t => t.id));

  const filteredTags = allTags.filter(
    tag => !currentTagIds.has(tag.id) &&
      tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateAndAdd = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    try {
      const newTag = await createTag.mutateAsync({ name: trimmed });
      addTag(newTag.id);
      setSearchQuery('');
    } catch {
      // handled by mutation
    }
  };

  const canCreate = searchQuery.trim().length > 0
    && !allTags.some(t => t.name.toLowerCase() === searchQuery.trim().toLowerCase());

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <div className="h-6 w-48 bg-slate-700 rounded animate-pulse mx-auto" />
        <div className="flex gap-2 justify-center">
          <div className="h-8 w-20 bg-slate-700 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-slate-400 text-sm">
          Add tags to <span className="text-slate-200 font-medium">{recipeName}</span>
        </p>
      </div>

      {/* Current tags */}
      {currentTags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Added</h4>
          <div className="flex flex-wrap gap-2">
            {currentTags.map((tag) => (
              <TagChip key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
            ))}
          </div>
        </div>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            Suggested
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1 rounded">AI</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 5).map(({ tag, confidence }) => (
              <button
                key={tag.id}
                onClick={() => addTag(tag.id)}
                disabled={isAdding}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: `${tag.color || '#64748b'}15`,
                  color: tag.color || '#64748b',
                  border: `1px solid ${tag.color || '#64748b'}30`,
                }}
              >
                + {tag.name}
                <span className="text-[10px] opacity-60">{Math.round(confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Popular tags */}
      {popularTags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Popular</h4>
          <div className="flex flex-wrap gap-2">
            {popularTags.slice(0, 6).map((tag) => (
              <button
                key={tag.id}
                onClick={() => addTag(tag.id)}
                disabled={isAdding}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: `${tag.color || '#64748b'}15`,
                  color: tag.color || '#64748b',
                  border: `1px solid ${tag.color || '#64748b'}30`,
                }}
              >
                + {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search / create */}
      <div>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreateAndAdd(); }}
            placeholder="Search or create tag..."
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 text-sm"
          />
          {canCreate && (
            <button
              onClick={handleCreateAndAdd}
              disabled={createTag.isPending}
              className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium rounded-lg hover:bg-cyan-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              + Create
            </button>
          )}
        </div>
        {searchQuery && !canCreate && filteredTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredTags.slice(0, 6).map((tag) => (
              <button
                key={tag.id}
                onClick={() => addTag(tag.id)}
                disabled={isAdding}
                className="hover:opacity-80 disabled:opacity-50"
              >
                <TagChip tag={tag} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Done / Skip */}
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
        <button
          onClick={onDone}
          className="px-5 py-2 text-sm font-medium rounded-lg transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
        >
          {currentTags.length > 0 ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
