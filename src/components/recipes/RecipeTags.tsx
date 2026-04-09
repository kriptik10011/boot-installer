/**
 * RecipeTags Component
 *
 * Displays and manages tags for a recipe with intelligence integration.
 *
 * Features:
 * - Display current tags with colors
 * - Add/remove tags
 * - AI-suggested tags with confidence indicators
 * - Quick-add popular tags
 * - Create new tags inline
 */

import { useState } from 'react';
import { useTagIntelligence, useTags, useCreateTag } from '@/hooks/useTags';
import type { RecipeTag } from '@/api/client';

interface RecipeTagsProps {
  recipeId: number;
  editable?: boolean;
  compact?: boolean;
}

export function RecipeTags({ recipeId, editable = true, compact = false }: RecipeTagsProps) {
  const {
    currentTags,
    suggestions,
    popularTags,
    isLoading,
    addTag,
    removeTag,
    isAdding,
    isRemoving,
  } = useTagIntelligence(recipeId);

  const [showTagManager, setShowTagManager] = useState(false);

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <div className="h-6 w-16 bg-slate-700 rounded animate-pulse" />
        <div className="h-6 w-20 bg-slate-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Current Tags */}
      <div className="flex flex-wrap gap-2">
        {currentTags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={editable ? () => removeTag(tag.id) : undefined}
            isRemoving={isRemoving}
          />
        ))}

        {editable && (
          <button
            onClick={() => setShowTagManager(true)}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            + Add Tag
          </button>
        )}

        {currentTags.length === 0 && !editable && (
          <span className="text-sm text-slate-500">No tags</span>
        )}
      </div>

      {/* Tag Manager Modal */}
      {showTagManager && (
        <TagManager
          recipeId={recipeId}
          currentTags={currentTags}
          suggestions={suggestions}
          popularTags={popularTags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onClose={() => setShowTagManager(false)}
          isAdding={isAdding}
        />
      )}
    </div>
  );
}

// Tag Chip Component
interface TagChipProps {
  tag: RecipeTag;
  onRemove?: () => void;
  isRemoving?: boolean;
  showCount?: boolean;
}

export function TagChip({ tag, onRemove, isRemoving, showCount }: TagChipProps) {
  const bgColor = tag.color || '#64748b'; // Default to slate-500

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
      style={{
        backgroundColor: `${bgColor}20`,
        color: bgColor,
        borderColor: `${bgColor}40`,
        borderWidth: '1px',
      }}
    >
      {tag.name}
      {showCount && tag.recipe_count > 0 && (
        <span className="text-[10px] opacity-70">({tag.recipe_count})</span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isRemoving}
          className="ml-1 hover:opacity-70 disabled:opacity-50"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

// Tag Manager Modal
interface TagManagerProps {
  recipeId: number;
  currentTags: RecipeTag[];
  suggestions: { tag: RecipeTag; confidence: number; reasoning: string }[];
  popularTags: RecipeTag[];
  onAddTag: (tagId: number) => void;
  onRemoveTag: (tagId: number) => void;
  onClose: () => void;
  isAdding: boolean;
}

function TagManager({
  recipeId,
  currentTags,
  suggestions,
  popularTags,
  onAddTag,
  onRemoveTag,
  onClose,
  isAdding,
}: TagManagerProps) {
  const { data: allTags = [] } = useTags();
  const createTag = useCreateTag();
  const [newTagName, setNewTagName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const currentTagIds = new Set(currentTags.map(t => t.id));

  // Filter tags for search
  const filteredTags = allTags.filter(
    tag => !currentTagIds.has(tag.id) &&
      tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const newTag = await createTag.mutateAsync({ name: newTagName.trim() });
      onAddTag(newTag.id);
      setNewTagName('');
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-4 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="font-medium text-white">Manage Tags</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Current Tags */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-2">Current Tags</h4>
            <div className="flex flex-wrap gap-2">
              {currentTags.length > 0 ? (
                currentTags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    onRemove={() => onRemoveTag(tag.id)}
                  />
                ))
              ) : (
                <span className="text-sm text-slate-500">No tags yet</span>
              )}
            </div>
          </div>

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                <span>Suggested Tags</span>
                <span className="text-xs text-cyan-400 bg-cyan-500/10 px-1.5 rounded">AI</span>
              </h4>
              <div className="space-y-2">
                {suggestions.slice(0, 3).map(({ tag, confidence, reasoning }) => (
                  <button
                    key={tag.id}
                    onClick={() => onAddTag(tag.id)}
                    disabled={isAdding}
                    className="w-full flex items-center justify-between p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <TagChip tag={tag} />
                      <span className="text-xs text-slate-400">{reasoning}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {Math.round(confidence * 100)}%
                      </span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular Tags */}
          {popularTags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">Popular Tags</h4>
              <div className="flex flex-wrap gap-2">
                {popularTags.slice(0, 6).map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => onAddTag(tag.id)}
                    disabled={isAdding}
                    className="hover:opacity-80 disabled:opacity-50"
                  >
                    <TagChip tag={tag} showCount />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search All Tags */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-2">Search Tags</h4>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 text-sm"
            />
            {searchQuery && (
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredTags.length > 0 ? (
                  filteredTags.slice(0, 8).map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => onAddTag(tag.id)}
                      disabled={isAdding}
                      className="hover:opacity-80 disabled:opacity-50"
                    >
                      <TagChip tag={tag} />
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No matching tags</span>
                )}
              </div>
            )}
          </div>

          {/* Create New Tag */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-2">Create New Tag</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag name..."
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTag();
                  }
                }}
              />
              <button
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || createTag.isPending}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact tag display (for lists)
interface CompactTagsProps {
  tags: RecipeTag[];
  maxVisible?: number;
}

export function CompactTags({ tags, maxVisible = 3 }: CompactTagsProps) {
  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  return (
    <div className="flex gap-1">
      {visibleTags.map((tag) => (
        <span
          key={tag.id}
          className="px-1.5 py-0.5 text-[10px] rounded"
          style={{
            backgroundColor: `${tag.color || '#64748b'}20`,
            color: tag.color || '#64748b',
          }}
        >
          {tag.name}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] text-slate-400 bg-slate-700 rounded">
          +{remainingCount}
        </span>
      )}
    </div>
  );
}
